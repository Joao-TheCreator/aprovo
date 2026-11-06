import type { mediaAssets } from "@/db/schema";
import { getStorage } from "@/lib/storage";
import type { AssetUrls } from "./contracts";

export type MediaAssetRow = typeof mediaAssets.$inferSelect;

const URL_TTL = 3600;

/** Signs thumb/preview/original/poster of every asset in one batch (1 h TTL). Order is preserved. */
export async function assetUrls(rows: MediaAssetRow[]): Promise<AssetUrls[]> {
  const storage = getStorage();
  const cache = new Map<string, Promise<string | null>>();
  const sign = (key: string | null): Promise<string | null> => {
    if (!key) return Promise.resolve(null);
    let p = cache.get(key);
    if (!p) {
      p = storage.getSignedUrl(key, URL_TTL).catch((e: unknown) => {
        console.warn("[media] signing failed:", e instanceof Error ? e.message : e);
        return null;
      });
      cache.set(key, p);
    }
    return p;
  };
  return Promise.all(
    rows.map(async (r) => {
      const [thumbUrl, previewUrl, originalUrl, posterUrl] = await Promise.all([
        sign(r.thumbPath),
        sign(r.previewPath),
        sign(r.originalPath),
        sign(r.posterPath),
      ]);
      return {
        assetId: r.id,
        kind: r.kind,
        status: r.status,
        width: r.width,
        height: r.height,
        durationMs: r.durationMs,
        thumbUrl,
        previewUrl,
        originalUrl,
        posterUrl,
      };
    }),
  );
}
