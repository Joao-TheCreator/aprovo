"use server";
/** Phase 4 approval actions (social media side). Every action authenticates and scopes by workspace. */
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  approvalDecisions,
  approvalItems,
  approvalLinks,
  approvalRequests,
  mediaAssets,
  postMedia,
  posts,
} from "@/db/schema";
import { logActivity } from "@/lib/activity/log";
import { requireWorkspaceForProfile } from "@/lib/auth/require";
import { notifyEvent } from "@/lib/realtime/notify";
import type { ActionResult } from "@/lib/profiles/contracts";
import {
  APPROVAL_ERROR_MESSAGES,
  LINK_TTL_DAYS,
  createApprovalRequestSchema,
  issuePersonalLinkSchema,
  reopenApprovalRequestSchema,
  type ApprovalLinkMode,
  type CreateApprovalRequestInput,
  type CreateApprovalRequestResult,
  type IssuedLink,
  type RecipientInput,
  type ReopenApprovalRequestInput,
} from "./contracts";
import { APPROVAL_RULE, derivePostStatus } from "./decide";
import { hashToken, issueToken } from "./token";

function fail(code: string, message?: string) {
  return { ok: false as const, code, message: message ?? APPROVAL_ERROR_MESSAGES[code] ?? "Erro." };
}

function isNextNotFound(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

type Member = Awaited<ReturnType<typeof requireWorkspaceForProfile>>;

async function memberForProfile(profileId: string): Promise<Member | null> {
  try {
    return await requireWorkspaceForProfile(profileId);
  } catch (e) {
    if (isNextNotFound(e)) return null;
    throw e;
  }
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

function revalidateApprovals(profileId: string) {
  revalidatePath(`/perfis/${profileId}`);
  revalidatePath(`/perfis/${profileId}/aprovacoes`);
  revalidatePath("/aprovacoes");
}

function baseUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

type NewLinkSpec = {
  mode: ApprovalLinkMode;
  recipientName?: string | null;
  recipientContact?: string | null;
  label?: string | null;
};

function newLinkValues(requestId: string, spec: NewLinkSpec) {
  const token = issueToken();
  const expiresAt = new Date(Date.now() + LINK_TTL_DAYS * 86_400_000);
  return {
    token,
    expiresAt,
    mode: spec.mode,
    recipientName: spec.mode === "personal" ? spec.recipientName || null : null,
    values: {
      requestId,
      tokenHash: hashToken(token),
      mode: spec.mode,
      label: spec.label || null,
      recipientName: spec.mode === "personal" ? spec.recipientName || null : null,
      recipientContact: spec.mode === "personal" ? spec.recipientContact || null : null,
      expiresAt,
    },
  };
}

function issuedOf(l: ReturnType<typeof newLinkValues>, linkId: string): IssuedLink {
  return {
    linkId,
    recipientName: l.recipientName,
    mode: l.mode,
    url: `${baseUrl()}/a/${l.token}`,
    expiresAt: l.expiresAt,
  };
}

/**
 * Sends posts for approval: creates the request, moves posts to pending_approval and issues one
 * personal link per recipient (or a single shared link).
 */
export async function createApprovalRequest(
  input: CreateApprovalRequestInput,
): Promise<CreateApprovalRequestResult> {
  const parsed = createApprovalRequestSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input", parsed.error.issues[0]?.message);
  const { profileId, title, message, label, mode } = parsed.data;
  const recipients: RecipientInput[] = mode === "personal" ? parsed.data.recipients : [];
  const postIds = [...new Set(parsed.data.postIds)];
  const member = await memberForProfile(profileId);
  if (!member) return fail("not_found");

  const rows = await db
    .select()
    .from(posts)
    .where(
      and(inArray(posts.id, postIds), eq(posts.profileId, profileId), isNull(posts.archivedAt)),
    );
  if (rows.length !== postIds.length) return fail("not_found", "Publicação não encontrada.");
  if (rows.some((p) => p.status === "published")) return fail("published_locked");
  if (rows.some((p) => p.status !== "draft" && p.status !== "changes_requested")) {
    return fail("invalid_status");
  }

  const media = await db
    .select({ postId: postMedia.postId, status: mediaAssets.status })
    .from(postMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.assetId))
    .where(inArray(postMedia.postId, postIds));
  const byPost = new Map<string, string[]>();
  for (const m of media) byPost.set(m.postId, [...(byPost.get(m.postId) ?? []), m.status]);
  for (const id of postIds) {
    const st = byPost.get(id);
    if (!st || st.length === 0 || st.some((s) => s !== "ready")) return fail("no_ready_media");
  }

  const actor = `user:${member.user.id}` as const;
  const newLinks =
    mode === "personal"
      ? recipients.map((r) =>
          newLinkValues("", {
            mode,
            recipientName: r.name,
            recipientContact: r.contact,
            label,
          }),
        )
      : [newLinkValues("", { mode, label })];
  const result = await db.transaction(async (tx) => {
    const [req] = await tx
      .insert(approvalRequests)
      .values({
        profileId,
        createdBy: member.user.id,
        title: title || null,
        message: message || null,
        status: "open",
      })
      .returning({ id: approvalRequests.id });
    await tx.insert(approvalItems).values(postIds.map((postId) => ({ requestId: req.id, postId })));
    const inserted: string[] = [];
    for (const nl of newLinks) {
      const [l] = await tx
        .insert(approvalLinks)
        .values({ ...nl.values, requestId: req.id })
        .returning({ id: approvalLinks.id });
      inserted.push(l.id);
    }
    const now = new Date();
    await tx
      .update(posts)
      .set({ status: "pending_approval", sentForApprovalAt: now, updatedAt: now })
      .where(inArray(posts.id, postIds));
    for (const postId of postIds) {
      await logActivity(tx, {
        profileId,
        actor,
        event: "approval.sent",
        payload: { postId, requestId: req.id },
      });
    }
    await logActivity(tx, {
      profileId,
      actor,
      event: "approval.request_created",
      payload: { requestId: req.id, linkId: inserted[0], linkIds: inserted, mode, postIds },
    });
    return { requestId: req.id, linkIds: inserted };
  });

  revalidateApprovals(profileId);
  const links = newLinks.map((nl, i) => issuedOf(nl, result.linkIds[i]));
  return {
    ok: true,
    data: {
      requestId: result.requestId,
      linkId: links[0].linkId,
      url: links[0].url,
      expiresAt: links[0].expiresAt,
      links,
    },
  };
}

async function loadRequest(requestId: string) {
  if (!UUID_RE.test(requestId)) return null;
  const [req] = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.id, requestId))
    .limit(1);
  if (!req) return null;
  const member = await memberForProfile(req.profileId);
  return member ? { req, member } : null;
}

