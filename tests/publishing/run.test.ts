import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { activityLog, instagramConnections, posts, publications } from "@/db/schema";
import type { InstagramPublisher } from "@/lib/instagram/publish";
import { claimDue } from "@/lib/publishing/queue";
import { afterHooks, runPublication, type RunDeps } from "@/lib/publishing/run";
import { testDb as db } from "../setup";
import { makeTempStorage } from "../media/helpers";
import { ScriptedPublisher, publishError } from "./fake-publisher";
import { makeDue, seedJob } from "./seed";

const holder = vi.hoisted(() => ({ pub: null as InstagramPublisher | null }));
vi.mock("@/lib/instagram/publish", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/instagram/publish")>()),
  getPublisher: () => {
    if (!holder.pub) throw new Error("no scripted publisher");
    return holder.pub;
  },
}));

import { GET as runRoute } from "@/app/api/publishing/run/route";

let tmp: Awaited<ReturnType<typeof makeTempStorage>>;
beforeAll(async () => {
  tmp = await makeTempStorage();
});
afterAll(async () => tmp.cleanup());
beforeEach(() => {
  process.env.CRON_SECRET = "cron";
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  holder.pub = null;
  vi.restoreAllMocks();
});

const NOW = new Date();
const ok = <T>(data: T) => ({ ok: true as const, data });
const status = (
  s: "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED",
  detail: string | null = null,
) => ok({ status: s, detail });

function deps(pub: InstagramPublisher, extra: Partial<RunDeps> = {}): RunDeps {
  return { publisher: () => pub, now: () => NOW, sleep: async () => {}, ...extra };
}

async function claimOne() {
  const [job] = await claimDue(1, "run_test");
  return job;
}
async function pubRow(id: string) {
  const [r] = await db.select().from(publications).where(eq(publications.id, id));
  return r;
}
async function postRow(id: string) {
  const [r] = await db.select().from(posts).where(eq(posts.id, id));
  return r;
}
async function events(): Promise<string[]> {
  const rows = await db.select().from(activityLog);
  return rows.map((r) => r.event);
}
const callsOf = (pub: ScriptedPublisher, method: string) =>
  pub.calls.filter((c) => c.method === method);

