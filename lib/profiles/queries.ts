/**
 * Read queries for profiles (Phase 1).
 * All functions require an authenticated member; they call requireUser/requireWorkspace* inside.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { importedPosts, mediaAssets, postMedia, posts, profiles } from "@/db/schema";
import { getCurrentWorkspace, requireUser, requireWorkspaceMember } from "@/lib/auth/require";
import { isGraphConfigured } from "@/lib/instagram";
import { getStorage } from "@/lib/storage";
import type { FeedItem, PostStatus, ProfileFeed, ProfileListItem } from "./contracts";

const URL_TTL = 3600;

async function signedUrls(keys: (string | null | undefined)[]): Promise<(string | null)[]> {
  const storage = getStorage();
  return Promise.all(
    keys.map(async (k) => {
      if (!k) return null;
      try {
        return await storage.getSignedUrl(k, URL_TTL);
      } catch (e) {
        console.warn("[queries] signing failed:", e instanceof Error ? e.message : e);
        return null;
      }
    }),
  );
}

function emptyCounts(): Record<PostStatus, number> {
  return { draft: 0, pending_approval: 0, approved: 0, changes_requested: 0 };
}

export async function listProfiles(): Promise<ProfileListItem[]> {
  const user = await requireUser();
  const ws = await getCurrentWorkspace(user.id!);
  if (!ws) return [];
  const rows = await db
    .select({ profile: profiles, avatarPath: mediaAssets.thumbPath })
    .from(profiles)
    .leftJoin(mediaAssets, eq(mediaAssets.id, profiles.avatarAssetId))
    .where(eq(profiles.workspaceId, ws.id))
    .orderBy(desc(profiles.createdAt));
  if (rows.length === 0) return [];

  const countRows = await db
    .select({ profileId: posts.profileId, status: posts.status, n: sql<number>`count(*)::int` })
    .from(posts)
    .where(
      and(
        inArray(
          posts.profileId,
          rows.map((r) => r.profile.id),
        ),
        isNull(posts.archivedAt),
      ),
    )
    .groupBy(posts.profileId, posts.status);
  const counts = new Map<string, Record<PostStatus, number>>();
  for (const c of countRows) {
    const m = counts.get(c.profileId) ?? emptyCounts();
    m[c.status] = c.n;
    counts.set(c.profileId, m);
  }

  const avatars = await signedUrls(rows.map((r) => r.avatarPath));
  return rows.map(({ profile: p }, i) => ({
    id: p.id,
    igUsername: p.igUsername,
    displayName: p.displayName,
    avatarUrl: avatars[i],
    importStatus: p.importStatus,
    lastImportedAt: p.lastImportedAt,
    counts: counts.get(p.id) ?? emptyCounts(),
  }));
}

/** Returns null when the profile does not exist or the user is not a member (caller does notFound()). */
export async function getProfileFeed(profileId: string): Promise<ProfileFeed | null> {
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) return null;
  const [p] = await db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!p) return null;
  // requireWorkspaceMember calls notFound() for non-members; treat that as null for the caller.
  try {
    await requireWorkspaceMember(p.workspaceId);
  } catch (e) {
    if (isNextNotFound(e)) return null;
    throw e;
  }

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
  const firstByPost = new Map<string, { thumbPath: string | null; count: number; kind: string }>();
  for (const m of firstMedia) {
    const cur = firstByPost.get(m.postId);
    if (cur) cur.count++;
    else firstByPost.set(m.postId, { thumbPath: m.thumbPath, count: 1, kind: m.kind });
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
    },
    items,
    canRefresh: isGraphConfigured(),
  };
}

function isNextNotFound(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}
