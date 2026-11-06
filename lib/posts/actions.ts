"use server";
/** Phase 2 publication actions. Every action authenticates and scopes by workspace. */
import { and, eq, inArray, isNull, min, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { mediaAssets, postMedia, posts } from "@/db/schema";
import { requireWorkspaceForProfile } from "@/lib/auth/require";
import { logActivity } from "@/lib/activity/log";
import type { ActionResult } from "@/lib/profiles/contracts";
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
    await tx
      .insert(postMedia)
      .values(
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

  const actor = `user:${member.user.id}` as const;
  await db.transaction(async (tx) => {
    await tx
      .update(posts)
      .set({ ...patch, updatedAt: new Date() })
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
      await tx.update(posts).set({ updatedAt: new Date() }).where(eq(posts.id, postId));
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
export async function deletePost(postId: string): Promise<ActionResult> {
  const loaded = await loadPost(postId);
  if (!loaded) return fail("not_found");
  const { post, member } = loaded;
  await db.transaction(async (tx) => {
    await tx.delete(posts).where(eq(posts.id, postId));
    await logActivity(tx, {
      profileId: post.profileId,
      actor: `user:${member.user.id}`,
      event: "post.deleted",
      payload: { postId, caption: post.caption?.slice(0, 80) ?? null },
    });
  });
  revalidate(post.profileId, postId);
  return OK;
}
