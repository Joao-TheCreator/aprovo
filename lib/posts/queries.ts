import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalDecisions, mediaAssets, postMedia, posts, profiles } from "@/db/schema";
import { requireWorkspaceMember } from "@/lib/auth/require";
import { assetUrls } from "@/lib/media/urls";
import { getStorage } from "@/lib/storage";
import type { PostDetail } from "./contracts";

function isNextNotFound(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

/** null when not found or not a member (caller does notFound()). */
export async function getPost(postId: string): Promise<PostDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return null;
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) return null;
  const [profile] = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, post.profileId), isNull(profiles.deletedAt)))
    .limit(1);
  if (!profile) return null;
  try {
    await requireWorkspaceMember(profile.workspaceId);
  } catch (e) {
    if (isNextNotFound(e)) return null;
    throw e;
  }

  const rows = await db
    .select({ asset: mediaAssets, sortOrder: postMedia.sortOrder, gridCrop: postMedia.gridCrop })
    .from(postMedia)
    .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.assetId))
    .where(eq(postMedia.postId, postId))
    .orderBy(asc(postMedia.sortOrder));
  const urls = await assetUrls(rows.map((r) => r.asset));

  let avatarUrl: string | null = null;
  if (profile.avatarAssetId) {
    const [avatar] = await db
      .select({ thumbPath: mediaAssets.thumbPath })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, profile.avatarAssetId))
      .limit(1);
    if (avatar?.thumbPath) {
      try {
        avatarUrl = await getStorage().getSignedUrl(avatar.thumbPath, 3600);
      } catch {
        avatarUrl = null;
      }
    }
  }

  let lastClientComment: string | null = null;
  if (post.status === "changes_requested") {
    const [d] = await db
      .select({ comment: approvalDecisions.comment })
      .from(approvalDecisions)
      .where(
        and(
          eq(approvalDecisions.postId, postId),
          eq(approvalDecisions.decision, "changes_requested"),
        ),
      )
      .orderBy(desc(approvalDecisions.decidedAt))
      .limit(1);
    lastClientComment = d?.comment ?? null;
  }

  return {
    id: post.id,
    profileId: post.profileId,
    kind: post.kind,
    status: post.status,
    position: post.position,
    caption: post.caption,
    hashtags: post.hashtags,
    scheduledFor: post.scheduledFor,
    notes: post.notes,
    archivedAt: post.archivedAt,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    media: rows.map((r, i) => ({ ...urls[i], sortOrder: r.sortOrder, gridCrop: r.gridCrop })),
    profile: {
      id: profile.id,
      igUsername: profile.igUsername,
      avatarUrl,
      gridRatio: profile.gridRatio,
    },
    lastClientComment,
  };
}
