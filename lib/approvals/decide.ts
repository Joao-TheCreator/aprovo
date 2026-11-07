import { and, asc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { db, type Database } from "@/db/client";
import {
  approvalDecisions,
  approvalItems,
  approvalLinks,
  approvalRequests,
  posts,
  profiles,
  users,
} from "@/db/schema";
import { logActivity } from "@/lib/activity/log";
import { sendDecisionEmail } from "@/lib/email/send";
import type { PostStatus } from "@/lib/profiles/contracts";
import type { DecidedPayload } from "@/lib/realtime/events";
import { notifyEvent } from "@/lib/realtime/notify";
import {
  APPROVAL_ERROR_MESSAGES,
  type DecideInput,
  type DecideManyInput,
  type DecideManyItemResult,
  type DecideManyResult,
  type DecideResult,
  type DecisionRecord,
} from "./contracts";
import { hashToken } from "./token";

export type LinkRow = typeof approvalLinks.$inferSelect;
export type RequestRow = typeof approvalRequests.$inferSelect;
type PostRow = typeof posts.$inferSelect;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Rule for posts with more than one recipient. Fixed to "any" (basta um); "all" is kept for the tests/future. */
export type ApprovalRule = "any" | "all";
export const APPROVAL_RULE: ApprovalRule = "any";

/** Resolves a token to its link and request; state tells why it is unusable. Precedence: revoked, used, expired, active. */
export async function resolveLink(
  token: string,
): Promise<
  | { state: "not_found" }
  | { state: "active" | "used" | "expired" | "revoked"; link: LinkRow; request: RequestRow }
> {
  if (!token || token.length > 200) return { state: "not_found" };
  const [row] = await db
    .select({ link: approvalLinks, request: approvalRequests })
    .from(approvalLinks)
    .innerJoin(approvalRequests, eq(approvalRequests.id, approvalLinks.requestId))
    .where(eq(approvalLinks.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return { state: "not_found" };
  const { link, request } = row;
  if (link.revokedAt || request.status === "revoked") return { state: "revoked", link, request };
  if (link.usedAt) return { state: "used", link, request };
  if (link.expiresAt.getTime() <= Date.now()) return { state: "expired", link, request };
  return { state: "active", link, request };
}

function fail(code: string): { ok: false; code: string; message: string } {
  return { ok: false, code, message: APPROVAL_ERROR_MESSAGES[code] ?? "Erro." };
}

/** HTTP status + error code for a link that cannot decide. */
function inactiveFailure(state: "not_found" | "used" | "expired" | "revoked") {
  switch (state) {
    case "used":
      return { status: 410, result: fail("link_used") };
    case "expired":
      return { status: 410, result: fail("link_expired") };
    case "revoked":
      return { status: 410, result: fail("link_revoked") };
    default:
      return { status: 404, result: fail("link_inactive") };
  }
}

type DecisionFact = {
  linkId: string;
  decision: "approved" | "changes_requested";
  decidedAt: Date;
};

/**
 * Post status from the current decisions (those at or after the last send for approval).
 * "Changes requested" always wins. Otherwise `any` approves on the first approval and `all` waits
 * until every id in `recipientLinkIds` (or, when empty, every link that decided) has approved.
 */
export function derivePostStatus(
  decisions: DecisionFact[],
  sentForApprovalAt: Date | null,
  rule: ApprovalRule = "any",
  recipientLinkIds: string[] = [],
): "approved" | "changes_requested" | "pending_approval" {
  const current = decisions.filter(
    (d) => !sentForApprovalAt || d.decidedAt.getTime() >= sentForApprovalAt.getTime(),
  );
  if (current.some((d) => d.decision === "changes_requested")) return "changes_requested";
  const approvedBy = new Set(current.filter((d) => d.decision === "approved").map((d) => d.linkId));
  if (approvedBy.size === 0) return "pending_approval";
  if (rule === "any") return "approved";
  const required =
    recipientLinkIds.length > 0 ? recipientLinkIds : [...new Set(current.map((d) => d.linkId))];
  return required.every((id) => approvedBy.has(id)) ? "approved" : "pending_approval";
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

/**
 * Items already settled for a personal link: decided in the current round (at or after the post's
 * `sent_for_approval_at`) BEFORE the link was created. Such a link shows them locked and never has
 * to decide them (doc 13 section 4). Latest settled decision per post. Shared links settle nothing.
 */
export async function settledItemsForLink(
  exec: Pick<Tx, "select">,
  requestId: string,
  link: Pick<LinkRow, "mode" | "createdAt">,
): Promise<Map<string, DecisionRow>> {
  const map = new Map<string, DecisionRow>();
  if (link.mode !== "personal") return map;
  const rows = await exec
    .select({ decision: approvalDecisions })
    .from(approvalDecisions)
    .innerJoin(posts, eq(posts.id, approvalDecisions.postId))
    .where(
      and(
        eq(approvalDecisions.requestId, requestId),
        lt(approvalDecisions.decidedAt, link.createdAt),
        or(
          isNull(posts.sentForApprovalAt),
          gte(approvalDecisions.decidedAt, posts.sentForApprovalAt),
        ),
      ),
    )
    .orderBy(asc(approvalDecisions.decidedAt));
  for (const r of rows) map.set(r.decision.postId, r.decision);
  return map;
}

/** Locks the link row and re-reads its state (serializes concurrent decisions of the same link). */
async function lockLink(tx: Tx, linkId: string, now: Date) {
  const [fresh] = await tx
    .select()
    .from(approvalLinks)
    .where(eq(approvalLinks.id, linkId))
    .for("update");
  if (!fresh) return { state: "not_found" as const };
  if (fresh.revokedAt) return { state: "revoked" as const };
  if (fresh.usedAt) return { state: "used" as const };
  if (fresh.expiresAt.getTime() <= now.getTime()) return { state: "expired" as const };
  return { state: "active" as const, link: fresh };
}

/** Ids of the personal links that still count as recipients of the request (for the "all" rule). */
async function recipientLinkIds(tx: Tx, requestId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: approvalLinks.id })
    .from(approvalLinks)
    .where(
      and(
        eq(approvalLinks.requestId, requestId),
        eq(approvalLinks.mode, "personal"),
        isNull(approvalLinks.revokedAt),
        isNull(approvalLinks.supersededByLinkId),
      ),
    );
  return rows.map((r) => r.id);
}

/** Recomputes `approval_requests.status` from the per-item derived statuses. */
async function refreshRequestStatus(tx: Tx, requestId: string, now: Date): Promise<void> {
  const items = await tx
    .select({ postId: approvalItems.postId, sentAt: posts.sentForApprovalAt })
    .from(approvalItems)
    .innerJoin(posts, eq(posts.id, approvalItems.postId))
    .where(eq(approvalItems.requestId, requestId));
  const decisions = await tx
    .select({
      postId: approvalDecisions.postId,
      linkId: approvalDecisions.linkId,
      decision: approvalDecisions.decision,
      decidedAt: approvalDecisions.decidedAt,
    })
    .from(approvalDecisions)
    .where(eq(approvalDecisions.requestId, requestId));
  const recipients = APPROVAL_RULE === "all" ? await recipientLinkIds(tx, requestId) : [];
  let anyDecision = false;
  let allFinal = items.length > 0;
  for (const item of items) {
    const mine = decisions.filter((d) => d.postId === item.postId);
    const current = mine.filter((d) => !item.sentAt || d.decidedAt >= item.sentAt);
    if (current.length > 0) anyDecision = true;
    if (derivePostStatus(mine, item.sentAt, APPROVAL_RULE, recipients) === "pending_approval") {
      allFinal = false;
    }
  }
  const status = allFinal ? "decided" : anyDecision ? "partially_decided" : "open";
  await tx
    .update(approvalRequests)
    .set({ status, updatedAt: now })
    .where(eq(approvalRequests.id, requestId));
}

/** Consumes a personal link when every item is decided by this link or settled for it. Returns whether it is used now. */
async function consumeLinkIfComplete(
  tx: Tx,
  link: LinkRow,
  request: RequestRow,
  now: Date,
): Promise<boolean> {
  if (link.mode !== "personal") return false;
  const items = await tx
    .select({ postId: approvalItems.postId })
    .from(approvalItems)
    .where(eq(approvalItems.requestId, request.id));
  if (items.length === 0) return false;
  const mine = await tx
    .select({ postId: approvalDecisions.postId })
    .from(approvalDecisions)
    .where(and(eq(approvalDecisions.requestId, request.id), eq(approvalDecisions.linkId, link.id)));
  const done = new Set(mine.map((d) => d.postId));
  const settled = await settledItemsForLink(tx, request.id, link);
  if (items.some((i) => !done.has(i.postId) && !settled.has(i.postId))) return false;
  await tx
    .update(approvalLinks)
    .set({ usedAt: now, usedReason: "decided", updatedAt: now })
    .where(eq(approvalLinks.id, link.id));
  await logActivity(tx, {
    profileId: request.profileId,
    actor: `link:${link.id}`,
    event: "approval.link_used",
    payload: { requestId: request.id, linkId: link.id, reason: "decided" },
  });
  return true;
}

type WrittenDecision = { post: PostRow; record: DecisionRecord; status: PostStatus };

/**
 * Inserts one decision inside a transaction (post row must already be locked).
 * Returns null when the link already decided this item (nothing written).
 */
async function writeDecision(
  tx: Tx,
  ctx: {
    link: LinkRow;
    request: RequestRow;
    post: PostRow;
    now: Date;
    meta: { ip: string | null; userAgent: string | null };
    approverName: string | null;
    settled: Map<string, DecisionRow>;
  },
  input: DecideInput,
): Promise<
  { kind: "already"; existing: DecisionRow | null } | ({ kind: "written" } & WrittenDecision)
> {
  const { link, request, post, now, meta } = ctx;
  const settledBefore = ctx.settled.get(post.id);
  if (settledBefore) return { kind: "already", existing: settledBefore };
  const existing = await tx
    .select()
    .from(approvalDecisions)
    .where(
      and(
        eq(approvalDecisions.requestId, request.id),
        eq(approvalDecisions.postId, post.id),
        // personal: only this link's decision blocks; shared: any current decision blocks
        link.mode === "personal" ? eq(approvalDecisions.linkId, link.id) : undefined,
      ),
    )
    .orderBy(asc(approvalDecisions.decidedAt));
  // A personal link has a unique (request, link, post) row, so any decision of its own blocks it.
  const blocking =
    link.mode === "personal"
      ? existing[existing.length - 1]
      : existing.find((d) => !post.sentForApprovalAt || d.decidedAt >= post.sentForApprovalAt);
  if (blocking) return { kind: "already", existing: blocking };

  const comment = input.comment?.trim() || null;
  const approverName = ctx.approverName;
  await tx.insert(approvalDecisions).values({
    requestId: request.id,
    postId: post.id,
    linkId: link.id,
    decision: input.decision,
    comment,
    approverName,
    decidedAt: now,
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 500) ?? null,
  });

  const all = await tx
    .select({
      linkId: approvalDecisions.linkId,
      decision: approvalDecisions.decision,
      decidedAt: approvalDecisions.decidedAt,
    })
    .from(approvalDecisions)
    .where(and(eq(approvalDecisions.requestId, request.id), eq(approvalDecisions.postId, post.id)));
  const recipients = APPROVAL_RULE === "all" ? await recipientLinkIds(tx, request.id) : [];
  const derived = derivePostStatus(all, post.sentForApprovalAt, APPROVAL_RULE, recipients);

  // Never touch posts already scheduled/published: the decision is recorded, the status stays.
  const locked = post.status === "published" || post.status === "scheduled";
  const status: PostStatus = locked ? post.status : derived;
  if (!locked) {
    await tx
      .update(posts)
      .set({
        status: derived,
        approvedAt: derived === "approved" ? now : null,
        updatedAt: now,
      })
      .where(eq(posts.id, post.id));
  }
  const record: DecisionRecord = {
    decision: input.decision,
    comment,
    approverName,
    decidedAt: now,
  };
  return { kind: "written", post, record, status };
}

async function logAndNotify(
  tx: Tx,
  link: LinkRow,
  request: RequestRow,
  w: WrittenDecision,
  now: Date,
  linkUsed: boolean,
): Promise<void> {
  const payload: DecidedPayload = {
    postId: w.post.id,
    requestId: request.id,
    status: w.status,
    decision: w.record.decision,
    comment: w.record.comment,
    approverName: w.record.approverName,
    decidedAt: now.toISOString(),
    recipientName: link.recipientName,
    linkUsed,
  };
  await logActivity(tx, {
    profileId: w.post.profileId,
    actor: `link:${link.id}`,
    event: "approval.decided",
    payload,
  });
  await notifyEvent(tx, {
    type: "post.status",
    profileId: w.post.profileId,
    postId: w.post.id,
    status: w.status,
    decision: w.record,
    recipientName: link.recipientName,
    linkUsed,
    at: now.toISOString(),
  });
}

/** Name recorded as approver: the recipient for personal links, the typed name for shared ones. */
function approverFor(link: LinkRow, typed: string | undefined): string | null {
  if (link.mode === "personal") return link.recipientName?.trim() || null;
  return typed?.trim() || null;
}

/** Records a client decision. Returns the result plus the HTTP status the route should use. */
export async function decideByToken(
  token: string,
  input: DecideInput,
  meta: { ip: string | null; userAgent: string | null },
): Promise<{ status: number; result: DecideResult }> {
  const resolved = await resolveLink(token);
  if (resolved.state !== "active") return inactiveFailure(resolved.state);
  const { request } = resolved;

  const [item] = await db
    .select()
    .from(approvalItems)
    .where(and(eq(approvalItems.requestId, request.id), eq(approvalItems.postId, input.postId)))
    .limit(1);
  if (!item) return { status: 404, result: fail("not_found") };

  const now = new Date();
  const outcome = await db.transaction(async (tx) => {
    const locked = await lockLink(tx, resolved.link.id, now);
    if (locked.state !== "active") return locked.state;
    const link = locked.link;
    const [post] = await tx.select().from(posts).where(eq(posts.id, input.postId)).for("update");
    if (!post) return null;
    const settled = await settledItemsForLink(tx, request.id, link);
    const written = await writeDecision(
      tx,
      {
        link,
        request,
        post,
        now,
        meta,
        approverName: approverFor(link, input.approverName),
        settled,
      },
      input,
    );
    if (written.kind === "already") return "already" as const;
    await refreshRequestStatus(tx, request.id, now);
    const linkUsed = await consumeLinkIfComplete(tx, link, request, now);
    await logAndNotify(tx, link, request, written, now, linkUsed);
    return { written, linkUsed };
  });

  if (!outcome) return { status: 404, result: fail("not_found") };
  if (outcome === "already") return { status: 409, result: fail("already_decided") };
  if (typeof outcome === "string") return inactiveFailure(outcome);

  void emailCreator(request, outcome.written.post, outcome.written.record);
  return {
    status: 200,
    result: {
      ok: true,
      data: {
        status: outcome.written.status,
        decision: outcome.written.record,
        linkUsed: outcome.linkUsed,
      },
    },
  };
}

/** "Aprovar todos" and similar: all decisions in ONE transaction. Items this link already decided (or that are settled for it) are skipped. */
export async function decideManyByToken(
  token: string,
  input: DecideManyInput,
  meta: { ip: string | null; userAgent: string | null },
): Promise<{ status: number; result: DecideManyResult }> {
  const resolved = await resolveLink(token);
  if (resolved.state !== "active") return inactiveFailure(resolved.state);
  const { request } = resolved;

  // One decision per post (the first one wins).
  const byPost = new Map<string, DecideInput>();
  for (const d of input.decisions) if (!byPost.has(d.postId)) byPost.set(d.postId, d);
  const postIds = [...byPost.keys()].sort();

  const items = await db
    .select({ postId: approvalItems.postId })
    .from(approvalItems)
    .where(and(eq(approvalItems.requestId, request.id), inArray(approvalItems.postId, postIds)));
  if (items.length !== postIds.length) return { status: 404, result: fail("not_found") };

  const now = new Date();
  const outcome = await db.transaction(async (tx) => {
    const locked = await lockLink(tx, resolved.link.id, now);
    if (locked.state !== "active") return locked.state;
    const link = locked.link;
    const rows = await tx
      .select()
      .from(posts)
      .where(inArray(posts.id, postIds))
      .orderBy(asc(posts.id))
      .for("update");
    if (rows.length !== postIds.length) return null;

    const settled = await settledItemsForLink(tx, request.id, link);
    const written: Array<WrittenDecision> = [];
    const results: DecideManyItemResult[] = [];
    for (const post of rows) {
      const d = byPost.get(post.id)!;
      const w = await writeDecision(
        tx,
        {
          link,
          request,
          post,
          now,
          meta,
          approverName: approverFor(link, input.approverName ?? d.approverName),
          settled,
        },
        d,
      );
      if (w.kind === "already") {
        if (w.existing) {
          results.push({
            postId: post.id,
            skipped: true,
            status: post.status,
            decision: toRecord(w.existing),
          });
        }
        continue;
      }
      written.push(w);
      results.push({ postId: post.id, skipped: false, status: w.status, decision: w.record });
    }
    if (written.length > 0) await refreshRequestStatus(tx, request.id, now);
    const linkUsed = await consumeLinkIfComplete(tx, link, request, now);
    for (const w of written) await logAndNotify(tx, link, request, w, now, linkUsed);
    return { written, results, linkUsed };
  });

  if (!outcome) return { status: 404, result: fail("not_found") };
  if (typeof outcome === "string") return inactiveFailure(outcome);

  for (const w of outcome.written) void emailCreator(request, w.post, w.record);
  const order = new Map(input.decisions.map((d, i) => [d.postId, i]));
  outcome.results.sort((a, b) => (order.get(a.postId) ?? 0) - (order.get(b.postId) ?? 0));
  return {
    status: 200,
    result: { ok: true, data: { results: outcome.results, linkUsed: outcome.linkUsed } },
  };
}

async function emailCreator(
  request: RequestRow,
  post: typeof posts.$inferSelect,
  record: DecisionRecord,
): Promise<void> {
  try {
    if (!request.createdBy) return;
    const [u] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, request.createdBy))
      .limit(1);
    const [p] = await db
      .select({ igUsername: profiles.igUsername })
      .from(profiles)
      .where(eq(profiles.id, post.profileId))
      .limit(1);
    if (!u?.email || !p) return;
    const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
    await sendDecisionEmail({
      to: u.email,
      approverName: record.approverName,
      decision: record.decision,
      postCaption: post.caption,
      profileUsername: p.igUsername,
      url: `${base}/perfis/${post.profileId}/posts/${post.id}`,
      comment: record.comment,
    });
  } catch (e) {
    console.warn("[approvals] decision e-mail skipped:", e instanceof Error ? e.message : e);
  }
}
