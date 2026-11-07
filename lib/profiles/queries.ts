/**
 * Read queries for profiles (Phase 1).
 * All functions require an authenticated member; they call requireUser/requireWorkspace* inside.
 */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { mediaAssets, posts, profiles } from "@/db/schema";
import { getCurrentWorkspace, requireUser, requireWorkspaceForProfile } from "@/lib/auth/require";
import { getStorage } from "@/lib/storage";
import { buildProfileFeed } from "./feed";
import type { PostStatus, ProfileFeed, ProfileListItem } from "./contracts";

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
  return {
    draft: 0,
    pending_approval: 0,
    approved: 0,
    changes_requested: 0,
    scheduled: 0,
    published: 0,
    publish_failed: 0,
  };
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

/**
 * Returns null when the profile does not exist or the user is not a member (caller does
 * notFound()). Authorization is requireWorkspaceForProfile, the same check every other
 * profile-scoped page uses, so /perfis/[id] and its sub-pages 404 consistently.
 */
export async function getProfileFeed(profileId: string): Promise<ProfileFeed | null> {
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) return null;
  try {
    await requireWorkspaceForProfile(profileId);
  } catch (e) {
    if (isNextNotFound(e)) return null;
    throw e;
  }
  return buildProfileFeed(profileId);
}

function isNextNotFound(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}
