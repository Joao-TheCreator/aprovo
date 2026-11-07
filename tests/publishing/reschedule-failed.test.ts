import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { activityLog, instagramConnections, posts, publications } from "@/db/schema";
import { testDb as db } from "../setup";
import { makeRequireMock, seedWorkspace } from "../media/helpers";
import { seedJob } from "./seed";

const mocks = vi.hoisted(() => ({ user: { id: "" } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require", async () => makeRequireMock(mocks));

import { rescheduleFailedForConnection } from "@/lib/publishing/actions";
import { countRescheduleableFailures } from "@/lib/publishing/connection-loss";

type Seeded = Awaited<ReturnType<typeof seedJob>>;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

/** A publication that failed because the connection was lost, on an active (reconnected) connection. */
async function seedFailed(
  from?: Seeded,
  overrides: Partial<typeof publications.$inferInsert> = {},
): Promise<Seeded> {
  const job = await seedJob({
    from,
    publication: {
      status: "failed",
      attempts: 3,
      lastErrorCode: "token_expired",
      lastError: "A conexão com o Instagram expirou. Reconecte a conta para publicar.",
      scheduledAt: new Date(Date.now() - 3_600_000),
      ...overrides,
    },
  });
  await db.update(posts).set({ status: "publish_failed" }).where(eq(posts.id, job.post.id));
  return job;
}

describe("rescheduleFailedForConnection", () => {
  it("puts failed publications back in the queue after reconnecting", async () => {
    const a = await seedFailed();
    const b = await seedFailed(a, { scheduledAt: new Date(Date.now() + 3 * 3_600_000) });
    mocks.user.id = a.user.id;
    expect((await countRescheduleableFailures([a.conn!.id])).get(a.conn!.id)).toBe(2);

    const before = Date.now();
    const res = await rescheduleFailedForConnection(a.conn!.id);
    expect(res).toEqual({ ok: true, data: { rescheduled: 2 } });

    const [pa] = await db.select().from(publications).where(eq(publications.id, a.pub.id));
    expect(pa.status).toBe("scheduled");
    expect(pa.attempts).toBe(0);
    expect(pa.lastError).toBeNull();
    expect(pa.lastErrorCode).toBeNull();
    // Past schedule: runs about one minute from now.
    expect(pa.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 59_000);
    expect(pa.nextAttemptAt.getTime()).toBeLessThan(before + 5 * 60_000);

    const [pb] = await db.select().from(publications).where(eq(publications.id, b.pub.id));
    expect(pb.nextAttemptAt.getTime()).toBe(pb.scheduledAt.getTime());

    for (const j of [a, b]) {
      const [post] = await db.select().from(posts).where(eq(posts.id, j.post.id));
      expect(post.status).toBe("scheduled");
    }
    const logs = (await db.select().from(activityLog)).filter(
      (l) => l.event === "publication.rescheduled",
    );
    expect(logs).toHaveLength(2);
    expect(logs[0].payload).toMatchObject({ reason: "reconnected" });
    expect((await countRescheduleableFailures([a.conn!.id])).size).toBe(0);
  });

  it("ignores failures that a reconnection cannot fix", async () => {
    const a = await seedFailed(undefined, { lastErrorCode: "media_rejected" });
    mocks.user.id = a.user.id;
    const res = await rescheduleFailedForConnection(a.conn!.id);
    expect(res).toEqual({ ok: true, data: { rescheduled: 0 } });
    const [row] = await db.select().from(publications).where(eq(publications.id, a.pub.id));
    expect(row.status).toBe("failed");
  });

  it("refuses while the connection is still down", async () => {
    const a = await seedFailed();
    await db
      .update(instagramConnections)
      .set({ status: "expired" })
      .where(eq(instagramConnections.id, a.conn!.id));
    mocks.user.id = a.user.id;
    const res = await rescheduleFailedForConnection(a.conn!.id);
    expect(res.ok).toBe(false);
  });

  it("is not_found for a connection of another workspace", async () => {
    const a = await seedFailed();
    const other = await seedWorkspace("other@x.co");
    mocks.user.id = other.user.id;
    const res = await rescheduleFailedForConnection(a.conn!.id);
    expect(res).toMatchObject({ ok: false, code: "not_found" });
    const [row] = await db.select().from(publications).where(eq(publications.id, a.pub.id));
    expect(row.status).toBe("failed");
  });

  it("rejects a malformed id", async () => {
    const res = await rescheduleFailedForConnection("nope");
    expect(res).toMatchObject({ ok: false, code: "invalid_input" });
  });
});
