import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mediaAssets, postMedia, posts } from "@/db/schema";
import { PublishValidationError } from "@/lib/publishing/contracts";
import {
  ensurePublishDerivative,
  preparePostMedia,
  signedMediaUrl,
} from "@/lib/publishing/prepare";
import { getStorage, storageKey } from "@/lib/storage";
import { LocalStorage } from "@/lib/storage/local";
import { testDb } from "../setup";
import { makeTempStorage, seedWorkspace } from "../media/helpers";

let tmp: Awaited<ReturnType<typeof makeTempStorage>>;
beforeAll(async () => {
  tmp = await makeTempStorage();
});
afterAll(async () => tmp.cleanup());
afterEach(() => vi.restoreAllMocks());

async function img(fmt: "png" | "jpeg", width: number, height: number): Promise<Buffer> {
  const base = sharp({ create: { width, height, channels: 3, background: "#39c" } });
  return fmt === "png" ? base.png().toBuffer() : base.jpeg().toBuffer();
}

async function insertImage(
  wsId: string,
  body: Buffer,
  mime: string,
  width: number,
  height: number,
) {
  const [a] = await testDb
    .insert(mediaAssets)
    .values({ workspaceId: wsId, kind: "image", originalPath: "x" })
    .returning();
  const key = storageKey("originals", wsId, a.id, "orig.bin");
  await getStorage().putObject(key, body, mime);
  const [row] = await testDb
    .update(mediaAssets)
    .set({
      originalPath: key,
      mimeType: mime,
      width,
      height,
      sizeBytes: body.length,
      status: "ready",
    })
    .where(eq(mediaAssets.id, a.id))
    .returning();
  return row;
}

describe("ensurePublishDerivative", () => {
  it("converts a PNG once and reuses the derivative", async () => {
    const { ws } = await seedWorkspace();
    const png = await img("png", 2000, 2000);
    const asset = await insertImage(ws.id, png, "image/png", 2000, 2000);
    const put = vi.spyOn(LocalStorage.prototype, "putObject");

    const first = await ensurePublishDerivative(asset);
    expect(first.key).toBe(`publish/${ws.id}/${asset.id}/publish.jpg`);
    expect(Math.max(first.width, first.height)).toBe(1440);
    expect(put).toHaveBeenCalledTimes(1);
    const meta = await sharp((await getStorage().getObject(first.key))!.body).metadata();
    expect(meta.format).toBe("jpeg");

    const second = await ensurePublishDerivative(asset); // stale row on purpose
    expect(second.key).toBe(first.key);
    expect(second.bytes).toBe(first.bytes);
    expect(put).toHaveBeenCalledTimes(1);

    const [row] = await testDb.select().from(mediaAssets).where(eq(mediaAssets.id, asset.id));
    expect(row.publishPath).toBe(first.key);
    expect((await getStorage().getObject(asset.originalPath))!.body.equals(png)).toBe(true);
  });

  it("uses a compliant JPEG as is, without writing", async () => {
    const { ws } = await seedWorkspace();
    const jpeg = await img("jpeg", 1080, 1350);
    const asset = await insertImage(ws.id, jpeg, "image/jpeg", 1080, 1350);
    const put = vi.spyOn(LocalStorage.prototype, "putObject");
    const out = await ensurePublishDerivative(asset);
    expect(out.key).toBe(asset.originalPath);
    expect(put).not.toHaveBeenCalled();
  });

  it("returns the original for videos", async () => {
    const { ws } = await seedWorkspace();
    const [v] = await testDb
      .insert(mediaAssets)
      .values({
        workspaceId: ws.id,
        kind: "video",
        originalPath: "originals/v/orig.mp4",
        mimeType: "video/mp4",
        status: "ready",
      })
      .returning();
    const put = vi.spyOn(LocalStorage.prototype, "putObject");
    expect((await ensurePublishDerivative(v)).key).toBe(v.originalPath);
    expect(put).not.toHaveBeenCalled();
  });
});

describe("signedMediaUrl", () => {
  it("signs with 2 h for images and 4 h for videos", async () => {
    const spy = vi.spyOn(LocalStorage.prototype, "getSignedUrl");
    await signedMediaUrl("originals/a/b/c.jpg", "image");
    await signedMediaUrl("originals/a/b/c.mp4", "video");
    expect(spy.mock.calls.map((c) => c[1])).toEqual([7200, 14400]);
  });
});

describe("preparePostMedia", () => {
  it("prepares a carousel with caption and signed URLs", async () => {
    const { ws, profile } = await seedWorkspace();
    const [post] = await testDb
      .insert(posts)
      .values({ profileId: profile.id, position: 0, caption: " Oi ", hashtags: ["#a", "A", "b"] })
      .returning();
    const a1 = await insertImage(ws.id, await img("png", 1000, 1000), "image/png", 1000, 1000);
    const a2 = await insertImage(ws.id, await img("jpeg", 1080, 1350), "image/jpeg", 1080, 1350);
    await testDb.insert(postMedia).values([
      { postId: post.id, assetId: a2.id, sortOrder: 1 },
      { postId: post.id, assetId: a1.id, sortOrder: 0 },
    ]);

    const prepared = await preparePostMedia(post.id);
    expect(prepared.caption).toBe("Oi\n\n#a #b");
    expect(prepared.items.map((i) => i.assetId)).toEqual([a1.id, a2.id]);
    expect(prepared.items.every((i) => i.url.length > 0 && i.kind === "image")).toBe(true);
    const [r1] = await testDb.select().from(mediaAssets).where(eq(mediaAssets.id, a1.id));
    const [r2] = await testDb.select().from(mediaAssets).where(eq(mediaAssets.id, a2.id));
    expect(r1.publishPath).toBeTruthy();
    expect(r2.publishPath).toBeNull();
  });

  it("throws PublishValidationError for a post without media", async () => {
    const { profile } = await seedWorkspace();
    const [post] = await testDb
      .insert(posts)
      .values({ profileId: profile.id, position: 0 })
      .returning();
    await expect(preparePostMedia(post.id)).rejects.toBeInstanceOf(PublishValidationError);
  });
});
