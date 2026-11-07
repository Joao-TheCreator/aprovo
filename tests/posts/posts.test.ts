import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { activityLog, mediaAssets, postMedia, posts, publications } from "@/db/schema";
import { testDb } from "../setup";
import { makeRequireMock, seedWorkspace } from "../media/helpers";

const mocks = vi.hoisted(() => ({ user: { id: "" } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require", async () => makeRequireMock(mocks));

import {
  archivePost,
  createPost,
  deletePost,
  updatePost,
  updatePostMedia,
} from "@/lib/posts/actions";
import { getPost } from "@/lib/posts/queries";

async function seed() {
  const s = await seedWorkspace();
  mocks.user.id = s.user.id;
  const mk = async (kind: "image" | "video" = "image", status: "ready" | "failed" = "ready") =>
    (
      await testDb
        .insert(mediaAssets)
        .values({
          workspaceId: s.ws.id,
          kind,
          status,
          originalPath: "originals/x/y/z.jpg",
          thumbPath: "thumbs/x/y/t.webp",
        })
        .returning()
    )[0].id;
  return { ...s, mk };
}

async function events(profileId: string) {
  const rows = await testDb.select().from(activityLog).where(eq(activityLog.profileId, profileId));
  return rows.map((r) => r.event);
}

describe("posts actions", () => {
  beforeEach(() => {
    mocks.user.id = "";
  });

  it("places new posts above existing ones (position -1 rule)", async () => {
    const { profile, mk } = await seed();
    const r1 = await createPost({ profileId: profile.id, kind: "post", assetIds: [await mk()] });
    const r2 = await createPost({ profileId: profile.id, kind: "post", assetIds: [await mk()] });
    if (!r1.ok || !r2.ok) throw new Error("create failed");
    const [p1] = await testDb.select().from(posts).where(eq(posts.id, r1.data.postId));
    const [p2] = await testDb.select().from(posts).where(eq(posts.id, r2.data.postId));
    expect(p1.position).toBe(0);
    expect(p2.position).toBe(-1);
    expect(p1.status).toBe("draft");
    expect(await events(profile.id)).toContain("post.created");
  });

  it("enforces media count and readiness", async () => {
    const { profile, mk } = await seed();
    const a = await mk("video");
    const b = await mk("video");
    expect(
      await createPost({ profileId: profile.id, kind: "video", assetIds: [a, b] }),
    ).toMatchObject({
      code: "invalid_media_count",
    });
    expect(
      await createPost({
        profileId: profile.id,
        kind: "post",
        assetIds: [await mk("image", "failed")],
      }),
    ).toMatchObject({ code: "asset_not_ready" });
    const ok = await createPost({ profileId: profile.id, kind: "video", assetIds: [a] });
    expect(ok.ok).toBe(true);
  });

  it("rejects assets from another workspace", async () => {
    const { profile } = await seed();
    const other = await seedWorkspace("b@x.co");
    const [foreign] = await testDb
      .insert(mediaAssets)
      .values({ workspaceId: other.ws.id, kind: "image", status: "ready", originalPath: "o" })
      .returning();
    expect(
      await createPost({ profileId: profile.id, kind: "post", assetIds: [foreign.id] }),
    ).toMatchObject({ code: "asset_not_ready" });
  });

  it("reverts an approved post to draft on update and logs it", async () => {
    const { profile, mk } = await seed();
    const r = await createPost({ profileId: profile.id, kind: "post", assetIds: [await mk()] });
    if (!r.ok) throw new Error("x");
    await testDb
      .update(posts)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(posts.id, r.data.postId));
    const res = await updatePost({
      postId: r.data.postId,
      caption: "Nova legenda",
      hashtags: ["#Foo", "foo", "bar"],
      scheduledFor: "2026-12-01T12:00:00Z",
    });
    expect(res.ok).toBe(true);
    const [p] = await testDb.select().from(posts).where(eq(posts.id, r.data.postId));
    expect(p.status).toBe("draft");
    expect(p.approvedAt).toBeNull();
    expect(p.caption).toBe("Nova legenda");
    expect(p.hashtags).toEqual(["foo", "bar"]);
    expect(p.scheduledFor?.toISOString()).toBe("2026-12-01T12:00:00.000Z");
    const ev = await events(profile.id);
    expect(ev).toContain("post.reopened");
    expect(ev).toContain("post.updated");
  });

  it("updatePostMedia replaces the set, reorders and keeps gridCrop", async () => {
    const { profile, mk } = await seed();
    const [a, b, c] = [await mk(), await mk(), await mk()];
    const r = await createPost({ profileId: profile.id, kind: "post", assetIds: [a, b] });
    if (!r.ok) throw new Error("x");
    const crop = { x: 0.1, y: 0, w: 0.8, h: 1 };
    expect(
      (
        await updatePostMedia({
          postId: r.data.postId,
          items: [{ assetId: b, gridCrop: crop }, { assetId: a }],
        })
      ).ok,
    ).toBe(true);
    // second update: drop a, add c; b keeps its crop (gridCrop undefined)
    expect(
      (await updatePostMedia({ postId: r.data.postId, items: [{ assetId: c }, { assetId: b }] }))
        .ok,
    ).toBe(true);
    const rows = await testDb
      .select()
      .from(postMedia)
      .where(eq(postMedia.postId, r.data.postId))
      .orderBy(asc(postMedia.sortOrder));
    expect(rows.map((x) => x.assetId)).toEqual([c, b]);
    expect(rows[1].gridCrop).toEqual(crop);
    expect(rows[0].gridCrop).toBeNull();

    const detail = await getPost(r.data.postId);
    expect(detail?.media.map((m) => m.assetId)).toEqual([c, b]);
    expect(detail?.profile.igUsername).toBe("cliente");
    expect(detail?.media[1].gridCrop).toEqual(crop);
  });

  it("archives, unarchives and deletes", async () => {
    const { profile, mk } = await seed();
    const r = await createPost({ profileId: profile.id, kind: "post", assetIds: [await mk()] });
    if (!r.ok) throw new Error("x");
    const id = r.data.postId;
    await archivePost(id, true);
    expect(
      (await testDb.select().from(posts).where(eq(posts.id, id)))[0].archivedAt,
    ).not.toBeNull();
    await archivePost(id, false);
    expect((await testDb.select().from(posts).where(eq(posts.id, id)))[0].archivedAt).toBeNull();
    expect((await deletePost(id)).ok).toBe(true);
    expect(await testDb.select().from(posts).where(eq(posts.id, id))).toHaveLength(0);
    expect(await testDb.select().from(postMedia).where(eq(postMedia.postId, id))).toHaveLength(0);
    expect(await events(profile.id)).toEqual(
      expect.arrayContaining(["post.archived", "post.unarchived", "post.deleted"]),
    );
  });

  it("editing a scheduled post cancels its publication and returns it to draft", async () => {
    const { profile, user, mk } = await seed();
    const a = await mk();
    const r = await createPost({ profileId: profile.id, kind: "post", assetIds: [a] });
    if (!r.ok) throw new Error("x");
    const postId = r.data.postId;
    const at = new Date(Date.now() + 3_600_000);
    await testDb
      .update(posts)
      .set({ status: "scheduled", approvedAt: new Date() })
      .where(eq(posts.id, postId));
    const [pub] = await testDb
      .insert(publications)
      .values({ postId, profileId: profile.id, scheduledAt: at, nextAttemptAt: at })
      .returning();

    expect((await updatePost({ postId, caption: "Outra legenda" })).ok).toBe(true);
    const [p] = await testDb.select().from(posts).where(eq(posts.id, postId));
    expect(p.status).toBe("draft");
    expect(p.approvedAt).toBeNull();
    const [after] = await testDb.select().from(publications).where(eq(publications.id, pub.id));
    expect(after.status).toBe("cancelled");
    expect(after.cancelledAt).not.toBeNull();
    expect(after.cancelledBy).toBe(user.id);
    const ev = await events(profile.id);
    expect(ev).toContain("publication.cancelled");
    expect(ev).toContain("post.updated");
    const logs = await testDb
      .select()
      .from(activityLog)
      .where(eq(activityLog.profileId, profile.id));
    expect(logs.find((l) => l.event === "publication.cancelled")?.payload).toMatchObject({
      reason: "edited",
    });

    // media edit on a scheduled post behaves the same
    await testDb.update(posts).set({ status: "scheduled" }).where(eq(posts.id, postId));
    await testDb
      .update(publications)
      .set({ status: "scheduled" })
      .where(eq(publications.id, pub.id));
    expect((await updatePostMedia({ postId, items: [{ assetId: await mk() }] })).ok).toBe(true);
    expect((await testDb.select().from(posts).where(eq(posts.id, postId)))[0].status).toBe("draft");
    expect(
      (await testDb.select().from(publications).where(eq(publications.id, pub.id)))[0].status,
    ).toBe("cancelled");
  });

  it("refuses to edit, archive or delete a published post", async () => {
    const { profile, mk } = await seed();
    const r = await createPost({ profileId: profile.id, kind: "post", assetIds: [await mk()] });
    if (!r.ok) throw new Error("x");
    const postId = r.data.postId;
    await testDb.update(posts).set({ status: "published" }).where(eq(posts.id, postId));
    const locked = {
      ok: false,
      code: "published_locked",
      message: "Publicações já publicadas no Instagram não podem ser alteradas.",
    };
    expect(await updatePost({ postId, caption: "x" })).toMatchObject(locked);
    expect(await updatePostMedia({ postId, items: [{ assetId: await mk() }] })).toMatchObject(
      locked,
    );
    expect(await archivePost(postId, true)).toMatchObject(locked);
    expect(await deletePost(postId)).toMatchObject(locked);
    const [p] = await testDb.select().from(posts).where(eq(posts.id, postId));
    expect(p.status).toBe("published");
    expect(p.caption).toBeNull();
    expect(p.archivedAt).toBeNull();
  });

  it("returns not_found / null for non-members", async () => {
    const { profile, mk } = await seed();
    const r = await createPost({ profileId: profile.id, kind: "post", assetIds: [await mk()] });
    if (!r.ok) throw new Error("x");
    const other = await seedWorkspace("b@x.co");
    mocks.user.id = other.user.id;
    expect(await getPost(r.data.postId)).toBeNull();
    expect(await deletePost(r.data.postId)).toMatchObject({ ok: false, code: "not_found" });
  });
});
