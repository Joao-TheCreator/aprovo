import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes, base64url. The clear token is shown once and never stored or logged. */
export function issueToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hex; the only form persisted in approval_links.token_hash. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