describe("runPublication", () => {
  it("publishes a single image", async () => {
    const { pub, post } = await seedJob();
    const hook = vi.spyOn(afterHooks, "onPublished");
    const publisher = new ScriptedPublisher();
    const outcome = await runPublication(await claimOne(), deps(publisher));
    expect(outcome).toEqual({ kind: "published", code: null });

    const row = await pubRow(pub.id);
    expect(row.status).toBe("published");
    expect(row.igMediaId).toBe("fake_1");
    expect(row.permalink).toContain("instagram.com");
    expect(row.publishedAt).toBeInstanceOf(Date);
    expect(row.containerId).toBeTruthy();
    expect(row.lockedAt).toBeNull();

    const p = await postRow(post.id);
    expect(p.status).toBe("published");
    expect(p.publishedMediaId).toBe("fake_1");
    expect(await events()).toEqual(
      expect.arrayContaining(["publication.attempt", "publication.published"]),
    );
    const [log] = await db
      .select()
      .from(activityLog)
      .where(eq(activityLog.event, "publication.published"));
    expect(log.actor).toBe("system:scheduler");
    expect(hook).toHaveBeenCalledTimes(1);
    // Caption is sent with the container.
    expect(callsOf(publisher, "createImageContainer")[0].args[0]).toMatchObject({
      caption: "Legenda",
    });
  });

  it("publishes a carousel of 3 images with 4 container calls", async () => {
    const { pub } = await seedJob({ items: ["image", "image", "image"] });
    const publisher = new ScriptedPublisher();
    const outcome = await runPublication(await claimOne(), deps(publisher));
    expect(outcome.kind).toBe("published");
    const items = callsOf(publisher, "createImageContainer");
    expect(items).toHaveLength(3);
    expect(items.every((c) => (c.args[0] as { isCarouselItem?: boolean }).isCarouselItem)).toBe(
      true,
    );
    const parent = callsOf(publisher, "createCarouselContainer");
    expect(parent).toHaveLength(1);
    expect((parent[0].args[0] as { children: string[] }).children).toHaveLength(3);
    expect(callsOf(publisher, "publish")).toHaveLength(1);
    expect((await pubRow(pub.id)).status).toBe("published");
  });

  it("video needs two runs: IN_PROGRESS keeps the container and the attempt count", async () => {
    const { pub, post } = await seedJob({ items: ["video"] });
    const publisher = new ScriptedPublisher();
    const inProgress = () => status("IN_PROGRESS");
    publisher.script("getContainerStatus", inProgress, inProgress, inProgress);

    const first = await runPublication(
      await claimOne(),
      deps(publisher, { pollIntervalMs: 15_000, pollBudgetMs: 30_000 }),
    );
    expect(first).toEqual({ kind: "retried", code: null });
    let row = await pubRow(pub.id);
    expect(row.status).toBe("scheduled");
    expect(row.containerId).toBeTruthy();
    expect(row.attempts).toBe(0);
    expect(row.nextAttemptAt.getTime()).toBe(NOW.getTime() + 2 * 60_000);
    expect(callsOf(publisher, "getContainerStatus")).toHaveLength(3);
    expect(callsOf(publisher, "publish")).toHaveLength(0);
    expect((await postRow(post.id)).status).toBe("scheduled");
    expect(callsOf(publisher, "createVideoContainer")[0].args[0]).toMatchObject({
      shareToFeed: true,
    });

    await makeDue(pub.id);
    const second = await runPublication(await claimOne(), deps(publisher));
    expect(second.kind).toBe("published");
    row = await pubRow(pub.id);
    expect(row.status).toBe("published");
    expect(row.attempts).toBe(1);
    expect(callsOf(publisher, "createVideoContainer")).toHaveLength(1);
    expect(callsOf(publisher, "publish")).toHaveLength(1);
  });

  it("treats media_not_ready on publish like IN_PROGRESS", async () => {
    const { pub } = await seedJob();
    const publisher = new ScriptedPublisher().fail("publish", publishError("media_not_ready"));
    const outcome = await runPublication(await claimOne(), deps(publisher));
    expect(outcome.kind).toBe("retried");
    const row = await pubRow(pub.id);
    expect(row.attempts).toBe(0);
    expect(row.containerId).toBeTruthy();
    expect(row.nextAttemptAt.getTime()).toBe(NOW.getTime() + 2 * 60_000);
  });

  it("code 190 fails, expires the connection and fails the other live publications", async () => {
    const first = await seedJob();
    const second = await seedJob({
      from: first,
      publication: { nextAttemptAt: new Date(Date.now() + 3_600_000) },
    });
    const publisher = new ScriptedPublisher().fail(
      "createImageContainer",
      publishError("token_expired", { retryable: false }),
    );
    const hook = vi.spyOn(afterHooks, "onFailed");
    const outcome = await runPublication(await claimOne(), deps(publisher));
    expect(outcome).toEqual({ kind: "failed", code: "token_expired" });

    expect((await pubRow(first.pub.id)).status).toBe("failed");
    expect((await pubRow(first.pub.id)).lastErrorCode).toBe("token_expired");
    const sibling = await pubRow(second.pub.id);
    expect(sibling.status).toBe("failed");
    expect(sibling.lastErrorCode).toBe("token_expired");
    expect((await postRow(first.post.id)).status).toBe("publish_failed");
    expect((await postRow(second.post.id)).status).toBe("publish_failed");
    const [conn] = await db
      .select()
      .from(instagramConnections)
      .where(eq(instagramConnections.id, first.conn!.id));
    expect(conn.status).toBe("expired");
    expect(hook).toHaveBeenCalledTimes(2);
    expect((await events()).filter((e) => e === "publication.failed")).toHaveLength(2);
  });

  it("fails at once, without calling Meta, when the connection is not active", async () => {
    const { pub, post } = await seedJob({ connection: { status: "expired" } });
    const publisher = new ScriptedPublisher();
    const outcome = await runPublication(await claimOne(), deps(publisher));
    expect(outcome).toEqual({ kind: "failed", code: "token_expired" });
    expect(publisher.calls).toHaveLength(0);
    const row = await pubRow(pub.id);
    expect(row.lastError).toBe("Conecte o Instagram novamente para publicar.");
    expect((await postRow(post.id)).status).toBe("publish_failed");
  });

  it("fails with missing_scope when the connection cannot publish", async () => {
    const { pub } = await seedJob({ connection: { scopes: ["instagram_business_basic"] } });
    const publisher = new ScriptedPublisher();
    const outcome = await runPublication(await claimOne(), deps(publisher));
    expect(outcome).toEqual({ kind: "failed", code: "missing_scope" });
    expect(publisher.calls).toHaveLength(0);
    expect((await pubRow(pub.id)).status).toBe("failed");
  });

  it("daily_limit (code 9) retries one hour later", async () => {
    const { pub } = await seedJob();
    const publisher = new ScriptedPublisher().fail(
      "createImageContainer",
      publishError("daily_limit"),
    );
    const outcome = await runPublication(await claimOne(), deps(publisher));
    expect(outcome).toEqual({ kind: "retried", code: "daily_limit" });
    const row = await pubRow(pub.id);
    expect(row.status).toBe("scheduled");
    expect(row.lastErrorCode).toBe("daily_limit");
    expect(row.nextAttemptAt.getTime()).toBe(NOW.getTime() + 60 * 60_000);
  });

  it("a full quota retries as daily_limit without creating a container", async () => {
    const { pub } = await seedJob();
    const publisher = new ScriptedPublisher().script(
      "getPublishingLimit",
      ok({
        quotaUsage: 100,
        quotaTotal: 100,
      }),
    );
    const outcome = await runPublication(await claimOne(), deps(publisher));
    expect(outcome).toEqual({ kind: "retried", code: "daily_limit" });
    expect(callsOf(publisher, "createImageContainer")).toHaveLength(0);
    expect((await pubRow(pub.id)).status).toBe("scheduled");
  });

  it("429 retries with the 1 minute backoff on attempt 1", async () => {
    const { pub } = await seedJob();
    const publisher = new ScriptedPublisher().fail(
      "createImageContainer",
      publishError("rate_limited", { httpStatus: 429 }),
    );
    const outcome = await runPublication(await claimOne(), deps(publisher));
    expect(outcome).toEqual({ kind: "retried", code: "rate_limited" });
    const row = await pubRow(pub.id);
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt.getTime()).toBe(NOW.getTime() + 60_000);
    expect(row.lastErrorCode).toBe("rate_limited");
  });

  it("recreates an ERROR container and publishes", async () => {
    const { pub } = await seedJob({
      publication: { containerId: "old", containerCreatedAt: new Date(NOW.getTime() - 3_600_000) },
    });
    const publisher = new ScriptedPublisher().script(
      "getContainerStatus",
      status("ERROR", "Something went wrong"),
    );
    const outcome = await runPublication(await claimOne(), deps(publisher));
    expect(outcome.kind).toBe("published");
    expect(callsOf(publisher, "createImageContainer")).toHaveLength(1);
    const row = await pubRow(pub.id);
    expect(row.containerId).not.toBe("old");
    expect(callsOf(publisher, "publish")[0].args[0]).toBe(row.containerId);
  });

  it("recreates an EXPIRED container", async () => {
    await seedJob({
      publication: { containerId: "old", containerCreatedAt: new Date(NOW.getTime() - 3_600_000) },
    });
    const publisher = new ScriptedPublisher().script("getContainerStatus", status("EXPIRED"));
    expect((await runPublication(await claimOne(), deps(publisher))).kind).toBe("published");
    expect(callsOf(publisher, "createImageContainer")).toHaveLength(1);
  });

  it("does not reuse a container older than 24 hours", async () => {
    await seedJob({
      publication: {
        containerId: "ancient",
        containerCreatedAt: new Date(NOW.getTime() - 25 * 3_600_000),
      },
    });
    const publisher = new ScriptedPublisher();
    await runPublication(await claimOne(), deps(publisher));
    expect(callsOf(publisher, "createImageContainer")).toHaveLength(1);
    expect(callsOf(publisher, "getContainerStatus").every((c) => c.args[0] !== "ancient")).toBe(
      true,
    );
  });

  it("an ERROR container with a format reason fails as media_rejected", async () => {
    const { pub } = await seedJob({
      publication: { containerId: "old", containerCreatedAt: new Date(NOW.getTime() - 3_600_000) },
    });
    const publisher = new ScriptedPublisher().script(
      "getContainerStatus",
      status("ERROR", "Unsupported video format"),
    );
    const outcome = await runPublication(await claimOne(), deps(publisher));
    expect(outcome).toEqual({ kind: "failed", code: "media_rejected" });
    expect((await pubRow(pub.id)).status).toBe("failed");
  });

  it("a PUBLISHED container on retry finishes without calling publish", async () => {
    const { pub, post } = await seedJob({
      publication: { containerId: "live1", containerCreatedAt: new Date(NOW.getTime() - 60_000) },
    });
    const publisher = new ScriptedPublisher().script("getContainerStatus", status("PUBLISHED"));
    const outcome = await runPublication(await claimOne(), deps(publisher));
    expect(outcome.kind).toBe("published");
    expect(callsOf(publisher, "publish")).toHaveLength(0);
    expect(callsOf(publisher, "createImageContainer")).toHaveLength(0);
    const row = await pubRow(pub.id);
    expect(row.status).toBe("published");
    expect(row.igMediaId).toBe("live1");
    expect(row.permalink).toBeTruthy();
    expect((await postRow(post.id)).status).toBe("published");
  });

  it("a post without media fails as media_rejected before any Meta call", async () => {
    const { pub } = await seedJob({ items: [] });
    const publisher = new ScriptedPublisher();
    const outcome = await runPublication(await claimOne(), deps(publisher));
    expect(outcome).toEqual({ kind: "failed", code: "media_rejected" });
    expect(publisher.calls).toHaveLength(0);
    expect((await pubRow(pub.id)).lastError).toContain("não tem mídia");
  });

  it("fails when max_attempts is exhausted by a retryable error", async () => {
    const { pub, post } = await seedJob({ publication: { attempts: 4, maxAttempts: 5 } });
    const publisher = new ScriptedPublisher().fail("createImageContainer", publishError("network"));
    const outcome = await runPublication(await claimOne(), deps(publisher));
    expect(outcome).toEqual({ kind: "failed", code: "network" });
    expect((await pubRow(pub.id)).status).toBe("failed");
    expect((await postRow(post.id)).status).toBe("publish_failed");
  });

  it("does not touch the post when the job was cancelled during the run", async () => {
    const { pub, post } = await seedJob();
    const job = await claimOne();
    await db.update(publications).set({ status: "cancelled" }).where(eq(publications.id, pub.id));
    const outcome = await runPublication(job, deps(new ScriptedPublisher()));
    expect(outcome.kind).toBe("skipped");
    expect((await postRow(post.id)).status).toBe("scheduled");
  });
});

