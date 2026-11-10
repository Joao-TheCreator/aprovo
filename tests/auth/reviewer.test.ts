import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { sessions, users, workspaceMembers } from "@/db/schema";
import { resetRateLimits } from "@/lib/approvals/rate-limit";
import {
  hashPassword,
  readReviewerEnv,
  revokeReviewerSessions,
  sessionCookieName,
  signInReviewer,
  verifyPassword,
  type ReviewerEnv,
} from "@/lib/auth/reviewer";
import { testDb as db } from "../setup";

const PASSWORD = "correct horse battery staple";
let env: ReviewerEnv;

beforeEach(() => {
  resetRateLimits();
  env = { enabled: true, email: "reviewer@aprovo.app", passwordHash: hashPassword(PASSWORD) };
});

describe("reviewer password hashing", () => {
  it("round-trips and rejects wrong or malformed input", () => {
    expect(verifyPassword(PASSWORD, env.passwordHash!)).toBe(true);
    expect(verifyPassword("wrong password here", env.passwordHash!)).toBe(false);
    expect(verifyPassword(PASSWORD, "plain")).toBe(false);
    expect(hashPassword(PASSWORD)).not.toBe(env.passwordHash);
  });
  it("refuses short passwords", () => {
    expect(() => hashPassword("short")).toThrow();
  });
});

describe("readReviewerEnv", () => {
  it("is disabled unless the flag and both values are present", () => {
    expect(readReviewerEnv({}).enabled).toBe(false);
    expect(
      readReviewerEnv({ REVIEWER_LOGIN_ENABLED: "true", REVIEWER_EMAIL: "a@b.c" }).enabled,
    ).toBe(false);
    expect(
      readReviewerEnv({
        REVIEWER_LOGIN_ENABLED: "true",
        REVIEWER_EMAIL: "A@B.C ",
        REVIEWER_PASSWORD_HASH: "x",
      }),
    ).toEqual({ enabled: true, email: "a@b.c", passwordHash: "x" });
  });
  it("picks the secure cookie name on https", () => {
    expect(sessionCookieName("https://aprovo-six.vercel.app")).toBe(
      "__Secure-authjs.session-token",
    );
    expect(sessionCookieName("http://localhost:3000")).toBe("authjs.session-token");
  });
});

describe("signInReviewer", () => {
  it("creates the user, a workspace and a session on the first login; reuses them afterwards", async () => {
    const first = await signInReviewer(
      db,
      { email: "Reviewer@Aprovo.app", password: PASSWORD, ip: "1.1.1.1" },
      env,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const [user] = await db.select().from(users).where(eq(users.email, "reviewer@aprovo.app"));
    expect(user.id).toBe(first.userId);
    expect(user.name).toBe("Revisor Meta");
    const members = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, user.id));
    expect(members).toHaveLength(1);
    const second = await signInReviewer(
      db,
      { email: "reviewer@aprovo.app", password: PASSWORD, ip: "1.1.1.1" },
      env,
    );
    expect(second.ok).toBe(true);
    const all = await db.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(all).toHaveLength(2);
    expect(all[0].expires.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);
    expect(await revokeReviewerSessions(db, "reviewer@aprovo.app")).toBe(2);
    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it("rejects wrong credentials without creating anything, and when disabled", async () => {
    const bad = await signInReviewer(
      db,
      { email: "reviewer@aprovo.app", password: "nope nope nope", ip: "2.2.2.2" },
      env,
    );
    expect(bad).toEqual({ ok: false, code: "invalid_credentials" });
    const other = await signInReviewer(
      db,
      { email: "other@aprovo.app", password: PASSWORD, ip: "2.2.2.2" },
      env,
    );
    expect(other).toEqual({ ok: false, code: "invalid_credentials" });
    expect(await db.select().from(users)).toHaveLength(0);
    expect(await db.select().from(sessions)).toHaveLength(0);
    const off = await signInReviewer(
      db,
      { email: "reviewer@aprovo.app", password: PASSWORD, ip: "2.2.2.2" },
      { ...env, enabled: false },
    );
    expect(off).toEqual({ ok: false, code: "disabled" });
  });

  it("rate limits after five attempts per IP", async () => {
    for (let i = 0; i < 5; i++) {
      await signInReviewer(
        db,
        { email: "reviewer@aprovo.app", password: "wrong wrong wrong", ip: "3.3.3.3" },
        env,
      );
    }
    const sixth = await signInReviewer(
      db,
      { email: "reviewer@aprovo.app", password: PASSWORD, ip: "3.3.3.3" },
      env,
    );
    expect(sixth).toEqual({ ok: false, code: "rate_limited" });
    const otherIp = await signInReviewer(
      db,
      { email: "reviewer@aprovo.app", password: PASSWORD, ip: "4.4.4.4" },
      env,
    );
    expect(otherIp.ok).toBe(true);
  });
});
