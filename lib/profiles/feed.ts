/** Auth-free feed builder. Callers MUST authorize (member check or valid approval link) first. */
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { importedPosts, mediaAssets, postMedia, posts, profiles } from "@/db/schema";
import { isGraphConfiguredForWorkspace } from "@/lib/instagram";
import { getStorage } from "@/lib/storage";
import type { FeedItem, GridCrop, ProfileFeed } from "./contracts";

const URL_TTL = 3600;

async function signedUrls(keys: (string | null | undefined)[]): Promise<(string | null)[]> {
  const storage = getStorage();
  return Promise.all(
    keys.map(async (k) => {
      if (!k) return null;
      try {
        return await storage.getSignedUrl(k, URL_TTL);
      } catch (e) {
        console.warn("[feed] signing failed:", e instanceof Error ? e.message : e);
        return null;
      }
    }),
  );
}

export async function buildProfileFeed(profileId: string): Promise<ProfileFeed | null> {
  const [p] = await db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!p) return null;

  const [avatarRow] = p.avatarAssetId
    ? await db
        .select({ thumbPath: mediaAssets.thumbPath })
        .from(mediaAssets)
        .where(eq(mediaAssets.id, p.avatarAssetId))
        .limit(1)
    : [];

  const planned = await db
    .select()
    .from(posts)
    .where(and(eq(posts.profileId, profileId), isNull(posts.archivedAt)))
    .orderBy(asc(posts.position));
  const firstMedia = planned.length
    ? await db
        .select({
          postId: postMedia.postId,
          sortOrder: postMedia.sortOrder,
          kind: mediaAssets.kind,
          thumbPath: mediaAssets.thumbPath,
          gridCrop: postMedia.gridCrop,
        })
        .from(postMedia)
        .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.assetId))
        .where(
          inArray(
            postMedia.postId,
            planned.map((x) => x.id),
          ),
        )
        .orderBy(asc(postMedia.sortOrder))
    : [];
  const firstByPost = new Map<
    string,
    { thumbPath: string | null; count: number; kind: string; gridCrop: GridCrop | null }
  >();
  for (const m of firstMedia) {
    const cur = firstByPost.get(m.postId);
    if (cur) cur.count++;
    else
      firstByPost.set(m.postId, {
        thumbPath: m.thumbPath,
        count: 1,
        kind: m.kind,
        gridCrop: m.gridCrop ?? null,
      });
  }

  const imported = await db
    .select({ post: importedPosts, thumbPath: mediaAssets.thumbPath })
    .from(importedPosts)
    .leftJoin(mediaAssets, eq(mediaAssets.id, importedPosts.thumbAssetId))
    .where(eq(importedPosts.profileId, profileId))
    .orderBy(sql`${importedPosts.publishedAt} desc nulls last`, desc(importedPosts.createdAt));

  const urls = await signedUrls([
    avatarRow?.thumbPath,
    ...planned.map((x) => firstByPost.get(x.id)?.thumbPath),
    ...imported.map((r) => r.thumbPath),
  ]);
  const avatarUrl = urls[0];
  const plannedUrls = urls.slice(1, 1 + planned.length);
  const importedUrls = urls.slice(1 + planned.length);

  const items: FeedItem[] = [
    ...planned.map((x, i): FeedItem => {
      const m = firstByPost.get(x.id);
      return {
        kind: "planned",
        id: x.id,
        mediaType: x.kind === "video" ? "video" : m && m.count > 1 ? "carousel" : "image",
        thumbUrl: plannedUrls[i],
        status: x.status,
        position: x.position,
        caption: x.caption,
        scheduledFor: x.scheduledFor,
        postKind: x.kind,
        gridCrop: m?.gridCrop ?? null,
        mediaCount: m?.count ?? 0,
      };
    }),
    ...imported.map(({ post }, i): FeedItem => ({
      kind: "imported",
      id: post.id,
      mediaType: post.mediaType,
      thumbUrl: importedUrls[i],
      permalink: post.permalink,
      caption: post.caption,
      publishedAt: post.publishedAt,
      isHidden: post.isHidden,
    })),
  ];

  return {
    profile: {
      id: p.id,
      workspaceId: p.workspaceId,
      igUsername: p.igUsername,
      displayName: p.displayName,
      biography: p.biography,
      externalUrl: p.externalUrl,
      avatarUrl,
      postsCount: p.postsCount,
      followersCount: p.followersCount,
      followingCount: p.followingCount,
      accountType: p.accountType,
      importSource: p.importSource,
      importStatus: p.importStatus,
      importError: p.importError,
      lastImportedAt: p.lastImportedAt,
      gridRatio: p.gridRatio,
      connectionId: p.connectionId,
    },
    items,
    canRefresh: await isGraphConfiguredForWorkspace(p.workspaceId),
  };
}
