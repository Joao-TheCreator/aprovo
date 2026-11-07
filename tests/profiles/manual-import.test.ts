import { asc, desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { activityLog, importedPosts, mediaAssets, profiles } from "@/db/schema";
import { testDb } from "../setup";
import { makeRequireMock, seedWorkspace } from "../media/helpers";

const mocks = vi.hoisted(() => ({ user: { id: "" } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require", async () => makeRequireMock(mocks));

import { manualImport } from "@/lib/profiles/actions";

async function asset(workspaceId: string, status: "ready" | "processing" | "uploading" = "ready") {
  const [a] = await testDb
    .insert(mediaAssets)
    .values({
      workspaceId,
      kind: "image",
      status,
      originalPath: `originals/${workspaceId}/x.jpg`,
      thumbPath: status === "ready" ? `thumbs/${workspaceId}/x.webp` : null,
    })
    .returning();
  return a.id;
}

describe("manualImport", () => {
  let ctx: Awaited<ReturnType<typeof seedWorkspace>>;
  beforeEach(async () => {
    ctx = await seedWorkspace();
    mocks.user.id = ctx.user.id;
  });

  it("creates imported posts in order, sets avatar and header, logs activity", async () => {
    const ids = [await asset(ctx.ws.id), await asset(ctx.ws.id), await asset(ctx.ws.id)];
    const avatarAssetId = await asset(ctx.ws.id);
    const res = await manualImport(ctx.profile.id, {
      displayName: "Cliente",
      biography: "Bio",
      externalUrl: "https://example.com",
      followersCount: 1200,
      avatarAssetId,
      imageAssetIds: ids,
    });
    expect(res).toEqual({ ok: true, data: { imported: 3 } });

    const rows = await testDb
      .select()
      .from(importedPosts)
      .where(eq(importedPosts.profileId, ctx.profile.id))
      .orderBy(desc(importedPosts.publishedAt));
    expect(rows.map((r) => r.thumbAssetId)).toEqual(ids);
    expect(rows.map((r) => r.igMediaId)).toEqual(ids.map((i) => `manual_${i}`));
    expect(rows.every((r) => r.mediaType === "image")).toBe(true);

    const [p] = await testDb.select().from(profiles).where(eq(profiles.id, ctx.profile.id));
    expect(p.avatarAssetId).toBe(avatarAssetId);
    expect(p.displayName).toBe("Cliente");
    expect(p.followersCount).toBe(1200);
    expect(p.importSource).toBe("manual");
    expect(p.importStatus).toBe("ok");
    expect(p.lastImportedAt).not.toBeNull();

    const log = await testDb
      .select()
      .from(activityLog)
      .where(eq(activityLog.profileId, ctx.profile.id))
      .orderBy(asc(activityLog.createdAt));
    expect(log.map((l) => l.event)).toContain("profile.manual_imported");
  });

  it("rejects assets of another workspace", async () => {
    const other = await seedWorkspace("b@x.co");
    const foreign = await asset(other.ws.id);
    const res = await manualImport(ctx.profile.id, { imageAssetIds: [foreign] });
    expect(res).toMatchObject({ ok: false, code: "asset_not_found" });
    expect(await testDb.select().from(importedPosts)).toHaveLength(0);
  });

  it("rejects more than 12 images", async () => {
    const ids = await Promise.all(Array.from({ length: 13 }, () => asset(ctx.ws.id)));
    const res = await manualImport(ctx.profile.id, { imageAssetIds: ids });
    expect(res).toMatchObject({ ok: false, code: "too_many_files" });
    expect(await testDb.select().from(importedPosts)).toHaveLength(0);
  });

  it("rejects assets that are not ready", async () => {
    const ok = await asset(ctx.ws.id);
    const pending = await asset(ctx.ws.id, "processing");
    const res = await manualImport(ctx.profile.id, { imageAssetIds: [ok, pending] });
    expect(res).toMatchObject({ ok: false, code: "asset_not_ready" });
    expect(await testDb.select().from(importedPosts)).toHaveLength(0);
  });
});