async function issueLink(
  requestId: string,
  spec: NewLinkSpec,
): Promise<CreateApprovalRequestResult> {
  const loaded = await loadRequest(requestId);
  if (!loaded) return fail("not_found");
  const { req, member } = loaded;
  if (req.status !== "open" && req.status !== "partially_decided") return fail("link_inactive");
  const link = newLinkValues(req.id, spec);
  const [l] = await db
    .insert(approvalLinks)
    .values(link.values)
    .returning({ id: approvalLinks.id });
  await logActivity(db, {
    profileId: req.profileId,
    actor: `user:${member.user.id}`,
    event: "approval.link_issued",
    payload: { requestId: req.id, linkId: l.id, mode: link.mode },
  });
  revalidateApprovals(req.profileId);
  const issued = issuedOf(link, l.id);
  return {
    ok: true,
    data: {
      requestId: req.id,
      linkId: issued.linkId,
      url: issued.url,
      expiresAt: issued.expiresAt,
      links: [issued],
    },
  };
}

/** Issues an additional personal link (one more recipient) for an open request. */
export async function issuePersonalLink(
  requestId: string,
  recipient: RecipientInput,
): Promise<CreateApprovalRequestResult> {
  const parsed = issuePersonalLinkSchema.safeParse(recipient);
  if (!parsed.success) return fail("invalid_input", parsed.error.issues[0]?.message);
  return issueLink(requestId, {
    mode: "personal",
    recipientName: parsed.data.name,
    recipientContact: parsed.data.contact,
  });
}

/** Issues an additional shared (open) link. Prefer `issuePersonalLink`. */
export async function issueApprovalLink(
  requestId: string,
  label?: string,
): Promise<CreateApprovalRequestResult> {
  return issueLink(requestId, { mode: "shared", label: label?.trim().slice(0, 80) });
}

const nameKey = (name: string | null | undefined) => (name ?? "").trim().toLowerCase();

type ReopenOutcome =
  { ok: true; links: IssuedLink[] } | { ok: false; code: string; message?: string };

