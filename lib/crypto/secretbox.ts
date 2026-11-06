// Server-only module: never import from client components.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * AES-256-GCM envelope for secrets at rest (e.g. Instagram access tokens).
 * Key = HKDF-SHA256(AUTH_SECRET, info "aprovo/secretbox/v1"). Format: `v1:<iv>:<ciphertext>:<tag>` (base64).
 * Rotating AUTH_SECRET makes stored secrets undecryptable (users must reconnect).
 */
const VERSION = "v1";

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  return Buffer.from(hkdfSync("sha256", secret, "aprovo", "aprovo/secretbox/v1", 32));
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), ct.toString("base64"), tag.toString("base64")].join(":");
}

export function decrypt(enc: string): string {
  const [version, iv, ct, tag] = enc.split(":");
  if (version !== VERSION || !iv || ct === undefined || !tag) {
    throw new Error("Invalid secretbox payload.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString(
    "utf8",
  );
}
