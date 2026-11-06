import { createHmac, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Storage } from "./index";

const EXT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set (needed to sign local storage URLs).");
  return s;
}

/** Throws on empty, absolute, backslash, NUL or `..` segments. */
export function assertSafeKey(key: string): void {
  if (
    !key ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.includes("\0") ||
    key.split("/").some((s) => s === ".." || s === "." || s === "")
  ) {
    throw new Error("Invalid storage key.");
  }
}

export function signKey(key: string, exp: number): string {
  return createHmac("sha256", secret()).update(`${key}\n${exp}`).digest("base64url");
}

/** Verifies a signed local URL's query params. */
export function verifySignature(key: string, exp: string | null, sig: string | null): boolean {
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(signKey(key, Number(exp)));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export class LocalStorage implements Storage {
  private readonly root: string;

  constructor(root = process.env.LOCAL_STORAGE_DIR || ".data/storage") {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Invalid storage key.");
    return full;
  }

  async putObject(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
    await fs.writeFile(`${file}.meta.json`, JSON.stringify({ contentType }));
  }

  async getObject(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    const file = this.resolve(key);
    let body: Buffer;
    try {
      body = await fs.readFile(file);
    } catch {
      return null;
    }
    let contentType = EXT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    try {
      const meta = JSON.parse(await fs.readFile(`${file}.meta.json`, "utf8")) as {
        contentType?: string;
      };
      if (meta.contentType) contentType = meta.contentType;
    } catch {
      // sidecar optional
    }
    return { body, contentType };
  }

  async deleteObject(key: string): Promise<void> {
    const file = this.resolve(key);
    await fs.rm(file, { force: true });
    await fs.rm(`${file}.meta.json`, { force: true });
  }

  async getSignedUrl(key: string, ttlSeconds = 3600): Promise<string> {
    assertSafeKey(key);
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const base = (process.env.APP_URL || "").replace(/\/$/, "");
    const encoded = key.split("/").map(encodeURIComponent).join("/");
    return `${base}/api/files/${encoded}?exp=${exp}&sig=${signKey(key, exp)}`;
  }
}