/**
 * Reopens a decided (or partially decided) request for a new round of decisions, keeping the
 * decision history in the same request (doc 13 section 4).
 *
 * Why new links are mandatory: a personal link counts a decision made by the SAME link as
 * "already decided" regardless of `sent_for_approval_at` (unique index request+link+post), so an
 * old link could never decide a reopened item again. Each recipient therefore gets a NEW link and
 * the old still-active link of the same person is superseded (`used_reason = superseded`).
 */
export async function reopenApprovalRequest(
  input: ReopenApprovalRequestInput,
): Promise<CreateApprovalRequestResult> {
  const parsed = reopenApprovalRequestSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input", parsed.error.issues[0]?.message);
  const { requestId, recipients } = parsed.data;
  const postIds = [...new Set(parsed.data.postIds)];
  const loaded = await loadRequest(requestId);
  if (!loaded) return fail("not_found");
  const { req, member } = loaded;
  const actor = `user:${member.user.id}` as const;

  const newLinks = recipients.map((r) =>
    newLinkValues(req.id, { mode: "personal", recipientName: r.name, recipientContact: r.contact }),
  );
  const now = new Date();

  const outcome = await db.transaction(async (tx): Promise<ReopenOutcome> => {
    const [locked] = await tx
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, req.id))
      .for("update");
    if (!locked) return { ok: false, code: "not_found" };
    if (locked.status === "revoked") return { ok: false, code: "request_revoked" };

    const items = await tx
      .select({ post: posts })
      .from(approvalItems)
      .innerJoin(posts, eq(posts.id, approvalItems.postId))
      .where(eq(approvalItems.requestId, req.id))
      .orderBy(asc(posts.id))
      .for("update", { of: posts });
    const byId = new Map(items.map((i) => [i.post.id, i.post]));
    if (postIds.some((id) => !byId.has(id))) {
      return { ok: false, code: "not_found", message: "Publicação não encontrada neste envio." };
    }
    const reopened = postIds.map((id) => byId.get(id)!);
    if (reopened.some((p) => p.status === "published" || p.status === "scheduled")) {
      return {
        ok: false,
        code: "invalid_status",
        message: "Publicações agendadas ou publicadas não podem ser reabertas.",
      };
    }
    const media = await tx
      .select({ postId: postMedia.postId, status: mediaAssets.status })
      .from(postMedia)
      .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.assetId))
      .where(inArray(postMedia.postId, postIds));
    for (const id of postIds) {
      const st = media.filter((m) => m.postId === id);
      if (st.length === 0 || st.some((m) => m.status !== "ready")) {
        return { ok: false, code: "no_ready_media" };
      }
    }

    // New links first, so the superseded ones can point at them.
    const linkIds: string[] = [];
    for (const nl of newLinks) {
      const [l] = await tx
        .insert(approvalLinks)
        .values(nl.values)
        .returning({ id: approvalLinks.id });
      linkIds.push(l.id);
    }
    const activeOld = await tx
      .select()
      .from(approvalLinks)
      .where(
        and(
          eq(approvalLinks.requestId, req.id),
          eq(approvalLinks.mode, "personal"),
          isNull(approvalLinks.revokedAt),
          isNull(approvalLinks.usedAt),
          gt(approvalLinks.expiresAt, now),
        ),
      );
    for (let i = 0; i < recipients.length; i++) {
      const key = nameKey(recipients[i].name);
      const oldIds = activeOld
        .filter((l) => nameKey(l.recipientName) === key && !linkIds.includes(l.id))
        .map((l) => l.id);
      if (oldIds.length === 0) continue;
      await tx
        .update(approvalLinks)
        .set({
          usedAt: now,
          usedReason: "superseded",
          supersededByLinkId: linkIds[i],
          updatedAt: now,
        })
        .where(inArray(approvalLinks.id, oldIds));
    }

    await tx
      .update(posts)
      .set({ status: "pending_approval", sentForApprovalAt: now, approvedAt: null, updatedAt: now })
      .where(inArray(posts.id, postIds));

    // Request status: items not reopened keep their decisions.
    const reopenedSet = new Set(postIds);
    const kept = items.filter((i) => !reopenedSet.has(i.post.id));
    let anyFinal = false;
    if (kept.length > 0) {
      const decisions = await tx
        .select({
          postId: approvalDecisions.postId,
          linkId: approvalDecisions.linkId,
          decision: approvalDecisions.decision,
          decidedAt: approvalDecisions.decidedAt,
        })
        .from(approvalDecisions)
        .where(eq(approvalDecisions.requestId, req.id));
      const recipientIds =
        APPROVAL_RULE === "all"
          ? (
              await tx
                .select({ id: approvalLinks.id })
                .from(approvalLinks)
                .where(
                  and(
                    eq(approvalLinks.requestId, req.id),
                    eq(approvalLinks.mode, "personal"),
                    isNull(approvalLinks.revokedAt),
                    isNull(approvalLinks.supersededByLinkId),
                  ),
                )
            ).map((l) => l.id)
          : [];
      anyFinal = kept.some(
        ({ post }) =>
          derivePostStatus(
            decisions.filter((d) => d.postId === post.id),
            post.sentForApprovalAt,
            APPROVAL_RULE,
            recipientIds,
          ) !== "pending_approval",
      );
    }
    await tx
      .update(approvalRequests)
      .set({ status: anyFinal ? "partially_decided" : "open", updatedAt: now })
      .where(eq(approvalRequests.id, req.id));

    await logActivity(tx, {
      profileId: req.profileId,
      actor,
      event: "approval.reopened",
      payload: { requestId: req.id, postIds, linkIds },
    });
    for (const [i, nl] of newLinks.entries()) {
      await logActivity(tx, {
        profileId: req.profileId,
        actor,
        event: "approval.link_issued",
        payload: { requestId: req.id, linkId: linkIds[i], mode: nl.mode },
      });
    }
    for (const postId of postIds) {
      await notifyEvent(tx, {
        type: "post.status",
        profileId: req.profileId,
        postId,
        status: "pending_approval",
        decision: null,
        at: now.toISOString(),
      });
    }
    return { ok: true, links: newLinks.map((nl, i) => issuedOf(nl, linkIds[i])) };
  });

  if (!outcome.ok) return fail(outcome.code, outcome.message);
  revalidateApprovals(req.profileId);
  const links = outcome.links;
  return {
    ok: true,
    data: {
      requestId: req.id,
      linkId: links[0].linkId,
      url: links[0].url,
      expiresAt: links[0].expiresAt,
      links,
    },
  };
}

