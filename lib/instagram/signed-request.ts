import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const payloadSchema = z.object({
  algorithm: z.string(),
  user_id: z.union([z.string().min(1), z.number()]),
  issued_at: z.number().optional(),
});

/**
 * Parses and verifies a Meta `signed_request` (`<base64url sig>.<base64url json payload>`, HMAC-SHA256
 * over the encoded payload, keyed with the app secret). Returns null for anything invalid.
 * [confirmar] the exact payload format for Instagram Login (user_id is the Instagram-scoped id).
 */
export function parseSignedRequest(
  raw: string,
  appSecret: string,
): { userId: string; issuedAt: number } | null {
  if (!appSecret) return null;
  const parts = raw.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [encodedSig, encodedPayload] = parts;

  const sig = Buffer.from(encodedSig, "base64url");
  const expected = createHmac("sha256", appSecret).update(encodedPayload).digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;

  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return null;
  if (parsed.data.algorithm.toUpperCase() !== "HMAC-SHA256") return null;
  return { userId: String(parsed.data.user_id), issuedAt: parsed.data.issued_at ?? 0 };
}
