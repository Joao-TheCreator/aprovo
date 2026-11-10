/**
 * Reviewer access for the Meta App Review (docs/10 §9).
 *
 * A single e-mail + password login, enabled only while three environment variables exist:
 *   REVIEWER_LOGIN_ENABLED=true
 *   REVIEWER_EMAIL=<address shown to the reviewer; it never receives mail>
 *   REVIEWER_PASSWORD_HASH=<output of `pnpm reviewer:hash <password>`>
 * It creates (once) a regular user with its own workspace and issues an Auth.js database
 * session, so every other part of the app treats the reviewer as a normal member.
 * Turn it off by removing REVIEWER_LOGIN_ENABLED and running `pnpm reviewer:revoke`.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { sessions, users, workspaceMembers } from "@/db/schema";
import { allow } from "@/lib/approvals/rate-limit";
import { createWorkspaceForUser } from "@/lib/workspace/create";

export const REVIEWER_NAME = "Revisor Meta";
export const REVIEWER_SESSION_DAYS = 7;
const SCRYPT_N = 16384;
const SCRYPT_KEYLEN = 64;
const LOGIN_ATTEMPTS_PER_MINUTE = 5;

export type ReviewerEnv = { enabled: boolean; email: string | null; passwordHash: string | null };

export function readReviewerEnv(
  env: Record<string, string | undefined> = process.env,
): ReviewerEnv {
  const email = env.REVIEWER_EMAIL?.trim().toLowerCase() || null;
  const passwordHash = env.REVIEWER_PASSWORD_HASH?.trim() || null;
  const enabled = env.REVIEWER_LOGIN_ENABLED === "true" && Boolean(email && passwordHash);
  return { enabled, email, passwordHash };
}

export function reviewerLoginEnabled(): boolean {
  return readReviewerEnv().enabled;
}

/**
 * `scrypt:<salt b64url>:<key b64url>`. Colons on purpose: a `$` would be expanded by the
 * .env loaders of Next.js and dotenv-expand, silently corrupting the hash.
 */
export function hashPassword(password: string): string {
  if (password.length < 12)
    throw new Error("A senha do revisor precisa ter pelo menos 12 caracteres.");
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N });
  return `scrypt:${salt.toString("base64url")}:${key.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "base64url");
  const expected = Buffer.from(parts[2], "base64url");
  if (salt.length === 0 || expected.length !== SCRYPT_KEYLEN) return false;
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N });
  return timingSafeEqual(actual, expected);
}

function sameString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // Compare against itself when lengths differ so timing stays flat; the result is still false.
  return ab.length === bb.length ? timingSafeEqual(ab, bb) : (timingSafeEqual(ab, ab), false);
}

export type ReviewerSignInResult =
  | { ok: true; sessionToken: string; expires: Date; userId: string }
  | { ok: false; code: "disabled" | "rate_limited" | "invalid_credentials" };

/**
 * Verifies the credentials and issues a database session (same table Auth.js reads).
 * Never reveals which of e-mail or password failed.
 */
export async function signInReviewer(
  db: Database,
  input: { email: string; password: string; ip: string },
  env: ReviewerEnv = readReviewerEnv(),
): Promise<ReviewerSignInResult> {
  if (!env.enabled || !env.email || !env.passwordHash) return { ok: false, code: "disabled" };
  if (!allow(`reviewer:${input.ip}`, LOGIN_ATTEMPTS_PER_MINUTE)) {
    return { ok: false, code: "rate_limited" };
  }
  const emailOk = sameString(input.email.trim().toLowerCase(), env.email);
  const passwordOk = verifyPassword(input.password, env.passwordHash);
  if (!emailOk || !passwordOk) return { ok: false, code: "invalid_credentials" };

  const userId = await ensureReviewerUser(db, env.email);
  const sessionToken = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + REVIEWER_SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ sessionToken, userId, expires });
  return { ok: true, sessionToken, expires, userId };
}

async function ensureReviewerUser(db: Database, email: string): Promise<string> {
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user =
    existing ??
    (
      await db
        .insert(users)
        .values({ email, name: REVIEWER_NAME, emailVerified: new Date() })
        .returning()
    )[0];
  const [membership] = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, user.id)))
    .limit(1);
  if (!membership) {
    await createWorkspaceForUser(db, { id: user.id, name: "Revisão Meta", email: user.email });
  }
  return user.id;
}

/** Deletes every session of the reviewer user (used by `pnpm reviewer:revoke`). Returns the count. */
export async function revokeReviewerSessions(db: Database, email: string): Promise<number> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) return 0;
  const deleted = await db.delete(sessions).where(eq(sessions.userId, user.id)).returning();
  return deleted.length;
}

/** Auth.js cookie name: the `__Secure-` prefix is used when the site runs on HTTPS. */
export function sessionCookieName(
  authUrl = process.env.AUTH_URL ?? process.env.APP_URL ?? "",
): string {
  return authUrl.startsWith("https://") ? "__Secure-authjs.session-token" : "authjs.session-token";
}
