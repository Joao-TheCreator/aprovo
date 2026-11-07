"use server";
/** Phase 2 publication actions. Every action authenticates and scopes by workspace. */
import { and, eq, inArray, isNull, min, notInArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { approvalDecisions, mediaAssets, postMedia, posts, publications } from "@/db/schema";
import { requireWorkspaceForProfile } from "@/lib/auth/require";
import { logActivity } from "@/lib/activity/log";
import type { ActionResult } from "@/lib/profiles/contracts";
import { canEditPost, nextPostStatus } from "@/lib/publishing/state";
import {
  createPostSchema,
  POST_ERROR_MESSAGES,
  updatePostMediaSchema,
  updatePostSchema,
  type CreatePostInput,
  type CreatePostResult,
  type PostKind,
  type UpdatePostInput,
  type UpdatePostMediaInput,
} from "./contracts";

function fail(code: string, message?: string) {
  return { ok: false as const, code, message: message ?? POST_ERROR_MESSAGES[code] ?? "Erro." };
}
const OK: ActionResult = { ok: true, data: undefined };

function isNextNotFound(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

type Member = Awaited<ReturnType<typeof requireWorkspaceForProfile>>;
type PostRow = typeof posts.$inferSelect;

async function memberForProfile(profileId: string): Promise<Member | null> {
  try {
    return await requireWorkspaceForProfile(profileId);
  } catch (e) {
    if (isNextNotFound(e)) return null;
    throw e;
  }
}

/** Loads the post and checks membership. */
async function loadPost(postId: string): Promise<{ post: PostRow; member: Member } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return null;
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) return null;
  const member = await memberForProfile(post.profileId);
  return member ? { post, member } : null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Editing a `scheduled` post cancels its live publication and sends it back to draft
 * (docs/12 section 2.2). Returns the patch to apply on the post row, or null when the post is not scheduled.
 */
async function cancelScheduleForEdit(
  tx: Tx,
  post: PostRow,
  userId: string,
): Promise<Partial<typeof posts.$inferInsert> | null> {
  if (post.status !== "scheduled") return null;
  const now = new Date();
  const cancelled = await tx
    .update(publications)
    .set({ status: "cancelled", cancelledAt: now, cancelledBy: userId, updatedAt: now })
    .where(
      and(
        eq(publications.postId, post.id),
        sql`${publications.status} in ('scheduled', 'publishing')`,
      ),
    )
    .returning({ id: publications.id });
  for (const c of cancelled) {
    await logActivity(tx, {
      profileId: post.profileId,
      actor: `user:${userId}`,
      event: "publication.cancelled",
      payload: { postId: post.id, publicationId: c.id, reason: "edited" },
    });
  }
  return { status: nextPostStatus(post.status, "edit"), approvedAt: null };
}

function revalidate(profileId: string, postId: string) {
  revalidatePath(`/perfis/${profileId}`);
  revalidatePath(`/perfis/${profileId}/posts/${postId}`);
}

function countOk(kind: PostKind, n: number): boolean {
  return kind === "video" ? n === 1 : n >= 1 && n <= 10;
}

export async function createPost(input: CreatePostInput): Promise<CreatePostResult> {
  const parsed = createPostSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_media_count");
  const { profileId, kind, assetIds } = parsed.data;
  const member = await memberForProfile(profileId);
  if (!member) return fail("not_found");
  if (!countOk(kind, assetIds.length) || new Set(assetIds).size !== assetIds.length) {
    return fail("invalid_media_count");
  }

  const assets = await db
    .select({ id: mediaAssets.id, status: mediaAssets.status })
    .from(mediaAssets)
    .where(and(inArray(mediaAssets.id, assetIds), eq(mediaAssets.workspaceId, member.workspaceId)));
  if (
    assets.length !== assetIds.length ||
    assets.some((a) => a.status !== "ready" && a.status !== "processing")
  ) {
    return fail("asset_not_ready");
  }

  const postId = await db.transaction(async (tx) => {
    const [{ minPos }] = await tx
      .select({ minPos: min(posts.position) })
      .from(posts)
      .where(and(eq(posts.profileId, profileId), isNull(posts.archivedAt)));
    const position = minPos === null || minPos === undefined ? 0 : minPos - 1;
    const [created] = await tx
      .insert(posts)
      .values({ profileId, kind, status: "draft", position, createdBy: member.user.id })
      .returning({ id: posts.id });
    await tx.insert(postMedia).values(
      assetIds.map((assetId, i) => ({
        postId: created.id,
        assetId,
        sortOrder: i,
        gridCrop: null,
      })),
    );
    await logActivity(tx, {
      profileId,
      actor: `user:${member.user.id}`,
      event: "post.created",
      payload: { postId: created.id, kind, mediaCount: assetIds.length },
    });
    return created.id;
  });
  revalidate(profileId, postId);
  return { ok: true, data: { postId } };
}

export async function updatePost(input: UpdatePostInput): Promise<ActionResult> {
  const parsed = updatePostSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input", parsed.error.issues[0]?.message);
  const { postId, caption, hashtags, scheduledFor, notes } = parsed.data;
  const loaded = await loadPost(postId);
  if (!loaded) return fail("not_found");
  const { post, member } = loaded;
  if (!canEditPost(post.status)) return fail("published_locked");

  const patch: Partial<typeof posts.$inferInsert> = {};
  if (caption !== undefined) patch.caption = caption;
  if (hashtags !== undefined) patch.hashtags = hashtags;
  if (scheduledFor !== undefined) patch.scheduledFor = scheduledFor ? new Date(scheduledFor) : null;
  if (notes !== undefined) patch.notes = notes;
  const reopen = post.status === "approved";
  if (reopen) {
    patch.status = "draft";
    patch.approvedAt = null;
  }

  // Changing notes alone does not touch what will be published, so it keeps the schedule.
  const touchesContent =
    caption !== undefined || hashtags !== undefined || scheduledFor !== undefined;
  const actor = `user:${member.user.id}` as const;
  await db.transaction(async (tx) => {
    const unscheduled = touchesContent
      ? await cancelScheduleForEdit(tx, post, member.user.id)
      : null;
    await tx
      .update(posts)
      .set({ ...patch, ...unscheduled, updatedAt: new Date() })
      .where(eq(posts.id, postId));
    if (reopen) {
      await logActivity(tx, {
        profileId: post.profileId,
        actor,
        event: "post.reopened",
        payload: { postId },
      });
    }
    await logActivity(tx, {
      profileId: post.profileId,
      actor,
      event: "post.updated",
      payload: { postId, fields: Object.keys(parsed.data).filter((k) => k !== "postId") },
    });
  });
  revalidate(post.profileId, postId);
  return OK;
}

export async function updatePostMedia(input: UpdatePostMediaInput): Promise<ActionResult> {
  const parsed = updatePostMediaSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_media_count");
  const { postId, items } = parsed.data;
  const loaded = await loadPost(postId);
  if (!loaded) return fail("not_found");
  const { post, member } = loaded;
  if (!canEditPost(post.status)) return fail("published_locked");
  const ids = items.map((i) => i.assetId);
  if (!countOk(post.kind, ids.length) || new Set(ids).size !== ids.length) {
    return fail("invalid_media_count");
  }

  const assets = await db
    .select({ id: mediaAssets.id, status: mediaAssets.status })
    .from(mediaAssets)
    .where(and(inArray(mediaAssets.id, ids), eq(mediaAssets.workspaceId, member.workspaceId)));
  if (
    assets.length !== ids.length ||
    assets.some((a) => a.status !== "ready" && a.status !== "processing")
  ) {
    return fail("asset_not_ready");
  }

  const reopen = post.status === "approved";
  const actor = `user:${member.user.id}` as const;
  await db.transaction(async (tx) => {
    const unscheduled = await cancelScheduleForEdit(tx, post, member.user.id);
    await tx
      .delete(postMedia)
      .where(and(eq(postMedia.postId, postId), notInArray(postMedia.assetId, ids)));
    const existing = await tx
      .select({ id: postMedia.id, assetId: postMedia.assetId })
      .from(postMedia)
      .where(eq(postMedia.postId, postId));
    const byAsset = new Map(existing.map((r) => [r.assetId, r.id]));
    for (const [i, item] of items.entries()) {
      const rowId = byAsset.get(item.assetId);
      if (rowId) {
        await tx
          .update(postMedia)
          .set({
            sortOrder: i,
            ...(item.gridCrop !== undefined ? { gridCrop: item.gridCrop } : {}),
            updatedAt: new Date(),
          })
          .where(eq(postMedia.id, rowId));
      } else {
        await tx
          .insert(postMedia)
          .values({ postId, assetId: item.assetId, sortOrder: i, gridCrop: item.gridCrop ?? null });
      }
    }
    if (reopen) {
      await tx
        .update(posts)
        .set({ status: "draft", approvedAt: null, updatedAt: new Date() })
        .where(eq(posts.id, postId));
      await logActivity(tx, {
        profileId: post.profileId,
        actor,
        event: "post.reopened",
        payload: { postId },
      });
    } else {
      await tx
        .update(posts)
        .set({ ...unscheduled, updatedAt: new Date() })
        .where(eq(posts.id, postId));
    }
    await logActivity(tx, {
      profileId: post.profileId,
      actor,
      event: "post.updated",
      payload: { postId, fields: ["media"], mediaCount: ids.length },
    });
  });
  revalidate(post.profileId, postId);
  return OK;
}

export async function archivePost(postId: string, archived: boolean): Promise<ActionResult> {
  const loaded = await loadPost(postId);
  if (!loaded) return fail("not_found");
  const { post, member } = loaded;
  if (!canEditPost(post.status)) return fail("published_locked");
  await db.transaction(async (tx) => {
    await tx
      .update(posts)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(eq(posts.id, postId));
    await logActivity(tx, {
      profileId: post.profileId,
      actor: `user:${member.user.id}`,
      event: archived ? "post.archived" : "post.unarchived",
      payload: { postId },
    });
  });
  revalidate(post.profileId, postId);
  return OK;
}

/** Deletes the post (post_media cascades). Storage objects are kept: assets may be shared/dedup'd. */
export type DeleteOutcome = { deleted: string[]; archived: string[] };

/**
 * Posts with a recorded client decision are the proof of the approval (audit table, no cascade),
 * so they cannot be hard-deleted: they are archived instead and the caller tells the user.
 */
async function postsWithDecisions(postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ postId: approvalDecisions.postId })
    .from(approvalDecisions)
    .where(inArray(approvalDecisions.postId, postIds));
  return new Set(rows.map((r) => r.postId));
}

