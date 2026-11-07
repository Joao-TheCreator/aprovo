import { asc, eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db/client";
import { mediaAssets, postMedia, posts } from "@/db/schema";
import type { MediaAssetRow } from "@/lib/media/urls";
import { getStorage, storageKey } from "@/lib/storage";
import { buildCaption } from "./caption";
import {
  PublishValidationError,
  type PreparedMedia,
  type PublishValidationIssue,
} from "./contracts";

/*
 * Limits from docs/12 section 3 (values known up to Nov/2026). Items marked [confirmar] were not
 * verified against Meta's current documentation.
 */
/** Single image up to 8 MB. [confirmar] */
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
/** Images wider than 1440 px are resized by Meta; we resize first. [confirmar] */
export const IMAGE_MAX_SIDE = 1440;
/** Minimum image width. [confirmar] */
export const IMAGE_MIN_WIDTH = 320;
/** Accepted aspect ratio (width / height): 4:5 to 1.91:1, compared with tolerance. [confirmar] */
export const ASPECT_MIN = 4 / 5;
export const ASPECT_MAX = 1.91;
export const ASPECT_TOLERANCE = 0.01;
/** Carousel size, 2 to 10 items. [confirmar] */
export const CAROUSEL_MIN_ITEMS = 2;
export const CAROUSEL_MAX_ITEMS = 10;
/** Video up to 1 GB. [confirmar] */
export const VIDEO_MAX_BYTES = 1024 * 1024 * 1024;
/** Video duration 3 s to 15 min. [confirmar] */
export const VIDEO_MAX_DURATION_MS = 15 * 60 * 1000;
export const VIDEO_MIN_DURATION_MS = 3000;
export const VIDEO_MIME_TYPES: readonly string[] = ["video/mp4", "video/quicktime"];
const IMAGE_MIME_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

/** Signed read URL lifetimes (docs/12 section 4.2): the Meta fetch can be slow for videos. */
export const PUBLISH_URL_TTL_SEC = { image: 2 * 3600, video: 4 * 3600 } as const;

export type ValidatablePost = {
  kind: "post" | "video";
  media: Array<{ asset: MediaAssetRow; sortOrder: number }>;
};

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function ratioLabel(w: number, h: number): string {
  const g = gcd(w, h);
  const rw = w / g;
  const rh = h / g;
  if (rw <= 50 && rh <= 50) return `${rw}:${rh}`;
  return `${(w / h).toFixed(2)}:1`;
}

/** Pure check of everything Instagram would reject, before scheduling or calling Meta. */
export function validateForInstagram(post: ValidatablePost): PublishValidationIssue[] {
  const items = [...post.media].sort((a, b) => a.sortOrder - b.sortOrder);
  if (items.length === 0) {
    return [{ code: "no_media", message: "O post não tem mídia para publicar." }];
  }
  if (items.length > CAROUSEL_MAX_ITEMS) {
    return [
      {
        code: "too_many_items",
        message: `O Instagram aceita no máximo ${CAROUSEL_MAX_ITEMS} itens por carrossel.`,
      },
    ];
  }
  const issues: PublishValidationIssue[] = [];
  if (post.kind === "video") {
    if (items.length > 1) {
      issues.push({ code: "too_many_items", message: "Um Reel aceita apenas um vídeo." });
    } else if (items[0].asset.kind !== "video") {
      issues.push({
        code: "unsupported_type",
        message: "Um post de vídeo precisa de um vídeo.",
        assetId: items[0].asset.id,
      });
    }
  }
  items.forEach(({ asset }, idx) => {
    const n = idx + 1;
    const label = asset.kind === "video" ? "O vídeo" : "A imagem";
    if (asset.status !== "ready") {
      issues.push({
        code: "media_not_ready",
        message: `${label} ${n} ainda está sendo ${asset.kind === "video" ? "processado" : "processada"}.`,
        assetId: asset.id,
      });
      return;
    }
    if (asset.kind === "video") {
      if (!asset.mimeType || !VIDEO_MIME_TYPES.includes(asset.mimeType)) {
        issues.push({
          code: "unsupported_type",
          message: `O vídeo ${n} precisa ser MP4 ou MOV.`,
          assetId: asset.id,
        });
      }
      if (asset.sizeBytes !== null && asset.sizeBytes > VIDEO_MAX_BYTES) {
        issues.push({
          code: "media_rejected",
          message: `O vídeo ${n} passa de 1 GB, o limite do Instagram.`,
          assetId: asset.id,
        });
      }
      if (asset.durationMs !== null && asset.durationMs > VIDEO_MAX_DURATION_MS) {
        issues.push({
          code: "media_rejected",
          message: `O vídeo ${n} passa de 15 minutos, o limite do Instagram.`,
          assetId: asset.id,
        });
      }
      if (asset.durationMs !== null && asset.durationMs < VIDEO_MIN_DURATION_MS) {
        issues.push({
          code: "media_rejected",
          message: `O vídeo ${n} tem menos de 3 segundos, o mínimo do Instagram.`,
          assetId: asset.id,
        });
      }
      return;
    }
    if (!asset.mimeType || !IMAGE_MIME_TYPES.includes(asset.mimeType)) {
      issues.push({
        code: "unsupported_type",
        message: `A imagem ${n} está em um formato que o Instagram não aceita. Use JPG, PNG, WebP ou HEIC.`,
        assetId: asset.id,
      });
      return;
    }
    const { width: w, height: h } = asset;
    if (!w || !h) {
      issues.push({
        code: "media_rejected",
        message: `Não foi possível ler as dimensões da imagem ${n}.`,
        assetId: asset.id,
      });
      return;
    }
    if (w < IMAGE_MIN_WIDTH) {
      issues.push({
        code: "media_rejected",
        message: `A imagem ${n} é estreita demais; o Instagram exige no mínimo ${IMAGE_MIN_WIDTH} px de largura.`,
        assetId: asset.id,
      });
    }
    const ratio = w / h;
    if (ratio < ASPECT_MIN - ASPECT_TOLERANCE || ratio > ASPECT_MAX + ASPECT_TOLERANCE) {
      issues.push({
        code: "media_rejected",
        message: `A imagem ${n} tem proporção ${ratioLabel(w, h)}; o Instagram aceita entre 4:5 e 1.91:1.`,
        assetId: asset.id,
      });
    }
  });
  return issues;
}

export type PublishDerivative = { key: string; bytes: number; width: number; height: number };

function scaledSize(w: number, h: number): { width: number; height: number } {
  const longest = Math.max(w, h);
  if (longest <= IMAGE_MAX_SIDE) return { width: w, height: h };
  const f = IMAGE_MAX_SIDE / longest;
  return { width: Math.max(1, Math.round(w * f)), height: Math.max(1, Math.round(h * f)) };
}

/**
 * Returns the storage key Instagram should fetch for this asset. Originals are never modified:
 * images that already comply are used as is; others get a single JPEG under `publish/` (generated
 * once, then reused through `media_assets.publish_path`). Videos are sent untouched.
 */
export async function ensurePublishDerivative(asset: MediaAssetRow): Promise<PublishDerivative> {
  const storage = getStorage();
  if (asset.kind === "video") {
    return {
      key: asset.originalPath,
      bytes: asset.sizeBytes ?? 0,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
    };
  }

  if (
    asset.mimeType === "image/jpeg" &&
    asset.sizeBytes !== null &&
    asset.sizeBytes <= IMAGE_MAX_BYTES &&
    asset.width !== null &&
    asset.height !== null &&
    Math.max(asset.width, asset.height) <= IMAGE_MAX_SIDE
  ) {
    return {
      key: asset.originalPath,
      bytes: asset.sizeBytes,
      width: asset.width,
      height: asset.height,
    };
  }

  // Re-read: the caller's row may be stale when preparations repeat or race.
  const [fresh] = await db
    .select({ publishPath: mediaAssets.publishPath })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, asset.id))
    .limit(1);
  const existing = fresh?.publishPath ?? asset.publishPath;
  if (existing) {
    const head = await storage.headObject(existing);
    if (head) {
      const dims =
        asset.width && asset.height
          ? scaledSize(asset.width, asset.height)
          : { width: 0, height: 0 };
      return { key: existing, bytes: head.size, ...dims };
    }
  }

  const original = await storage.getObject(asset.originalPath);
  if (!original) throw new Error("original missing");
  const { data, info } = await sharp(original.body, { failOn: "none" })
    .rotate()
    .resize(IMAGE_MAX_SIDE, IMAGE_MAX_SIDE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const key = storageKey("publish", asset.workspaceId, asset.id, "publish.jpg");
  await storage.putObject(key, data, "image/jpeg");
  await db.update(mediaAssets).set({ publishPath: key }).where(eq(mediaAssets.id, asset.id));
  return { key, bytes: data.length, width: info.width, height: info.height };
}

