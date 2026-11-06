import { createHash, randomUUID } from "node:crypto";
import sharp, { type OutputInfo } from "sharp";
import { db } from "@/db/client";
import { mediaAssets } from "@/db/schema";
import { getStorage, storageKey } from "@/lib/storage";

export const THUMB_MAX_PX = 640;

/**
 * ig-cache pipeline: image bytes -> WebP (max 640 px, fit inside, q80) -> storage ->
 * media_assets row (ready). Returns the asset id, or null when the bytes are not a decodable image.
 * Throws only on storage/DB failures.
 */
export async function storeCachedImage(
  workspaceId: string,
  input: Buffer,
): Promise<{ assetId: string; key: string } | null> {
  let out: { data: Buffer; info: OutputInfo };
  try {
    out = await sharp(input)
      .rotate()
      .resize(THUMB_MAX_PX, THUMB_MAX_PX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
  } catch (e) {
    console.warn("[thumbs] could not decode image:", e instanceof Error ? e.message : e);
    return null;
  }
  const assetId = randomUUID();
  const key = storageKey("ig-cache", workspaceId, assetId, "thumb.webp");
  await getStorage().putObject(key, out.data, "image/webp");
  await db.insert(mediaAssets).values({
    id: assetId,
    workspaceId,
    kind: "image",
    originalPath: key,
    thumbPath: key,
    width: out.info.width,
    height: out.info.height,
    sizeBytes: out.data.length,
    mimeType: "image/webp",
    sha256: createHash("sha256").update(out.data).digest("hex"),
    status: "ready",
  });
  return { assetId, key };
}
