import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  approvalDecisions,
  approvalItems,
  approvalLinkOpens,
  approvalLinks,
  approvalRequests,
  mediaAssets,
  postMedia,
  posts,
  profiles,
  users,
} from "@/db/schema";
import { logActivity } from "@/lib/activity/log";
import { getCurrentWorkspace, requireUser, requireWorkspaceForProfile } from "@/lib/auth/require";
import { assetUrls } from "@/lib/media/urls";
import { buildProfileFeed } from "@/lib/profiles/feed";
import { notifyEvent } from "@/lib/realtime/notify";
import { getStorage } from "@/lib/storage";
import type {
  ApprovalLinkSummary,
  ApprovalRequestSummary,
  DecisionRecord,
  PublicApprovalView,
} from "./contracts";
import { APPROVAL_RULE, derivePostStatus, resolveLink } from "./decide";

const UUID_RE = /^[0-9a-f-]{36}$/i;

function isNextNotFound(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

async function sign(key: string | null | undefined): Promise<string | null> {
  if (!key) return null;
  try {
    return await getStorage().getSignedUrl(key, 3600);
  } catch {
    return null;
  }
}

type DecisionRow = typeof approvalDecisions.$inferSelect;

function toRecord(d: DecisionRow): DecisionRecord {
  return {
    decision: d.decision,
    comment: d.comment,
    approverName: d.approverName,
    decidedAt: d.decidedAt,
  };
}

/** Latest decision per post for one request (optionally only those of one link). */
async function lastDecisions(
  requestId: string,
  linkId?: string,
): Promise<Map<string, DecisionRow>> {
  const rows = await db
    .select()
    .from(approvalDecisions)
    .where(
      and(
        eq(approvalDecisions.requestId, requestId),
        linkId ? eq(approvalDecisions.linkId, linkId) : undefined,
      ),
    )
    .orderBy(asc(approvalDecisions.decidedAt));
  const map = new Map<string, DecisionRow>();
  for (const r of rows) map.set(r.postId, r);
  return map;
}

function senderName(u: { name: string | null; email: string | null } | undefined): string {
  if (u?.name) return u.name;
  if (u?.email) return u.email.split("@")[0];
  return "Seu social media";
}

/**
 * Public, token-based (server only). When `recordOpen` is true, counts the open and stores
 * ip/user agent in `approval_link_opens` (active and used links only).
 */
export async function getPublicApproval(
  token: string,
  opts: { recordOpen?: boolean; ip?: string | null; userAgent?: string | null } = {},
): Promise<PublicApprovalView> {
  const empty = (linkState: PublicApprovalView["linkState"]): PublicApprovalView => ({
    linkState,
    recipientName: null,
    mode: "personal",
    readOnly: false,
    request: null,
    profile: null,
    feedItems: [],
    items: [],
  });
  const resolved = await resolveLink(token);
  if (resolved.state === "not_found") return empty("not_found");
  if (resolved.state !== "active" && resolved.state !== "used") return empty(resolved.state);
  const { link, request } = resolved;
  const used = resolved.state === "used";

  if (opts.recordOpen) {
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.insert(approvalLinkOpens).values({
        linkId: link.id,
        openedAt: now,
        ip: opts.ip ?? null,
        userAgent: opts.userAgent?.slice(0, 500) ?? null,
        linkState: resolved.state,
      });
      await tx
        .update(approvalLinks)
        .set({ openedCount: sql`${approvalLinks.openedCount} + 1`, lastOpenedAt: now })
        .where(eq(approvalLinks.id, link.id));
      await logActivity(tx, {
        profileId: request.profileId,
        actor: `link:${link.id}`,
        event: "link.opened",
        payload: { linkId: link.id, requestId: request.id },
      });
      await notifyEvent(tx, {
        type: "link.opened",
        profileId: request.profileId,
        linkId: link.id,
        at: now.toISOString(),
      });
    });
  }

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, request.profileId));
  const [creator] = request.createdBy
    ? await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, request.createdBy))
        .limit(1)
    : [];
  const feed = await buildProfileFeed(request.profileId);

  const items = await db
    .select({ post: posts })
    .from(approvalItems)
    .innerJoin(posts, eq(posts.id, approvalItems.postId))
    .where(eq(approvalItems.requestId, request.id))
    .orderBy(asc(posts.position));
  const postIds = items.map((i) => i.post.id);
  const mediaRows = postIds.length
    ? await db
        .select({
          postId: postMedia.postId,
          asset: mediaAssets,
          sortOrder: postMedia.sortOrder,
          gridCrop: postMedia.gridCrop,
        })
        .from(postMedia)
        .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.assetId))
        .where(inArray(postMedia.postId, postIds))
        .orderBy(asc(postMedia.sortOrder))
    : [];
  const urls = await assetUrls(mediaRows.map((m) => m.asset));
  const mediaByPost = new Map<string, PublicApprovalView["items"][number]["media"]>();
  mediaRows.forEach((m, i) => {
    const list = mediaByPost.get(m.postId) ?? [];
    list.push({ ...urls[i], sortOrder: m.sortOrder, gridCrop: m.gridCrop });
    mediaByPost.set(m.postId, list);
  });
  // Personal links show (and lock) only their own decisions; shared links show the latest of any link.
  const decisions = await lastDecisions(request.id, link.mode === "personal" ? link.id : undefined);

  return {
    linkState: used ? "used" : "active",
    recipientName: link.recipientName,
    mode: link.mode,
    readOnly: used,
    request: {
      id: request.id,
      title: request.title,
      message: request.message,
      createdAt: request.createdAt,
      expiresAt: link.expiresAt,
      senderName: senderName(creator),
    },
    profile: {
      igUsername: profile.igUsername,
      displayName: profile.displayName,
      avatarUrl: feed?.profile.avatarUrl ?? null,
      gridRatio: profile.gridRatio,
    },
    feedItems: feed?.items ?? [],
    items: items.map(({ post }) => ({
      postId: post.id,
      kind: post.kind,
      status: post.status,
      caption: post.caption,
      hashtags: post.hashtags,
      scheduledFor: post.scheduledFor,
      media: mediaByPost.get(post.id) ?? [],
      decision: decisions.has(post.id) ? toRecord(decisions.get(post.id)!) : null,
    })),
  };
}

