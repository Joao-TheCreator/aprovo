"use server";
/** Phase 2 media uploads. Flow: requestUpload -> client PUT -> completeUpload (server processing). */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mediaAssets } from "@/db/schema";
import { requireWorkspaceForProfile, requireWorkspaceMember } from "@/lib/auth/require";
import { getStorage, storageKey } from "@/lib/storage";
import {
  completeUploadSchema,
  IMAGE_MAX_BYTES,
  IMAGE_TYPES,
  requestUploadSchema,
  UPLOAD_ERROR_MESSAGES,
  VIDEO_MAX_BYTES,
  VIDEO_TYPES,
  type CompleteUploadInput,
  type CompleteUploadResult,
  type RequestUploadInput,
  type RequestUploadResult,
} from "./contracts";
import { processAsset } from "./process";

const EXT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

function err(code: string) {
  return { ok: false as const, code, message: UPLOAD_ERROR_MESSAGES[code] ?? "Erro." };
}

function isNextNotFound(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

function safeFilename(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/"));
  const cleaned = base
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^\.+/, "")
    .slice(-120);
  return cleaned || "file";
}

export async function requestUpload(input: RequestUploadInput): Promise<RequestUploadResult> {
  const parsed = requestUploadSchema.safeParse(input);
  if (!parsed.success) return err("invalid_type");
  const { profileId, filename, size, kind } = parsed.data;
  let contentType = parsed.data.contentType.toLowerCase();

  let ctx: Awaited<ReturnType<typeof requireWorkspaceForProfile>>;
  try {
    ctx = await requireWorkspaceForProfile(profileId);
  } catch (e) {
    if (isNextNotFound(e)) return err("not_found");
    throw e;
  }

  if (contentType === "application/octet-stream" || contentType === "") {
    contentType = EXT_TYPES[path.extname(filename).toLowerCase()] ?? contentType;
  }
  const allowed: readonly string[] = kind === "image" ? IMAGE_TYPES : VIDEO_TYPES;
  if (!allowed.includes(contentType)) return err("invalid_type");
  if (size > (kind === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES)) return err("too_large");

  const assetId = randomUUID();
  const key = storageKey("originals", ctx.workspaceId, assetId, safeFilename(filename));
  const signed = await getStorage().getSignedUploadUrl(key, contentType, 900);
  await db.insert(mediaAssets).values({
    id: assetId,
    workspaceId: ctx.workspaceId,
    kind,
    status: "uploading",
    mimeType: contentType,
    sizeBytes: size,
    originalPath: key,
  });
  return {
    ok: true,
    data: { assetId, uploadUrl: signed.url, method: "PUT", headers: signed.headers },
  };
}

export async function completeUpload(input: CompleteUploadInput): Promise<CompleteUploadResult> {
  const parsed = completeUploadSchema.safeParse(input);
  if (!parsed.success) return err("not_found");
  const { assetId, ...rest } = parsed.data;
  const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId)).limit(1);
  if (!asset) return err("not_found");
  try {
    await requireWorkspaceMember(asset.workspaceId);
  } catch (e) {
    if (isNextNotFound(e)) return err("not_found");
    throw e;
  }
  if (asset.status === "ready") return { ok: true, data: { status: "ready" } };
  await db.update(mediaAssets).set({ status: "processing" }).where(eq(mediaAssets.id, assetId));
  return processAsset(assetId, rest);
}
