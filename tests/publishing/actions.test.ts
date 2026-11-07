import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityLog,
  instagramConnections,
  mediaAssets,
  posts,
  profiles,
  publications,
} from "@/db/schema";
import { testDb } from "../setup";
import { makeRequireMock, makeTempStorage, seedWorkspace } from "../media/helpers";
import { seedJob } from "./seed";

const mocks = vi.hoisted(() => ({ user: { id: "" } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require", async () => makeRequireMock(mocks));

import {
  cancelPublication,
  reschedulePublication,
  schedulePublication,
} from "@/lib/publishing/actions";
import { listPublications } from "@/lib/publishing/queries";

const DAY = 24 * 60 * 60 * 1000;
const future = (ms = DAY) => new Date(Date.now() + ms).toISOString();
const TZ = "America/Sao_Paulo";

type PostStatus = typeof posts.$inferSelect.status;

/** A workspace with a publish-capable connection linked to the profile and an approved post. */
let seedCounter = 0;
async function approvedPost(opts: { status?: PostStatus; items?: Array<"image" | "video"> } = {}) {
  // Each call seeds its own workspace; users.email is unique, so give every call a distinct address.
  const job = await seedJob({ items: opts.items, email: `u${++seedCounter}@x.co` });
  mocks.user.id = job.user.id;
  await testDb.delete(publications).where(eq(publications.id, job.pub.id));
  await testDb
    .update(posts)
    .set({ status: opts.status ?? "approved" })
    .where(eq(posts.id, job.post.id));
  if (job.conn) {
    await testDb
      .update(profiles)
      .set({ connectionId: job.conn.id })
      .where(eq(profiles.id, job.profile.id));
  }
  return job;
}

async function getPost(id: string) {
  const [p] = await testDb.select().from(posts).where(eq(posts.id, id));
  return p;
}
async function getPub(id: string) {
  const [p] = await testDb.select().from(publications).where(eq(publications.id, id));
  return p;
}
async function events(profileId: string) {
  const rows = await testDb.select().from(activityLog).where(eq(activityLog.profileId, profileId));
  return rows.map((r) => r.event);
}

describe("publishing actions", () => {
  beforeEach(async () => {
    mocks.user.id = "";
    await makeTempStorage();
  });

  describe("schedulePublication", () => {
    it("creates the live publication and moves the post to scheduled", async () => {
      const { post, profile, user } = await approvedPost();
      const at = future();
      const res = await schedulePublication({ postId: post.id, scheduledAt: at, timezone: TZ });
      if (!res.ok) throw new Error(res.message);

      const pub = await getPub(res.data.publicationId);
      expect(pub.status).toBe("scheduled");
      expect(pub.scheduledAt.toISOString()).toBe(at);
      expect(pub.nextAttemptAt.toISOString()).toBe(at);
      expect(pub.timezone).toBe(TZ);
      expect(pub.createdBy).toBe(user.id);
      expect(pub.connectionId).not.toBeNull();

      const updated = await getPost(post.id);
      expect(updated.status).toBe("scheduled");
      expect(updated.scheduledFor?.toISOString()).toBe(at);
      expect(await events(profile.id)).toContain("publication.scheduled");
    });

    it("refuses a second schedule with already_scheduled", async () => {
      const { post } = await approvedPost();
      const input = { postId: post.id, scheduledAt: future(), timezone: TZ };
      expect((await schedulePublication(input)).ok).toBe(true);
      expect(await schedulePublication(input)).toMatchObject({
        ok: false,
        code: "already_scheduled",
        message: "Esta publicação já está agendada.",
      });
      const rows = await testDb.select().from(publications).where(eq(publications.postId, post.id));
      expect(rows).toHaveLength(1);
    });

    it.each(["draft", "pending_approval"] as const)("refuses a %s post", async (status) => {
      const { post } = await approvedPost({ status });
      expect(
        await schedulePublication({ postId: post.id, scheduledAt: future(), timezone: TZ }),
      ).toMatchObject({
        ok: false,
        code: "invalid_status",
        message: "Só publicações aprovadas podem ser agendadas.",
      });
      expect((await getPost(post.id)).status).toBe(status);
    });

    it("refuses a time in the past or too close", async () => {
      const { post } = await approvedPost();
      for (const at of [future(-60_000), future(30_000)]) {
        expect(
          await schedulePublication({ postId: post.id, scheduledAt: at, timezone: TZ }),
        ).toMatchObject({ ok: false, code: "past_date", message: "Escolha um horário no futuro." });
      }
    });

    it("validates the input", async () => {
      const { post } = await approvedPost();
      expect(
        await schedulePublication({ postId: post.id, scheduledAt: "ontem", timezone: TZ }),
      ).toMatchObject({ ok: false, code: "invalid_input" });
      expect(
        await schedulePublication({ postId: post.id, scheduledAt: future(), timezone: "Foo/Bar" }),
      ).toMatchObject({ ok: false, code: "invalid_input" });
    });

    it("needs a connected, active account", async () => {
      const noConn = await approvedPost();
      await testDb
        .update(profiles)
        .set({ connectionId: null })
        .where(eq(profiles.id, noConn.profile.id));
      expect(
        await schedulePublication({ postId: noConn.post.id, scheduledAt: future(), timezone: TZ }),
      ).toMatchObject({
        ok: false,
        code: "connection_inactive",
        message: "Conecte o Instagram do perfil em Configurações.",
      });

      const expired = await approvedPost();
      await testDb
        .update(instagramConnections)
        .set({ status: "expired" })
        .where(eq(instagramConnections.id, expired.conn?.id ?? ""));
      expect(
        await schedulePublication({ postId: expired.post.id, scheduledAt: future(), timezone: TZ }),
      ).toMatchObject({ ok: false, code: "connection_inactive" });
    });

    it("needs the publish scope", async () => {
      const { post, conn } = await approvedPost();
      await testDb
        .update(instagramConnections)
        .set({ scopes: ["instagram_business_basic"] })
        .where(eq(instagramConnections.id, conn?.id ?? ""));
      expect(
        await schedulePublication({ postId: post.id, scheduledAt: future(), timezone: TZ }),
      ).toMatchObject({ ok: false, code: "missing_scope" });
    });

    it("explains media outside the accepted aspect ratio", async () => {
      const { post, ws } = await approvedPost();
      await testDb
        .update(mediaAssets)
        .set({ width: 1080, height: 3240 })
        .where(eq(mediaAssets.workspaceId, ws.id));
      const res = await schedulePublication({
        postId: post.id,
        scheduledAt: future(),
        timezone: TZ,
      });
      expect(res).toMatchObject({ ok: false, code: "media_rejected" });
      if (!res.ok) expect(res.message).toContain("proporção");
      expect((await getPost(post.id)).status).toBe("approved");
      const rows = await testDb.select().from(publications).where(eq(publications.postId, post.id));
      expect(rows).toHaveLength(0);
    });

    it("hides posts of other workspaces", async () => {
      const { post } = await approvedPost();
      const other = await seedWorkspace("b@x.co");
      mocks.user.id = other.user.id;
      expect(
        await schedulePublication({ postId: post.id, scheduledAt: future(), timezone: TZ }),
      ).toMatchObject({ ok: false, code: "not_found" });
      expect((await getPost(post.id)).status).toBe("approved");
    });
  });

  describe("reschedulePublication", () => {
    it("changes the schedule of a scheduled publication", async () => {
      const { post, profile } = await approvedPost();
      const first = await schedulePublication({
        postId: post.id,
        scheduledAt: future(),
        timezone: TZ,
      });
      if (!first.ok) throw new Error(first.message);
      const at = future(3 * DAY);
      const res = await reschedulePublication({
        publicationId: first.data.publicationId,
        scheduledAt: at,
        timezone: "America/New_York",
      });
      expect(res.ok).toBe(true);
      const pub = await getPub(first.data.publicationId);
      expect(pub.status).toBe("scheduled");
      expect(pub.scheduledAt.toISOString()).toBe(at);
      expect(pub.nextAttemptAt.toISOString()).toBe(at);
      expect(pub.timezone).toBe("America/New_York");
      const updated = await getPost(post.id);
      expect(updated.status).toBe("scheduled");
      expect(updated.scheduledFor?.toISOString()).toBe(at);
      expect(await events(profile.id)).toContain("publication.rescheduled");
      // Same row, still the only live publication.
      const rows = await testDb.select().from(publications).where(eq(publications.postId, post.id));
      expect(rows).toHaveLength(1);
    });

    it("brings a failed publication back to scheduled", async () => {
      const job = await seedJob({
        publication: {
          status: "failed",
          attempts: 5,
          lastErrorCode: "unknown",
          lastError: "Falhou.",
        },
      });
      mocks.user.id = job.user.id;
      await testDb.update(posts).set({ status: "publish_failed" }).where(eq(posts.id, job.post.id));
      const at = future();
      const res = await reschedulePublication({
        publicationId: job.pub.id,
        scheduledAt: at,
        timezone: TZ,
      });
      if (!res.ok) throw new Error(res.message);
      const pub = await getPub(job.pub.id);
      expect(pub).toMatchObject({
        status: "scheduled",
        attempts: 0,
        lastError: null,
        lastErrorCode: null,
      });
      expect(pub.nextAttemptAt.toISOString()).toBe(at);
      expect((await getPost(job.post.id)).status).toBe("scheduled");
    });

    it.each(["publishing", "published", "cancelled"] as const)(
      "refuses a %s publication",
      async (status) => {
        const job = await seedJob({ publication: { status } });
        mocks.user.id = job.user.id;
        expect(
          await reschedulePublication({
            publicationId: job.pub.id,
            scheduledAt: future(),
            timezone: TZ,
          }),
        ).toMatchObject({ ok: false, code: "not_reschedulable" });
        expect((await getPub(job.pub.id)).status).toBe(status);
      },
    );

    it("refuses a past time and other workspaces", async () => {
      const job = await seedJob();
      mocks.user.id = job.user.id;
      expect(
        await reschedulePublication({
          publicationId: job.pub.id,
          scheduledAt: future(-DAY),
          timezone: TZ,
        }),
      ).toMatchObject({ ok: false, code: "past_date" });
      const other = await seedWorkspace("b@x.co");
      mocks.user.id = other.user.id;
      expect(
        await reschedulePublication({
          publicationId: job.pub.id,
          scheduledAt: future(),
          timezone: TZ,
        }),
      ).toMatchObject({ ok: false, code: "not_found" });
    });
  });

  describe("cancelPublication", () => {
    it("cancels and returns the post to approved", async () => {
      const { post, profile, user } = await approvedPost();
      const scheduled = await schedulePublication({
        postId: post.id,
        scheduledAt: future(),
        timezone: TZ,
      });
      if (!scheduled.ok) throw new Error(scheduled.message);
      expect(await cancelPublication({ publicationId: scheduled.data.publicationId })).toEqual({
        ok: true,
        data: undefined,
      });
      const pub = await getPub(scheduled.data.publicationId);
      expect(pub.status).toBe("cancelled");
      expect(pub.cancelledAt).not.toBeNull();
      expect(pub.cancelledBy).toBe(user.id);
      expect((await getPost(post.id)).status).toBe("approved");
      const logs = await testDb
        .select()
        .from(activityLog)
        .where(
          and(
            eq(activityLog.profileId, profile.id),
            eq(activityLog.event, "publication.cancelled"),
          ),
        );
      expect(logs).toHaveLength(1);
      expect(logs[0].payload).toMatchObject({ reason: "user" });
      // The post can be scheduled again.
      expect(
        (await schedulePublication({ postId: post.id, scheduledAt: future(), timezone: TZ })).ok,
      ).toBe(true);
    });

    it("refuses to cancel while publishing", async () => {
      const job = await seedJob({ publication: { status: "publishing" } });
      mocks.user.id = job.user.id;
      expect(await cancelPublication({ publicationId: job.pub.id })).toMatchObject({
        ok: false,
        code: "publishing_now",
        message: "A publicação está sendo enviada agora e não pode ser cancelada.",
      });
      expect((await getPub(job.pub.id)).status).toBe("publishing");
    });

    it("refuses published and other workspaces", async () => {
      const job = await seedJob({ publication: { status: "published" } });
      mocks.user.id = job.user.id;
      expect(await cancelPublication({ publicationId: job.pub.id })).toMatchObject({
        ok: false,
        code: "not_cancellable",
      });
      const other = await seedWorkspace("b@x.co");
      mocks.user.id = other.user.id;
      expect(await cancelPublication({ publicationId: job.pub.id })).toMatchObject({
        ok: false,
        code: "not_found",
      });
    });
  });

  describe("listPublications", () => {
    it("groups by outcome and is workspace-scoped", async () => {
      const a = await seedJob();
      mocks.user.id = a.user.id;
      const withConn = { ...a, conn: a.conn };
      const published = await seedJob({
        from: withConn,
        publication: {
          status: "published",
          publishedAt: new Date(),
          permalink: "https://www.instagram.com/p/abc/",
        },
      });
      const failed = await seedJob({
        from: withConn,
        publication: { status: "failed", lastError: "Falhou.", lastErrorCode: "unknown" },
      });
      await seedJob({ from: withConn, publication: { status: "cancelled" } });
      await testDb
        .update(posts)
        .set({ caption: "x".repeat(300) })
        .where(eq(posts.id, a.post.id));

      const lists = await listPublications(a.profile.id);
      expect(lists.scheduled.map((i) => i.id)).toEqual([a.pub.id]);
      expect(lists.published.map((i) => i.id)).toEqual([published.pub.id]);
      expect(lists.failed.map((i) => i.id)).toEqual([failed.pub.id]);
      expect(lists.published[0].permalink).toBe("https://www.instagram.com/p/abc/");
      expect(lists.failed[0].lastError).toBe("Falhou.");
      expect(lists.scheduled[0].captionExcerpt.length).toBeLessThanOrEqual(101);
      expect(lists.scheduled[0].postId).toBe(a.post.id);

      const other = await seedWorkspace("b@x.co");
      mocks.user.id = other.user.id;
      await expect(listPublications(a.profile.id)).rejects.toThrow();
      const own = await listPublications(other.profile.id);
      expect(own).toEqual({ scheduled: [], published: [], failed: [] });
    });
  });
});
