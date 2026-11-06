import { createHash } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db/client";
import { mediaAssets } from "@/db/schema";
import { getStorage, storageKey } from "@/lib/storage";
import type { ActionResult } from "@/lib/profiles/contracts";
import {
  IMAGE_MAX_BYTES,
  UPLOAD_ERROR_MESSAGES,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_MS,
  type AssetStatus,
  type CompleteUploadInput,
} from "./contracts";

export const PREVIEW_BOX = { width: 1080, height: 1350 } as const;
export const THUMB_PX = 640;

type Result = ActionResult<{ status: AssetStatus }>;

async function fail(assetId: string, code: string, detail?: string): Promise<Result> {
  await db.update(mediaAssets).set({ status: "failed" }).where(eq(mediaAssets.id, assetId));
  if (detail) console.warn(`[media] ${assetId} failed (${code}):`, detail);
  return { ok: false, code, message: UPLOAD_ERROR_MESSAGES[code] ?? "Falha ao processar." };
}

/**
 * Generates derivatives for an asset already present in storage and marks it ready/failed.
 * Originals are never modified. Dedup: when another ready asset of the same workspace has the same
 * sha256 and derivatives, those preview/thumb paths are reused instead of generating new files.
 */
export async function processAsset(
  assetId: string,
  input: Omit<CompleteUploadInput, "assetId"> = {},
): Promise<Result> {
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId)).limit(1);
  if (!asset) return { ok: false, code: "not_found", message: UPLOAD_ERROR_MESSAGES.not_found };
  const storage = getStorage();

  if (asset.kind === "video") return processVideo(asset, input);

  try {
    const original = await storage.getObject(asset.originalPath);
    if (!original) return await fail(assetId, "processing_failed", "original missing");
    if (original.body.length > IMAGE_MAX_BYTES) return await fail(assetId, "too_large");
    const sha256 = createHash("sha256").update(original.body).digest("hex");

    const meta = await sharp(original.body, { failOn: "none" }).metadata();
    if (!meta.width || !meta.height) return await fail(assetId, "processing_failed", "no size");
    const swap = (meta.orientation ?? 1) >= 5;
    const width = swap ? meta.height : meta.width;
    const height = swap ? meta.width : meta.height;

    let previewPath = storageKey("previews", asset.workspaceId, assetId, "preview.webp");
    let thumbPath = storageKey("thumbs", asset.workspaceId, assetId, "thumb.webp");

    const [dup] = await db
      .select({ previewPath: mediaAssets.previewPath, thumbPath: mediaAssets.thumbPath })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.workspaceId, asset.workspaceId),
          eq(mediaAssets.sha256, sha256),
          eq(mediaAssets.status, "ready"),
          eq(mediaAssets.kind, "image"),
          ne(mediaAssets.id, assetId),
        ),
      )
      .limit(1);

    if (dup?.previewPath && dup.thumbPath) {
      previewPath = dup.previewPath;
      thumbPath = dup.thumbPath;
    } else {
      const base = () => sharp(original.body, { failOn: "none" }).rotate();
      const [preview, thumb] = await Promise.all([
        base()
          .resize(PREVIEW_BOX.width, PREVIEW_BOX.height, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 82 })
          .toBuffer(),
        base()
          .resize(THUMB_PX, THUMB_PX, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer(),
      ]);
      await Promise.all([
        storage.putObject(previewPath, preview, "image/webp"),
        storage.putObject(thumbPath, thumb, "image/webp"),
      ]);
    }

    await db
      .update(mediaAssets)
      .set({
        width,
        height,
        sizeBytes: original.body.length,
        sha256,
        previewPath,
        thumbPath,
        status: "ready",
      })
      .where(eq(mediaAssets.id, assetId));
    return { ok: true, data: { status: "ready" } };
  } catch (e) {
    return fail(assetId, "processing_failed", e instanceof Error ? e.message : String(e));
  }
}

async function processVideo(
  asset: typeof mediaAssets.$inferSelect,
  input: Omit<CompleteUploadInput, "assetId">,
): Promise<Result> {
  const assetId = asset.id;
  try {
    const head = await getStorage().headObject(asset.originalPath);
    if (!head) return await fail(assetId, "processing_failed", "original missing");
    if (head.size > VIDEO_MAX_BYTES) return await fail(assetId, "too_large");
    if (input.durationMs !== undefined && input.durationMs > VIDEO_MAX_MS) {
      return await fail(assetId, "too_long");
    }

    let posterPath: string | null = null;
    let thumbPath: string | null = null;
    if (input.posterAssetId) {
      const [poster] = await db
        .select()
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.id, input.posterAssetId),
            eq(mediaAssets.workspaceId, asset.workspaceId),
          ),
        )
        .limit(1);
      if (!poster || poster.kind !== "image" || poster.status !== "ready") {
        return await fail(assetId, "processing_failed", "invalid poster asset");
      }
      posterPath = poster.previewPath;
      thumbPath = poster.thumbPath;
    }

    await db
      .update(mediaAssets)
      .set({
        sizeBytes: head.size,
        width: input.width ?? asset.width,
        height: input.height ?? asset.height,
        durationMs: input.durationMs ?? asset.durationMs,
        posterPath,
        thumbPath,
        status: "ready",
      })
      .where(eq(mediaAssets.id, assetId));
    return { ok: true, data: { status: "ready" } };
  } catch (e) {
    return fail(assetId, "processing_failed", e instanceof Error ? e.message : String(e));
  }
}
