import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { publications } from "@/db/schema";
import { claimDue, lagSeconds, release } from "@/lib/publishing/queue";
import { testDb as db } from "../setup";
import { seedJob } from "./seed";

async function row(id: string) {
  const [r] = await db.select().from(publications).where(eq(publications.id, id));
  return r;
}

describe("claimDue", () => {
  it("claims a due job: publishing, locked, attempts + 1", async () => {
    const { pub } = await seedJob();
    const [job] = await claimDue(5, "run_a");
    expect(job.id).toBe(pub.id);
    expect(job.status).toBe("publishing");
    expect(job.attempts).toBe(1);
    expect(job.lockedBy).toBe("run_a");
    expect(job.lockedAt).toBeInstanceOf(Date);
  });

  it("skips future and non-scheduled jobs", async () => {
    await seedJob({ publication: { nextAttemptAt: new Date(Date.now() + 3_600_000) } });
    await seedJob({ email: "b@x.co", publication: { status: "cancelled" } });
    await seedJob({ email: "c@x.co", publication: { status: "failed" } });
    expect(await claimDue(5, "run_a")).toEqual([]);
  });

  it("respects the limit and takes the oldest first", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { pub } = await seedJob({
        email: `u${i}@x.co`,
        publication: { nextAttemptAt: new Date(Date.now() - (i + 1) * 60_000) },
      });
      ids.push(pub.id);
    }
    const first = await claimDue(2, "run_a");
    expect(first.map((j) => j.id)).toEqual([ids[2], ids[1]]);
    const rest = await claimDue(2, "run_b");
    expect(rest.map((j) => j.id)).toEqual([ids[0]]);
  });

  it("never hands the same job to two concurrent claims", async () => {
    for (let i = 0; i < 6; i++) await seedJob({ email: `c${i}@x.co` });
    const [a, b] = await Promise.all([claimDue(5, "run_a"), claimDue(5, "run_b")]);
    const all = [...a, ...b].map((j) => j.id);
    expect(all).toHaveLength(6);
    expect(new Set(all).size).toBe(6);
  });

  it("reclaims a job whose lock is older than 10 minutes, but not a fresh lock", async () => {
    const { pub } = await seedJob({
      publication: { lockedAt: new Date(Date.now() - 60_000), lockedBy: "dead" },
    });
    expect(await claimDue(5, "run_a")).toEqual([]);
    await db
      .update(publications)
      .set({ lockedAt: new Date(Date.now() - 11 * 60_000) })
      .where(eq(publications.id, pub.id));
    const [job] = await claimDue(5, "run_b");
    expect(job.id).toBe(pub.id);
    expect(job.lockedBy).toBe("run_b");
  });
});

describe("release", () => {
  async function claimed() {
    const s = await seedJob();
    const [job] = await claimDue(1, "run_a");
    return { ...s, job };
  }

  it("published: sets the media and clears the lock", async () => {
    const { job } = await claimed();
    const r = await release(job.id, {
      kind: "published",
      igMediaId: "m1",
      permalink: "https://www.instagram.com/p/x/",
      publishedAt: new Date(),
    });
    expect(r?.status).toBe("published");
    expect(r?.igMediaId).toBe("m1");
    expect(r?.permalink).toBe("https://www.instagram.com/p/x/");
    expect(r?.lockedAt).toBeNull();
    expect(r?.lockedBy).toBeNull();
  });

  it("retry: back to scheduled with error fields and the container", async () => {
    const { job } = await claimed();
    const at = new Date(Date.now() + 60_000);
    const r = await release(job.id, {
      kind: "retry",
      at,
      code: "rate_limited",
      message: "msg",
      raw: { a: 1 },
      containerId: "c1",
      containerCreatedAt: new Date(),
    });
    expect(r?.status).toBe("scheduled");
    expect(r?.nextAttemptAt).toEqual(at);
    expect(r?.lastErrorCode).toBe("rate_limited");
    expect(r?.lastError).toBe("msg");
    expect(r?.lastErrorRaw).toEqual({ a: 1 });
    expect(r?.containerId).toBe("c1");
    expect(r?.attempts).toBe(1);
    expect(r?.lockedAt).toBeNull();
  });

  it("retry with uncountAttempt gives the attempt back and keeps the container", async () => {
    const s = await seedJob({
      publication: { containerId: "keep", containerCreatedAt: new Date() },
    });
    const [job] = await claimDue(1, "run_a");
    expect(job.attempts).toBe(1);
    const r = await release(s.pub.id, {
      kind: "retry",
      at: new Date(Date.now() + 120_000),
      code: null,
      message: null,
      raw: null,
      uncountAttempt: true,
    });
    expect(r?.attempts).toBe(0);
    expect(r?.containerId).toBe("keep");
    expect(r?.lastErrorCode).toBeNull();
  });

  it("failed: terminal with the error", async () => {
    const { job } = await claimed();
    const r = await release(job.id, {
      kind: "failed",
      code: "token_expired",
      message: "m",
      raw: null,
    });
    expect(r?.status).toBe("failed");
    expect(r?.lastErrorCode).toBe("token_expired");
    expect(r?.lockedAt).toBeNull();
  });

  it("does nothing when the job is no longer publishing", async () => {
    const { job } = await claimed();
    await db.update(publications).set({ status: "cancelled" }).where(eq(publications.id, job.id));
    const r = await release(job.id, { kind: "failed", code: "unknown", message: "m", raw: null });
    expect(r).toBeNull();
    expect((await row(job.id)).status).toBe("cancelled");
  });
});

describe("lagSeconds", () => {
  it("is 0 with nothing due and measures the oldest due scheduled job", async () => {
    expect(await lagSeconds()).toBe(0);
    await seedJob({ publication: { nextAttemptAt: new Date(Date.now() + 3_600_000) } });
    expect(await lagSeconds()).toBe(0);
    await seedJob({
      email: "l@x.co",
      publication: { nextAttemptAt: new Date(Date.now() - 20 * 60_000) },
    });
    const lag = await lagSeconds();
    expect(lag).toBeGreaterThanOrEqual(1199);
    expect(lag).toBeLessThan(1300);
  });
});
