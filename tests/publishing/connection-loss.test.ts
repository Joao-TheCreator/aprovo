import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activityLog, instagramConnections, posts, publications } from "@/db/schema";
import { checkConnectionHealth } from "@/lib/instagram/oauth";
import { testDb as db } from "../setup";
import { seedJob } from "./seed";

const mocks = vi.hoisted(() => ({ lost: vi.fn() }));
vi.mock("@/lib/email/send", () => ({
  sendConnectionLostEmail: mocks.lost,
  sendPublishedEmail: vi.fn(),
  sendPublishFailedEmail: vi.fn(),
  sendDecisionEmail: vi.fn(),
}));
vi.mock("@/lib/instagram/signed-request", () => ({
  parseSignedRequest: (raw: string) => (raw === "valid" ? { userId: "ig1" } : null),
}));

import { POST as deauthorize } from "@/app/api/instagram/deauthorize/route";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const metaError = (code: number, status = 400) =>
  (async () => json({ error: { code, message: "x" } }, status)) as unknown as typeof fetch;

beforeEach(() => {
  mocks.lost.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const FUTURE = new Date(Date.now() + 3_600_000);

/** Two scheduled publications and one already published for the same connection. */
async function seedConnection() {
  const first = await seedJob({ publication: { nextAttemptAt: FUTURE } });
  const second = await seedJob({ from: first, publication: { nextAttemptAt: FUTURE } });
  const third = await seedJob({
    from: first,
    publication: { status: "published", igMediaId: "live_1", publishedAt: new Date() },
  });
  await db
    .update(instagramConnections)
    .set({ connectedBy: first.user.id })
    .where(eq(instagramConnections.id, first.conn!.id));
  await db.update(posts).set({ status: "published" }).where(eq(posts.id, third.post.id));
  const [conn] = await db
    .select()
    .from(instagramConnections)
    .where(eq(instagramConnections.id, first.conn!.id));
  return { first, second, third, conn };
}

async function pubRow(id: string) {
  const [r] = await db.select().from(publications).where(eq(publications.id, id));
  return r;
}
async function postRow(id: string) {
  const [r] = await db.select().from(posts).where(eq(posts.id, id));
  return r;
}

describe("health check connection loss", () => {
  it("code 190 fails only the scheduled publications, once, with one e-mail", async () => {
    const { first, second, third, conn } = await seedConnection();
    const after = await checkConnectionHealth(conn, metaError(190));
    expect(after.status).toBe("expired");

    for (const j of [first, second]) {
      const row = await pubRow(j.pub.id);
      expect(row.status).toBe("failed");
      expect(row.lastErrorCode).toBe("token_expired");
      expect(row.lastError).toContain("expirou");
      expect(row.lockedAt).toBeNull();
      expect((await postRow(j.post.id)).status).toBe("publish_failed");
    }
    expect((await pubRow(third.pub.id)).status).toBe("published");
    expect((await postRow(third.post.id)).status).toBe("published");

    const logs = (await db.select().from(activityLog)).filter(
      (l) => l.event === "publication.failed",
    );
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.actor === "system:health")).toBe(true);

    expect(mocks.lost).toHaveBeenCalledTimes(1);
    expect(mocks.lost).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "a@x.co",
        username: "cliente",
        affected: 2,
        reason: "expired",
      }),
    );

    // A second run finds nothing left to fail and sends no second e-mail.
    await checkConnectionHealth(after, metaError(190));
    expect(mocks.lost).toHaveBeenCalledTimes(1);
  });

  it("code 10 uses missing_scope", async () => {
    const { first, conn } = await seedConnection();
    await checkConnectionHealth(conn, metaError(10, 403));
    expect((await pubRow(first.pub.id)).lastErrorCode).toBe("missing_scope");
  });

  it("a transient failure leaves the schedule alone", async () => {
    const { first, conn } = await seedConnection();
    await checkConnectionHealth(conn, (async () => json({}, 500)) as unknown as typeof fetch);
    expect((await pubRow(first.pub.id)).status).toBe("scheduled");
    expect(mocks.lost).not.toHaveBeenCalled();
  });

  it("sends no e-mail when nothing was scheduled", async () => {
    const job = await seedJob({ publication: { status: "cancelled" } });
    await db
      .update(instagramConnections)
      .set({ connectedBy: job.user.id })
      .where(eq(instagramConnections.id, job.conn!.id));
    const [conn] = await db
      .select()
      .from(instagramConnections)
      .where(eq(instagramConnections.id, job.conn!.id));
    await checkConnectionHealth(conn, metaError(190));
    expect(mocks.lost).not.toHaveBeenCalled();
  });
});

describe("deauthorize callback", () => {
  it("revokes the connection and fails its scheduled publications", async () => {
    const { first, second, third } = await seedConnection();
    const form = new FormData();
    form.set("signed_request", "valid");
    const res = await deauthorize(
      new NextRequest("http://localhost/api/instagram/deauthorize", { method: "POST", body: form }),
    );
    expect(res.status).toBe(200);

    const [conn] = await db
      .select()
      .from(instagramConnections)
      .where(eq(instagramConnections.id, first.conn!.id));
    expect(conn.status).toBe("revoked");
    for (const j of [first, second]) {
      const row = await pubRow(j.pub.id);
      expect(row.status).toBe("failed");
      expect(row.lastErrorCode).toBe("token_expired");
      expect((await postRow(j.post.id)).status).toBe("publish_failed");
    }
    expect((await pubRow(third.pub.id)).status).toBe("published");
    expect(mocks.lost).toHaveBeenCalledTimes(1);
    expect(mocks.lost).toHaveBeenCalledWith(
      expect.objectContaining({ affected: 2, reason: "revoked" }),
    );
  });
});
