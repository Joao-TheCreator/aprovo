"use server";
/** Phase 4 approval actions (social media side). Every action authenticates and scopes by workspace. */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  approvalItems,
  approvalLinks,
  approvalRequests,
  mediaAssets,
  postMedia,
  posts,
} from "@/db/schema";
import { logActivity } from "@/lib/activity/log";
import { requireWorkspaceForProfile } from "@/lib/auth/require";
import type { ActionResult } from "@/lib/profiles/contracts";
import {
  APPROVAL_ERROR_MESSAGES,
  LINK_TTL_DAYS,
  createApprovalRequestSchema,
  type CreateApprovalRequestInput,
  type CreateApprovalRequestResult,
} from "./contracts";
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

function newLinkValues(requestId: string, label: string | null | undefined) {
  const token = issueToken();
  const expiresAt = new Date(Date.now() + LINK_TTL_DAYS * 86_400_000);
  return {
    token,
    expiresAt,
    values: { requestId, tokenHash: hashToken(token), label: label || null, expiresAt },
  };
}

/** Sends posts for approval: creates the request, moves posts to pending_approval and issues the first link. */
export async function createApprovalRequest(
  input: CreateApprovalRequestInput,
): Promise<CreateApprovalRequestResult> {
  const parsed = createApprovalRequestSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input", parsed.error.issues[0]?.message);
  const { profileId, title, message, label } = parsed.data;
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
  const link = newLinkValues("", label);
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
    const [l] = await tx
      .insert(approvalLinks)
      .values({ ...link.values, requestId: req.id })
      .returning({ id: approvalLinks.id });
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
      payload: { requestId: req.id, linkId: l.id, postIds },
    });
    return { requestId: req.id, linkId: l.id };
  });

  revalidateApprovals(profileId);
  return {
    ok: true,
    data: {
      ...result,
      url: `${baseUrl()}/a/${link.token}`,
      expiresAt: link.expiresAt,
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

/** Issues an additional link (e.g. for another contact) for an open request. */
export async function issueApprovalLink(
  requestId: string,
  label?: string,
): Promise<CreateApprovalRequestResult> {
  const loaded = await loadRequest(requestId);
  if (!loaded) return fail("not_found");
  const { req, member } = loaded;
  if (req.status !== "open" && req.status !== "partially_decided") return fail("link_inactive");
  const link = newLinkValues(req.id, label?.trim().slice(0, 80));
  const [l] = await db
    .insert(approvalLinks)
    .values(link.values)
    .returning({ id: approvalLinks.id });
  await logActivity(db, {
    profileId: req.profileId,
    actor: `user:${member.user.id}`,
    event: "approval.link_issued",
    payload: { requestId: req.id, linkId: l.id },
  });
  revalidateApprovals(req.profileId);
  return {
    ok: true,
    data: {
      requestId: req.id,
      linkId: l.id,
      url: `${baseUrl()}/a/${link.token}`,
      expiresAt: link.expiresAt,
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