type RequestRow = typeof approvalRequests.$inferSelect;
type ProfileRow = typeof profiles.$inferSelect;

async function summarize(
  rows: Array<{ request: RequestRow; profile: ProfileRow }>,
): Promise<ApprovalRequestSummary[]> {
  if (rows.length === 0) return [];
  const reqIds = rows.map((r) => r.request.id);

  const links = await db
    .select()
    .from(approvalLinks)
    .where(inArray(approvalLinks.requestId, reqIds))
    .orderBy(asc(approvalLinks.createdAt));
  const items = await db
    .select({ requestId: approvalItems.requestId, post: posts })
    .from(approvalItems)
    .innerJoin(posts, eq(posts.id, approvalItems.postId))
    .where(inArray(approvalItems.requestId, reqIds))
    .orderBy(asc(posts.position));
  const postIds = [...new Set(items.map((i) => i.post.id))];
  const thumbRows = postIds.length
    ? await db
        .select({ postId: postMedia.postId, thumbPath: mediaAssets.thumbPath })
        .from(postMedia)
        .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.assetId))
        .where(inArray(postMedia.postId, postIds))
        .orderBy(asc(postMedia.sortOrder))
    : [];
  const thumbPath = new Map<string, string | null>();
  for (const t of thumbRows) if (!thumbPath.has(t.postId)) thumbPath.set(t.postId, t.thumbPath);
  const decRows = await db
    .select()
    .from(approvalDecisions)
    .where(inArray(approvalDecisions.requestId, reqIds))
    .orderBy(asc(approvalDecisions.decidedAt));
  const decByKey = new Map<string, DecisionRow>();
  for (const d of decRows) decByKey.set(`${d.requestId}:${d.postId}`, d);

  const linkName = new Map(links.map((l) => [l.id, l.recipientName ?? l.label]));
  const linkIds = links.map((l) => l.id);
  const ranked = db
    .select({
      linkId: approvalLinkOpens.linkId,
      openedAt: approvalLinkOpens.openedAt,
      ip: approvalLinkOpens.ip,
      userAgent: approvalLinkOpens.userAgent,
      rn: sql<number>`row_number() over (partition by ${approvalLinkOpens.linkId} order by ${approvalLinkOpens.openedAt} desc)`.as(
        "rn",
      ),
    })
    .from(approvalLinkOpens)
    .where(inArray(approvalLinkOpens.linkId, linkIds.length ? linkIds : [""]))
    .as("ranked");
  const openRows = linkIds.length
    ? await db.select().from(ranked).where(lte(ranked.rn, 20)).orderBy(desc(ranked.openedAt))
    : [];
  const opensByLink = new Map<string, ApprovalLinkSummary["opens"]>();
  for (const o of openRows) {
    const list = opensByLink.get(o.linkId) ?? [];
    list.push({ openedAt: o.openedAt, ip: o.ip, userAgent: o.userAgent });
    opensByLink.set(o.linkId, list);
  }
  const avatarPaths = await db
    .select({ id: profiles.id, thumbPath: mediaAssets.thumbPath })
    .from(profiles)
    .innerJoin(mediaAssets, eq(mediaAssets.id, profiles.avatarAssetId))
    .where(inArray(profiles.id, [...new Set(rows.map((r) => r.profile.id))]));
  const avatarByProfile = new Map<string, string | null>();
  for (const a of avatarPaths) avatarByProfile.set(a.id, await sign(a.thumbPath));

  const thumbUrls = new Map<string, string | null>();
  for (const [postId, path] of thumbPath) thumbUrls.set(postId, await sign(path));

  return rows.map(({ request, profile }) => {
    const its = items.filter((i) => i.requestId === request.id);
    const summaries = its.map(({ post }) => {
      const d = decByKey.get(`${request.id}:${post.id}`);
      return {
        postId: post.id,
        kind: post.kind,
        thumbUrl: thumbUrls.get(post.id) ?? null,
        caption: post.caption,
        status: post.status,
        decision: d ? toRecord(d) : null,
        decidedViaLink: d ? (linkName.get(d.linkId) ?? null) : null,
      };
    });
    const reqRecipients = links
      .filter((l) => l.requestId === request.id && l.mode === "personal" && !l.revokedAt)
      .map((l) => l.id);
    const derived = its.map(({ post }) =>
      derivePostStatus(
        decRows.filter((d) => d.requestId === request.id && d.postId === post.id),
        post.sentForApprovalAt,
        APPROVAL_RULE,
        reqRecipients,
      ),
    );
    const approved = derived.filter((d) => d === "approved").length;
    const changes = derived.filter((d) => d === "changes_requested").length;
    const reqLinks: ApprovalLinkSummary[] = links
      .filter((l) => l.requestId === request.id)
      .map((l) => ({
        id: l.id,
        label: l.label,
        expiresAt: l.expiresAt,
        revokedAt: l.revokedAt,
        openedCount: l.openedCount,
        lastOpenedAt: l.lastOpenedAt,
        mode: l.mode,
        recipientName: l.recipientName,
        recipientContact: l.recipientContact,
        usedAt: l.usedAt,
        usedReason: l.usedReason,
        opens: opensByLink.get(l.id) ?? [],
        decisions: decRows
          .filter((d) => d.linkId === l.id)
          .map((d) => ({ postId: d.postId, decision: d.decision, decidedAt: d.decidedAt })),
      }));
    return {
      id: request.id,
      title: request.title,
      message: request.message,
      status: request.status,
      createdAt: request.createdAt,
      profile: {
        id: profile.id,
        igUsername: profile.igUsername,
        avatarUrl: avatarByProfile.get(profile.id) ?? null,
      },
      counts: {
        items: summaries.length,
        approved,
        changes,
        pending: summaries.length - approved - changes,
      },
      links: reqLinks,
      items: summaries,
    };
  });
}

