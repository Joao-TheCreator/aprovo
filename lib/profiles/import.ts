import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { importedPosts, profiles, profileSnapshots } from "@/db/schema";
import { downloadImage } from "@/lib/instagram/download";
import { getInstagramProviderForWorkspace } from "@/lib/instagram";
import type { IgError, IgMedia, IgProfile } from "@/lib/instagram/types";
import { isIgError } from "@/lib/instagram/types";
import { NO_BUSINESS_DISCOVERY_MESSAGE } from "./contracts";
import { storeCachedImage } from "./thumbs";

export type ImportResult = { ok: true; imported: number } | { ok: false; error: IgError };

export const IMPORT_CACHE_MS = 24 * 60 * 60 * 1000;
const DOWNLOAD_CONCURRENCY = 6;

export function importErrorMessage(e: IgError): string {
  switch (e.code) {
    case "not_found":
      return "Perfil não encontrado no Instagram.";
    case "private_or_personal":
      return "A conta é privada ou pessoal; a importação automática não é possível.";
    case "rate_limited":
      return "Limite de importações atingido. Tente novamente em alguns minutos.";
    case "not_configured":
      return "A importação automática não está configurada.";
    case "provider_down":
      return e.message === NO_BUSINESS_DISCOVERY_MESSAGE
        ? e.message
        : "O Instagram não respondeu à importação.";
  }
}

/** Downloads a remote image and stores it through the ig-cache pipeline. Never throws. */
async function cacheRemoteImage(workspaceId: string, url: string | null) {
  if (!url) return null;
  try {
    const buf = await downloadImage(url);
    if (!buf) {
      console.warn("[import] thumbnail download failed");
      return null;
    }
    return await storeCachedImage(workspaceId, buf);
  } catch (e) {
    console.warn("[import] thumbnail pipeline failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function failImport(profileId: string, error: IgError): Promise<ImportResult> {
  await db
    .update(profiles)
    .set({ importStatus: "failed", importError: importErrorMessage(error) })
    .where(eq(profiles.id, profileId));
  return { ok: false, error };
}

/**
 * Imports header + latest media for a profile through the configured provider.
 * Callers must have authorized access to the profile already.
 */
export async function importProfileFromProvider(profileId: string): Promise<ImportResult> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!profile) return { ok: false, error: { code: "not_found" } };

  await db
    .update(profiles)
    .set({ importStatus: "importing", importError: null })
    .where(eq(profiles.id, profileId));

  let data: IgProfile;
  try {
    const provider = await getInstagramProviderForWorkspace(profile.workspaceId);
    const res = await provider.fetchProfile(profile.igUsername);
    if (isIgError(res)) return await failImport(profileId, res);
    data = res;
  } catch (e) {
    console.error("[import] provider threw:", e instanceof Error ? e.message : e);
    return failImport(profileId, { code: "provider_down", message: "Erro inesperado." });
  }

  try {
    const workspaceId = profile.workspaceId;

    const existing = await db
      .select({ igMediaId: importedPosts.igMediaId, thumbAssetId: importedPosts.thumbAssetId })
      .from(importedPosts)
      .where(eq(importedPosts.profileId, profileId));
    const hasThumb = new Set(existing.filter((r) => r.thumbAssetId).map((r) => r.igMediaId));

    const [avatar, thumbs] = await Promise.all([
      cacheRemoteImage(workspaceId, data.avatarUrl),
      mapLimit<IgMedia, { assetId: string } | null | undefined>(
        data.media,
        DOWNLOAD_CONCURRENCY,
        async (m) =>
          hasThumb.has(m.id) ? undefined : cacheRemoteImage(workspaceId, m.thumbnailUrl),
      ),
    ]);

    await db.transaction(async (tx) => {
      await tx
        .update(profiles)
        .set({
          displayName: data.displayName ?? profile.displayName,
          biography: data.biography,
          externalUrl: data.externalUrl,
          postsCount: data.mediaCount,
          followersCount: data.followersCount,
          followingCount: data.followingCount,
          accountType: "business",
          ...(avatar ? { avatarAssetId: avatar.assetId } : {}),
          importSource: "graph_api",
          importStatus: "ok",
          importError: null,
          lastImportedAt: new Date(),
        })
        .where(eq(profiles.id, profileId));

      await tx.insert(profileSnapshots).values({
        profileId,
        data: {
          username: data.username,
          displayName: data.displayName,
          biography: data.biography,
          externalUrl: data.externalUrl,
          followersCount: data.followersCount,
          followingCount: data.followingCount,
          mediaCount: data.mediaCount,
        },
      });

      for (let i = 0; i < data.media.length; i++) {
        const m = data.media[i];
        const thumb = thumbs[i];
        await tx
          .insert(importedPosts)
          .values({
            profileId,
            igMediaId: m.id,
            mediaType: m.mediaType,
            thumbAssetId: thumb?.assetId ?? null,
            permalink: m.permalink,
            caption: m.caption,
            publishedAt: m.publishedAt,
          })
          .onConflictDoUpdate({
            target: [importedPosts.profileId, importedPosts.igMediaId],
            set: {
              mediaType: m.mediaType,
              permalink: m.permalink,
              caption: m.caption,
              publishedAt: m.publishedAt,
              ...(thumb ? { thumbAssetId: thumb.assetId } : {}),
              updatedAt: new Date(),
            },
          });
      }
    });
    return { ok: true, imported: data.media.length };
  } catch (e) {
    console.error("[import] persist failed:", e instanceof Error ? e.message : e);
    return failImport(profileId, {
      code: "provider_down",
      message: "Falha ao salvar a importação.",
    });
  }
}