/** Short-lived signed read URL for Meta to download. Never store or log it. */
export async function signedMediaUrl(key: string, kind: "image" | "video"): Promise<string> {
  return getStorage().getSignedUrl(key, PUBLISH_URL_TTL_SEC[kind]);
}

/**
 * Loads a post, validates it for Instagram and returns signed URLs ready for container creation.
 * No auth here: callers (scheduler or an already authorized action) own that.
 */
export async function preparePostMedia(postId: string): Promise<PreparedMedia> {
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) throw new Error("post not found");
  const rows = await db
    .select({ asset: mediaAssets, sortOrder: postMedia.sortOrder })
    .from(postMedia)
    .innerJoin(mediaAssets, eq(postMedia.assetId, mediaAssets.id))
    .where(eq(postMedia.postId, postId))
    .orderBy(asc(postMedia.sortOrder), asc(postMedia.createdAt));

  const issues = validateForInstagram({ kind: post.kind, media: rows });
  if (issues.length > 0) throw new PublishValidationError(issues);

  const storage = getStorage();
  const items = await Promise.all(
    rows.map(async ({ asset }) => {
      const derivative = await ensurePublishDerivative(asset);
      const url = await signedMediaUrl(derivative.key, asset.kind);
      const coverUrl =
        asset.kind === "video" && asset.posterPath
          ? await storage.getSignedUrl(asset.posterPath, PUBLISH_URL_TTL_SEC.video)
          : undefined;
      return {
        assetId: asset.id,
        kind: asset.kind,
        url,
        ...(coverUrl ? { coverUrl } : {}),
        width: derivative.width || null,
        height: derivative.height || null,
      };
    }),
  );
  return { kind: post.kind, caption: buildCaption(post.caption, post.hashtags), items };
}