/** Requests of one profile (or of all profiles in the workspace when profileId is omitted), newest first. */
export async function listApprovalRequests(profileId?: string): Promise<ApprovalRequestSummary[]> {
  const user = await requireUser();
  let workspaceId: string;
  if (profileId) {
    if (!UUID_RE.test(profileId)) return [];
    const m = await requireWorkspaceForProfile(profileId);
    workspaceId = m.workspaceId;
  } else {
    const ws = await getCurrentWorkspace(user.id!);
    if (!ws) return [];
    workspaceId = ws.id;
  }
  const rows = await db
    .select({ request: approvalRequests, profile: profiles })
    .from(approvalRequests)
    .innerJoin(profiles, eq(profiles.id, approvalRequests.profileId))
    .where(
      profileId
        ? and(eq(profiles.workspaceId, workspaceId), eq(profiles.id, profileId))
        : eq(profiles.workspaceId, workspaceId),
    )
    .orderBy(desc(approvalRequests.createdAt));
  return summarize(rows);
}

export async function getApprovalRequest(
  requestId: string,
): Promise<ApprovalRequestSummary | null> {
  if (!UUID_RE.test(requestId)) return null;
  const [row] = await db
    .select({ request: approvalRequests, profile: profiles })
    .from(approvalRequests)
    .innerJoin(profiles, eq(profiles.id, approvalRequests.profileId))
    .where(eq(approvalRequests.id, requestId))
    .limit(1);
  if (!row) return null;
  try {
    await requireWorkspaceForProfile(row.profile.id);
  } catch (e) {
    if (isNextNotFound(e)) return null;
    throw e;
  }
  return (await summarize([row]))[0] ?? null;
}
