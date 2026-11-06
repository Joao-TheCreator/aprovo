import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
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
import type { DecidedPayload } from "@/lib/realtime/events";
import { notifyEvent } from "@/lib/realtime/notify";
import {
  APPROVAL_ERROR_MESSAGES,
  type DecideInput,
  type DecideResult,
  type DecisionRecord,
} from "./contracts";
import { hashToken } from "./token";

export type LinkRow = typeof approvalLinks.$inferSelect;
export type RequestRow = typeof approvalRequests.$inferSelect;

/** Resolves a token to its link and request; state tells why it is unusable. */
export async function resolveLink(
  token: string,
): Promise<
  | { state: "not_found" }
  | { state: "active" | "expired" | "revoked"; link: LinkRow; request: RequestRow }
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
  if (link.expiresAt.getTime() <= Date.now()) return { state: "expired", link, request };
  return { state: "active", link, request };
}

function fail(code: string): { ok: false; code: string; message: string } {
  return { ok: false, code, message: APPROVAL_ERROR_MESSAGES[code] ?? "Erro." };
}

/** Records a client decision. Returns the result plus the HTTP status the route should use. */
export async function decideByToken(
  token: string,
  input: DecideInput,
  meta: { ip: string | null; userAgent: string | null },
): Promise<{ status: number; result: DecideResult }> {
  const resolved = await resolveLink(token);
  if (resolved.state !== "active") return { status: 404, result: fail("link_inactive") };
  const { link, request } = resolved;

  const [item] = await db
    .select()
    .from(approvalItems)
    .where(and(eq(approvalItems.requestId, request.id), eq(approvalItems.postId, input.postId)))
    .limit(1);
  if (!item) return { status: 404, result: fail("not_found") };

  const now = new Date();
  const outcome = await db.transaction(async (tx) => {
    const [post] = await tx.select().from(posts).where(eq(posts.id, input.postId)).for("update");
    if (!post) return null;
    const [existing] = await tx
      .select({ id: approvalDecisions.id, decidedAt: approvalDecisions.decidedAt })
      .from(approvalDecisions)
      .where(
        and(
          eq(approvalDecisions.requestId, request.id),
          eq(approvalDecisions.postId, input.postId),
        ),
      )
      .limit(1);
    if (existing && (!post.sentForApprovalAt || existing.decidedAt >= post.sentForApprovalAt)) {
      return "already" as const;
    }

    const comment = input.comment?.trim() || null;
    const approverName = input.approverName?.trim() || null;
    await tx.insert(approvalDecisions).values({
      requestId: request.id,
      postId: input.postId,
      linkId: link.id,
      decision: input.decision,
      comment,
      approverName,
      decidedAt: now,
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
    });
    await tx
      .update(posts)
      .set({
        status: input.decision,
        approvedAt: input.decision === "approved" ? now : null,
        updatedAt: now,
      })
      .where(eq(posts.id, input.postId));

    const [{ total, decided }] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        decided: sql<number>`count(*) filter (where exists (
          select 1 from approval_decisions d
          where d.request_id = approval_items.request_id and d.post_id = approval_items.post_id))::int`,
      })
      .from(approvalItems)
      .where(eq(approvalItems.requestId, request.id));
    await tx
      .update(approvalRequests)
      .set({ status: decided >= total ? "decided" : "partially_decided", updatedAt: now })
      .where(eq(approvalRequests.id, request.id));

    const payload: DecidedPayload = {
      postId: input.postId,
      requestId: request.id,
      status: input.decision,
      decision: input.decision,
      comment,
      approverName,
      decidedAt: now.toISOString(),
    };
    await logActivity(tx, {
      profileId: post.profileId,
      actor: `link:${link.id}`,
      event: "approval.decided",
      payload,
    });
    const record: DecisionRecord = {
      decision: input.decision,
      comment,
      approverName,
      decidedAt: now,
    };
    await notifyEvent(tx, {
      type: "post.status",
      profileId: post.profileId,
      postId: input.postId,
      status: input.decision,
      decision: record,
      at: now.toISOString(),
    });
    return { post, record };
  });

  if (!outcome) return { status: 404, result: fail("not_found") };
  if (outcome === "already") return { status: 409, result: fail("already_decided") };

  void emailCreator(request, outcome.post, outcome.record);
  return {
    status: 200,
    result: { ok: true, data: { status: input.decision, decision: outcome.record } },
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
