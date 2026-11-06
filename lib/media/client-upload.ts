/**
 * Browser-only upload client: requestUpload → PUT (XHR, progress, retry) → completeUpload.
 * Videos also capture a poster frame in the browser and upload it as an image asset.
 */
import { completeUpload, requestUpload } from "@/lib/media/actions";
import {
  IMAGE_MAX_BYTES,
  IMAGE_TYPES,
  UPLOAD_ERROR_MESSAGES,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_MS,
  VIDEO_TYPES,
  type AssetKind,
  type AssetStatus,
  type UploadTicket,
} from "@/lib/media/contracts";

export type UploadPhase = "uploading" | "processing" | "ready";

export class UploadError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? UPLOAD_ERROR_MESSAGES[code] ?? "Não foi possível enviar o arquivo.");
    this.code = code;
  }
  /** Retrying cannot help for these. */
  get permanent(): boolean {
    return ["invalid_type", "too_large", "too_long", "aborted"].includes(this.code);
  }
}

const EXT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

/** Some browsers leave `type` empty for HEIC/MOV; fall back to the extension. */
export function resolveContentType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TYPES[ext] ?? "";
}

/** Returns an UPLOAD_ERROR_MESSAGES key, or null when the file is acceptable. */
export function validateFile(file: File, kind: AssetKind): "invalid_type" | "too_large" | null {
  const type = resolveContentType(file);
  const allowed: readonly string[] = kind === "image" ? IMAGE_TYPES : VIDEO_TYPES;
  if (!allowed.includes(type)) return "invalid_type";
  if (file.size > (kind === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES)) return "too_large";
  return null;
}

export type ImageSize = { width: number; height: number };

export async function readImageSize(file: Blob): Promise<ImageSize | null> {
  try {
    const bmp = await createImageBitmap(file);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    // fall through to <img>
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<ImageSize | null>((resolve) => {
      const img = new Image();
      img.onload = () =>
        resolve(img.naturalWidth ? { width: img.naturalWidth, height: img.naturalHeight } : null);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type VideoMeta = { durationMs: number; width: number; height: number };

export function readVideoMeta(file: Blob): Promise<VideoMeta | null> {
  const url = URL.createObjectURL(file);
  return new Promise<VideoMeta | null>((resolve) => {
    const video = document.createElement("video");
    const done = (meta: VideoMeta | null) => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || !video.videoWidth) return done(null);
      done({
        durationMs: Math.max(1, Math.round(video.duration * 1000)),
        width: video.videoWidth,
        height: video.videoHeight,
      });
    };
    video.onerror = () => done(null);
    video.src = url;
  });
}

/** Draws the frame at `timeSec` to a JPEG blob (max 1080px on the long side). */
export function captureVideoFrame(file: Blob, timeSec: number): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  return new Promise<Blob | null>((resolve) => {
    const video = document.createElement("video");
    const done = (blob: Blob | null) => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.onerror = () => done(null);
    video.onloadedmetadata = () => {
      const max = Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.05) : timeSec;
      video.currentTime = Math.min(Math.max(0, timeSec), max);
    };
    video.onseeked = () => {
      const scale = Math.min(1, 1080 / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return done(null);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => done(b), "image/jpeg", 0.85);
    };
    video.src = url;
  });
}

const MAX_RETRIES = 3;
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new UploadError("aborted", "Envio cancelado."));
      },
      { once: true },
    );
  });

type PutOutcome = { ok: true } | { ok: false; retry: boolean };

function putOnce(
  ticket: UploadTicket,
  body: Blob,
  onProgress: (f: number) => void,
  signal?: AbortSignal,
): Promise<PutOutcome> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(ticket.method, ticket.uploadUrl);
    for (const [k, v] of Object.entries(ticket.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve({ ok: true });
      else resolve({ ok: false, retry: xhr.status >= 500 });
    };
    xhr.onerror = () => resolve({ ok: false, retry: true });
    xhr.ontimeout = () => resolve({ ok: false, retry: true });
    xhr.onabort = () => reject(new UploadError("aborted", "Envio cancelado."));
    const onAbort = () => xhr.abort();
    if (signal?.aborted) return onAbort();
    signal?.addEventListener("abort", onAbort, { once: true });
    xhr.send(body);
  });
}

