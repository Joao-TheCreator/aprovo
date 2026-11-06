/**
 * Shared contract for Phase 2 media uploads. UI and backend both import from here.
 * Flow: requestUpload → client PUTs the file to uploadUrl → completeUpload (server processes).
 */
import { z } from "zod";
import type { ActionResult } from "@/lib/profiles/contracts";

export const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;
export const VIDEO_TYPES = ["video/mp4", "video/quicktime"] as const;
export const IMAGE_MAX_BYTES = 30 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 300 * 1024 * 1024;
export const VIDEO_MAX_MS = 90_000;
export const CAROUSEL_MAX = 10;

export type AssetKind = "image" | "video";
export type AssetStatus = "uploading" | "processing" | "ready" | "failed";

export const requestUploadSchema = z.object({
  profileId: z.string().uuid(),
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
  kind: z.enum(["image", "video"]),
});
export type RequestUploadInput = z.infer<typeof requestUploadSchema>;

export type UploadTicket = {
  assetId: string;
  /** Where the client PUTs the raw file (presigned S3 URL or local /api/files URL). */
  uploadUrl: string;
  method: "PUT";
  /** Headers the client must send with the PUT (at least Content-Type). */
  headers: Record<string, string>;
};

export const completeUploadSchema = z.object({
  assetId: z.string().uuid(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationMs: z.number().int().positive().optional(),
  /** For videos: the image asset holding the poster frame captured in the browser. */
  posterAssetId: z.string().uuid().optional(),
});
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;

export type AssetUrls = {
  assetId: string;
  kind: AssetKind;
  status: AssetStatus;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** 640px WebP (fit), for grid cells and strips. */
  thumbUrl: string | null;
  /** 1080px WebP (fit), for the detail view. */
  previewUrl: string | null;
  /** Signed URL of the untouched original (video src; "Baixar original"). */
  originalUrl: string | null;
  /** Video poster (1080px). */
  posterUrl: string | null;
};

export type RequestUploadResult = ActionResult<UploadTicket>;
export type CompleteUploadResult = ActionResult<{ status: AssetStatus }>;

export const UPLOAD_ERROR_MESSAGES: Record<string, string> = {
  invalid_type:
    "Formato não suportado. Use JPG, PNG, WebP ou HEIC para fotos e MP4 ou MOV para vídeo.",
  too_large: "Arquivo grande demais. Fotos até 30 MB e vídeos até 300 MB.",
  too_long: "Vídeo longo demais. O limite é 90 segundos.",
  processing_failed: "Não conseguimos processar este arquivo. Tente outro.",
  not_found: "Arquivo não encontrado.",
};
