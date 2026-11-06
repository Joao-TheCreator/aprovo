import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { activityLog, posts, users } from "@/db/schema";
import { testDb } from "../setup";
import { makeRequireMock, seedWorkspace } from "../media/helpers";

const mocks = vi.hoisted(() => ({ user: { id: "" } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require", async () => makeRequireMock(mocks));

import { bulkArchivePosts, bulkDeletePosts, reorderPosts } from "@/lib/posts/actions";
import { moveId } from "@/lib/posts/reorder";

async function seed(n = 4) {
  const s = await seedWorkspace();
  mocks.user.id = s.user.id;
  const rows = await testDb
    .insert(posts)
    .values(
      Array.from({ length: n }, (_, i) => ({
        profileId: s.profile.id,
        kind: "post" as const,
        status: "draft" as const,
        position: i - 2, // includes negatives, like real data
        createdBy: s.user.id,
      })),
    )
    .returning();
  rows.sort((a, b) => a.position - b.position);
  return { ...s, ids: rows.map((r) => r.id) };
}

async function order(profileId: string) {
  const rows = await testDb
    .select()
    .from(posts)
    .where(eq(posts.profileId, profileId))
    .orderBy(asc(posts.position));
  return rows.map((r) => ({ id: r.id, position: r.position }));
}

describe("reorderPosts", () => {
  beforeEach(() => {
    mocks.user.id = "";
  });

  it("renumbers densely 0..n-1 in the given order", async () => {
    const { profile, ids } = await seed();
    const next = [ids[2], ids[0], ids[3], ids[1]];
    expect(await reorderPosts(profile.id, next)).toEqual({ ok: true, data: undefined });
    const rows = await order(profile.id);
    expect(rows.map((r) => r.id)).toEqual(next);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3]);
    const events = await testDb
      .select()
      .from(activityLog)
      .where(eq(activityLog.profileId, profile.id));
    expect(events.map((e) => e.event)).toContain("posts.reordered");
  });

  it("keeps archived posts out of the order but clear of the dense range", async () => {
    const { profile, ids } = await seed(3);
    await testDb.update(posts).set({ archivedAt: new Date() }).where(eq(posts.id, ids[0]));
    const res = await reorderPosts(profile.id, [ids[2], ids[1]]);
    expect(res.ok).toBe(true);
    const rows = await order(profile.id);
    expect(rows.map((r) => r.id)).toEqual([ids[2], ids[1], ids[0]]);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
  });

  it("rejects missing, extra or duplicated ids with stale_order", async () => {
    const { profile, ids } = await seed();
    expect(await reorderPosts(profile.id, ids.slice(1))).toMatchObject({
      ok: false,
      code: "stale_order",
    });
    expect(
      await reorderPosts(profile.id, [...ids, "00000000-0000-4000-8000-000000000000"]),
    ).toMatchObject({ code: "stale_order" });
    expect(await reorderPosts(profile.id, [ids[0], ids[0], ids[1], ids[2]])).toMatchObject({
      code: "stale_order",
    });
    expect(await reorderPosts(profile.id, ["nope"])).toMatchObject({ code: "stale_order" });
  });

  it("denies non-members", async () => {
    const { profile, ids } = await seed();
    const [other] = await testDb.insert(users).values({ email: "b@x.co" }).returning();
    mocks.user.id = other.id;
    expect(await reorderPosts(profile.id, ids)).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("bulk actions", () => {
  it("archives and unarchives several posts, one activity each", async () => {
    const { profile, ids } = await seed();
    expect((await bulkArchivePosts([ids[0], ids[1]], true)).ok).toBe(true);
    const archived = await testDb.select().from(posts).where(eq(posts.profileId, profile.id));
    expect(archived.filter((p) => p.archivedAt).length).toBe(2);
    expect((await bulkArchivePosts([ids[0]], false)).ok).toBe(true);
    const events = await testDb
      .select()
      .from(activityLog)
      .where(eq(activityLog.profileId, profile.id));
    expect(events.filter((e) => e.event === "post.archived").length).toBe(2);
    expect(events.filter((e) => e.event === "post.unarchived").length).toBe(1);
  });

  it("deletes several posts and rejects foreign or mixed ids", async () => {
    const a = await seed();
    const keep = a.ids[3];
    expect((await bulkDeletePosts([a.ids[0], a.ids[1]])).ok).toBe(true);
    expect((await order(a.profile.id)).length).toBe(2);

    const other = await seedWorkspace("c@x.co");
    const [foreign] = await testDb
      .insert(posts)
      .values({ profileId: other.profile.id, kind: "post", position: 0, createdBy: other.user.id })
      .returning();
    mocks.user.id = a.user.id;
    expect(await bulkDeletePosts([keep, foreign.id])).toMatchObject({ code: "not_found" });
    expect(await bulkArchivePosts([foreign.id], true)).toMatchObject({ code: "not_found" });
    expect((await order(a.profile.id)).length).toBe(2);
  });
});

describe("moveId", () => {
  it("moves up, down and to top, clamped at the edges", () => {
    const l = ["a", "b", "c"];
    expect(moveId(l, "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveId(l, "b", "down")).toEqual(["a", "c", "b"]);
    expect(moveId(l, "c", "top")).toEqual(["c", "a", "b"]);
    expect(moveId(l, "a", "up")).toEqual(l);
    expect(moveId(l, "c", "down")).toEqual(l);
  });
});