export async function revokeApprovalLink(linkId: string): Promise<ActionResult> {
  if (!UUID_RE.test(linkId)) return fail("not_found");
  const [link] = await db.select().from(approvalLinks).where(eq(approvalLinks.id, linkId)).limit(1);
  if (!link) return fail("not_found");
  const loaded = await loadRequest(link.requestId);
  if (!loaded) return fail("not_found");
  const now = new Date();
  await db
    .update(approvalLinks)
    .set({ revokedAt: now, updatedAt: now })
    .where(and(eq(approvalLinks.id, linkId), isNull(approvalLinks.revokedAt)));
  await logActivity(db, {
    profileId: loaded.req.profileId,
    actor: `user:${loaded.member.user.id}`,
    event: "approval.link_revoked",
    payload: { requestId: link.requestId, linkId },
  });
  revalidateApprovals(loaded.req.profileId);
  return { ok: true, data: undefined };
}

/** Cancels an open request: posts still pending go back to draft. */
export async function cancelApprovalRequest(requestId: string): Promise<ActionResult> {
  const loaded = await loadRequest(requestId);
  if (!loaded) return fail("not_found");
  const { req, member } = loaded;
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(approvalRequests)
      .set({ status: "revoked", updatedAt: now })
      .where(eq(approvalRequests.id, req.id));
    await tx
      .update(approvalLinks)
      .set({ revokedAt: now, updatedAt: now })
      .where(and(eq(approvalLinks.requestId, req.id), isNull(approvalLinks.revokedAt)));
    const items = await tx
      .select({ postId: approvalItems.postId })
      .from(approvalItems)
      .where(eq(approvalItems.requestId, req.id));
    const ids = items.map((i) => i.postId);
    if (ids.length) {
      await tx
        .update(posts)
        .set({ status: "draft", updatedAt: now })
        .where(and(inArray(posts.id, ids), eq(posts.status, "pending_approval")));
    }
    await logActivity(tx, {
      profileId: req.profileId,
      actor: `user:${member.user.id}`,
      event: "approval.cancelled",
      payload: { requestId: req.id },
    });
  });
  revalidateApprovals(req.profileId);
  return { ok: true, data: undefined };
}