/** PUT with up to 3 retries (network error or 5xx), exponential backoff 800ms/1.6s/3.2s. */
async function putWithRetry(
  ticket: UploadTicket,
  body: Blob,
  onProgress: (f: number) => void,
  signal?: AbortSignal,
) {
  for (let attempt = 0; ; attempt++) {
    onProgress(0);
    const res = await putOnce(ticket, body, onProgress, signal);
    if (res.ok) return;
    if (!res.retry || attempt >= MAX_RETRIES) {
      throw new UploadError("network", "Falha no envio. Verifique a conexão e tente de novo.");
    }
    await sleep(800 * 2 ** attempt, signal);
  }
}

async function requestTicket(
  profileId: string,
  blob: Blob,
  filename: string,
  contentType: string,
  kind: AssetKind,
) {
  const res = await requestUpload({ profileId, filename, contentType, size: blob.size, kind });
  if (!res.ok) throw new UploadError(res.code, res.message);
  return res.data;
}

export type UploadResult = {
  assetId: string;
  status: AssetStatus;
};

export type UploadOptions = {
  profileId: string;
  file: File;
  kind: AssetKind;
  /** fraction 0..1 of the whole operation, and the current phase. */
  onProgress?: (fraction: number, phase: UploadPhase) => void;
  signal?: AbortSignal;
  /** Video only: called once metadata is read (lets the UI show the poster scrubber). */
  onMeta?: (meta: VideoMeta) => void;
  /** Video only: poster time in seconds, read after the video PUT finishes (default 0.5). */
  posterTime?: () => number;
};

export async function uploadFile(opts: UploadOptions): Promise<UploadResult> {
  const { profileId, file, kind, onProgress, signal, onMeta, posterTime } = opts;
  const invalid = validateFile(file, kind);
  if (invalid) throw new UploadError(invalid);
  const contentType = resolveContentType(file);

  let image: ImageSize | null = null;
  let video: VideoMeta | null = null;
  if (kind === "image") {
    image = await readImageSize(file);
  } else {
    video = await readVideoMeta(file);
    if (video) {
      if (video.durationMs > VIDEO_MAX_MS) throw new UploadError("too_long");
      onMeta?.(video);
    }
  }

  const ticket = await requestTicket(profileId, file, file.name, contentType, kind);
  // Video bytes dominate; leave the last 5% for poster + processing.
  const span = kind === "video" ? 0.95 : 0.97;
  await putWithRetry(ticket, file, (f) => onProgress?.(f * span, "uploading"), signal);
  onProgress?.(span, "processing");

  let posterAssetId: string | undefined;
  if (kind === "video" && video) {
    const t = posterTime?.() ?? 0.5;
    const blob = await captureVideoFrame(file, t);
    if (blob) {
      const pTicket = await requestTicket(profileId, blob, "poster.jpg", "image/jpeg", "image");
      await putWithRetry(pTicket, blob, () => {}, signal);
      const size = await readImageSize(blob);
      const pDone = await completeUpload({
        assetId: pTicket.assetId,
        width: size?.width,
        height: size?.height,
      });
      if (!pDone.ok) throw new UploadError(pDone.code, pDone.message);
      posterAssetId = pTicket.assetId;
    }
  }

  const done = await completeUpload({
    assetId: ticket.assetId,
    width: image?.width ?? video?.width,
    height: image?.height ?? video?.height,
    durationMs: video?.durationMs,
    posterAssetId,
  });
  if (!done.ok) throw new UploadError(done.code, done.message);
  onProgress?.(1, done.data.status === "ready" ? "ready" : "processing");
  return { assetId: ticket.assetId, status: done.data.status };
}