type DeletableRow = { id: string; profileId: string; caption: string | null };

async function deleteOrArchive(rows: DeletableRow[], actorUserId: string): Promise<DeleteOutcome> {
  const decided = await postsWithDecisions(rows.map((r) => r.id));
  const toDelete = rows.filter((r) => !decided.has(r.id));
  const toArchive = rows.filter((r) => decided.has(r.id));
  const actor = `user:${actorUserId}` as const;
  await db.transaction(async (tx) => {
    if (toDelete.length) {
      await tx.delete(posts).where(
        inArray(
          posts.id,
          toDelete.map((r) => r.id),
        ),
      );
      for (const r of toDelete) {
        await logActivity(tx, {
          profileId: r.profileId,
          actor,
          event: "post.deleted",
          payload: { postId: r.id, caption: r.caption?.slice(0, 80) ?? null },
        });
      }
    }
    if (toArchive.length) {
      const now = new Date();
      await tx
        .update(posts)
        .set({ archivedAt: now, updatedAt: now })
        .where(
          and(
            inArray(
              posts.id,
              toArchive.map((r) => r.id),
            ),
            isNull(posts.archivedAt),
          ),
        );
      for (const r of toArchive) {
        await logActivity(tx, {
          profileId: r.profileId,
          actor,
          event: "post.archived",
          payload: { postId: r.id, reason: "delete_with_decisions" },
        });
      }
    }
  });
  return { deleted: toDelete.map((r) => r.id), archived: toArchive.map((r) => r.id) };
}