describe("GET /api/publishing/run", () => {
  const call = (headers: Record<string, string> = {}) =>
    runRoute(new NextRequest("http://localhost/api/publishing/run", { headers }));

  it("returns 401 without the secret or with a wrong one", async () => {
    expect((await call()).status).toBe(401);
    expect((await call({ "x-cron-secret": "nope" })).status).toBe(401);
  });

  it("claims, publishes and reports the counts", async () => {
    const { pub } = await seedJob();
    holder.pub = new ScriptedPublisher();
    const res = await call({ authorization: "Bearer cron" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      claimed: 1,
      published: 1,
      retried: 0,
      failed: 0,
      skipped: 0,
      lagSeconds: 0,
    });
    expect((await pubRow(pub.id)).status).toBe("published");
  });

  it("reports a retried job", async () => {
    await seedJob();
    holder.pub = new ScriptedPublisher().fail("createImageContainer", publishError("network"));
    const body = await (await call({ "x-cron-secret": "cron" })).json();
    expect(body).toMatchObject({ claimed: 1, published: 0, retried: 1, failed: 0 });
  });

  it("does nothing when nothing is due", async () => {
    const res = await call({ "x-cron-secret": "cron" });
    expect(await res.json()).toMatchObject({ claimed: 0 });
  });
});
