import { LocalStorage } from "./local";
import { S3Storage } from "./s3";

export interface Storage {
  putObject(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void>;
  getObject(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  deleteObject(key: string): Promise<void>;
  getSignedUrl(key: string, ttlSeconds?: number): Promise<string>;
}

export type StoragePrefix = "originals" | "previews" | "thumbs" | "ig-cache";

/** Key layout from docs/03 section 6: `<prefix>/<workspace_id>/<asset_id>/<filename>`. */
export function storageKey(
  prefix: StoragePrefix,
  workspaceId: string,
  assetId: string,
  filename: string,
): string {
  return `${prefix}/${workspaceId}/${assetId}/${filename}`;
}

/** Driver chosen by STORAGE_DRIVER ("local" default | "s3"). Cheap to call; no caching so env changes apply. */
export function getStorage(): Storage {
  return process.env.STORAGE_DRIVER === "s3" ? new S3Storage() : new LocalStorage();
}