export async function deletePost(postId: string): Promise<ActionResult<DeleteOutcome>> {
  const loaded = await loadPost(postId);
  if (!loaded) return fail("not_found");
  const { post, member } = loaded;
  if (!canEditPost(post.status)) return fail("published_locked");
  const outcome = await deleteOrArchive(
    [{ id: post.id, profileId: post.profileId, caption: post.caption }],
    member.user.id,
  );
  revalidate(post.profileId, postId);
  return { ok: true, data: outcome };
}

const uuidList = z.array(z.string().uuid()).min(1).max(200);

/**
 * Reassigns `position` densely (0..n-1) for the profile's non-archived posts, in the given order.
 * The unique index (profile_id, position) is checked per row, so we move every post of the profile
 * to a distinct negative temporary position first, then write the final values.
 * Archived posts are pushed after the active ones (n..) keeping their relative order.
 */
export async function reorderPosts(profileId: string, orderedIds: string[]): Promise<ActionResult> {
  const parsedIds = uuidList.safeParse(orderedIds);
  if (!z.string().uuid().safeParse(profileId).success) return fail("not_found");
  if (!parsedIds.success) return fail("stale_order");
  const member = await memberForProfile(profileId);
  if (!member) return fail("not_found");
  const ids = parsedIds.data;

  const result = await db.transaction(async (tx) => {
    const all = await tx
      .select({ id: posts.id, archivedAt: posts.archivedAt, position: posts.position })
      .from(posts)
      .where(eq(posts.profileId, profileId))
      .for("update");
    const active = new Set(all.filter((p) => p.archivedAt === null).map((p) => p.id));
    if (
      ids.length !== active.size ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !active.has(id))
    ) {
      return false;
    }
    const archived = all
      .filter((p) => p.archivedAt !== null)
      .sort((a, b) => a.position - b.position)
      .map((p) => p.id);
    const finalOrder = [...ids, ...archived];

    // Phase 1: park everything on unique temporary negative positions.
    for (const [i, id] of finalOrder.entries()) {
      await tx
        .update(posts)
        .set({ position: -(i + 1) - 1_000_000 })
        .where(eq(posts.id, id));
    }
    // Phase 2: final dense positions.
    for (const [i, id] of finalOrder.entries()) {
      await tx.update(posts).set({ position: i }).where(eq(posts.id, id));
    }
    await logActivity(tx, {
      profileId,
      actor: `user:${member.user.id}`,
      event: "posts.reordered",
      payload: { count: ids.length },
    });
    return true;
  });
  if (!result) return fail("stale_order", "A grade mudou. Atualize a página e tente de novo.");
  revalidatePath(`/perfis/${profileId}`);
  return OK;
}

