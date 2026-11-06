import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  approvalDecisions,
  approvalItems,
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
import { resolveLink } from "./decide";

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

/** Latest decision per post for one request. */
async function lastDecisions(requestId: string): Promise<Map<string, DecisionRow>> {
  const rows = await db
    .select()
    .from(approvalDecisions)
    .where(eq(approvalDecisions.requestId, requestId))
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

/** Public, token-based (server only). Increments opened_count when `recordOpen` is true. */
export async function getPublicApproval(
  token: string,
  opts: { recordOpen?: boolean } = {},
): Promise<PublicApprovalView> {
  const empty = (linkState: PublicApprovalView["linkState"]): PublicApprovalView => ({
    linkState,
    request: null,
    profile: null,
    feedItems: [],
    items: [],
  });
  const resolved = await resolveLink(token);
  if (resolved.state !== "active") return empty(resolved.state);
  const { link, request } = resolved;

  if (opts.recordOpen) {
    const now = new Date();
    await db.transaction(async (tx) => {
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
  const decisions = await lastDecisions(request.id);

  return {
    linkState: "active",
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

  const linkLabel = new Map(links.map((l) => [l.id, l.label]));
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
        decidedViaLink: d ? (linkLabel.get(d.linkId) ?? null) : null,
      };
    });
    const approved = summaries.filter((s) => s.decision?.decision === "approved").length;
    const changes = summaries.filter((s) => s.decision?.decision === "changes_requested").length;
    const reqLinks: ApprovalLinkSummary[] = links
      .filter((l) => l.requestId === request.id)
      .map((l) => ({
        id: l.id,
        label: l.label,
        expiresAt: l.expiresAt,
        revokedAt: l.revokedAt,
        openedCount: l.openedCount,
        lastOpenedAt: l.lastOpenedAt,
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