/** Loads posts for a bulk operation: all must exist and belong to one profile the user can access. */
async function loadBulk(
  postIds: string[],
): Promise<{ rows: PostRow[]; member: Member; profileId: string } | null> {
  const parsed = uuidList.safeParse(postIds);
  if (!parsed.success) return null;
  const ids = [...new Set(parsed.data)];
  const rows = await db.select().from(posts).where(inArray(posts.id, ids));
  if (rows.length !== ids.length) return null;
  const profileId = rows[0].profileId;
  if (rows.some((r) => r.profileId !== profileId)) return null;
  const member = await memberForProfile(profileId);
  return member ? { rows, member, profileId } : null;
}

export async function bulkArchivePosts(
  postIds: string[],
  archived: boolean,
): Promise<ActionResult> {
  const loaded = await loadBulk(postIds);
  if (!loaded) return fail("not_found");
  const { rows, member, profileId } = loaded;
  if (rows.some((r) => !canEditPost(r.status))) return fail("published_locked");
  await db.transaction(async (tx) => {
    await tx
      .update(posts)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(
        inArray(
          posts.id,
          rows.map((r) => r.id),
        ),
      );
    for (const r of rows) {
      await logActivity(tx, {
        profileId,
        actor: `user:${member.user.id}`,
        event: archived ? "post.archived" : "post.unarchived",
        payload: { postId: r.id },
      });
    }
  });
  revalidatePath(`/perfis/${profileId}`);
  return OK;
}

export async function bulkDeletePosts(postIds: string[]): Promise<ActionResult<DeleteOutcome>> {
  const loaded = await loadBulk(postIds);
  if (!loaded) return fail("not_found");
  const { rows, member, profileId } = loaded;
  if (rows.some((r) => !canEditPost(r.status))) return fail("published_locked");
  const outcome = await deleteOrArchive(
    rows.map((r) => ({ id: r.id, profileId, caption: r.caption })),
    member.user.id,
  );
  revalidatePath(`/perfis/${profileId}`);
  return { ok: true, data: outcome };
}
