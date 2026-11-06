import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mediaAssets } from "@/db/schema";
import { processAsset } from "@/lib/media/process";
import { getStorage, storageKey } from "@/lib/storage";
import { testDb } from "../setup";
import { makeTempStorage, seedWorkspace } from "./helpers";

let tmp: Awaited<ReturnType<typeof makeTempStorage>>;
beforeAll(async () => {
  tmp = await makeTempStorage();
});
afterAll(async () => tmp.cleanup());

async function insertAsset(wsId: string, bytes: Buffer, kind: "image" | "video" = "image") {
  const [a] = await testDb
    .insert(mediaAssets)
    .values({ workspaceId: wsId, kind, status: "processing", originalPath: "x" })
    .returning();
  const key = storageKey("originals", wsId, a.id, "orig.bin");
  await getStorage().putObject(key, bytes, kind === "image" ? "image/jpeg" : "video/mp4");
  await testDb.update(mediaAssets).set({ originalPath: key }).where(eq(mediaAssets.id, a.id));
  return { id: a.id, key };
}

describe("processAsset", () => {
  it("generates preview and thumb, keeps the original untouched", async () => {
    const { ws } = await seedWorkspace();
    const jpeg = await sharp({
      create: { width: 2000, height: 1500, channels: 3, background: "#39c" },
    })
      .jpeg()
      .toBuffer();
    const { id, key } = await insertAsset(ws.id, jpeg);
    const res = await processAsset(id);
    expect(res).toEqual({ ok: true, data: { status: "ready" } });

    const [row] = await testDb.select().from(mediaAssets).where(eq(mediaAssets.id, id));
    expect(row.status).toBe("ready");
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect([row.width, row.height]).toEqual([2000, 1500]);
    const storage = getStorage();
    const thumb = await sharp((await storage.getObject(row.thumbPath!))!.body).metadata();
    const preview = await sharp((await storage.getObject(row.previewPath!))!.body).metadata();
    expect(Math.max(thumb.width!, thumb.height!)).toBeLessThanOrEqual(640);
    expect(preview.width).toBeLessThanOrEqual(1080);
    expect(preview.format).toBe("webp");
    const orig = await storage.getObject(key);
    expect(orig!.body.equals(jpeg)).toBe(true);
  });

  it("marks a corrupt file as failed", async () => {
    const { ws } = await seedWorkspace();
    const { id } = await insertAsset(ws.id, Buffer.from("not an image at all"));
    const res = await processAsset(id);
    expect(res).toMatchObject({ ok: false, code: "processing_failed" });
    const [row] = await testDb.select().from(mediaAssets).where(eq(mediaAssets.id, id));
    expect(row.status).toBe("failed");
  });

  it("rejects videos longer than 90 s", async () => {
    const { ws } = await seedWorkspace();
    const { id } = await insertAsset(ws.id, Buffer.from("fake video"), "video");
    const res = await processAsset(id, { durationMs: 95_000 });
    expect(res).toMatchObject({ ok: false, code: "too_long" });
  });

  it("copies poster paths to a video asset", async () => {
    const { ws } = await seedWorkspace();
    const jpeg = await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#222" },
    })
      .jpeg()
      .toBuffer();
    const poster = await insertAsset(ws.id, jpeg);
    await processAsset(poster.id);
    const video = await insertAsset(ws.id, Buffer.from("fake video"), "video");
    const res = await processAsset(video.id, {
      durationMs: 5000,
      width: 1080,
      height: 1920,
      posterAssetId: poster.id,
    });
    expect(res).toEqual({ ok: true, data: { status: "ready" } });
    const [p] = await testDb.select().from(mediaAssets).where(eq(mediaAssets.id, poster.id));
    const [v] = await testDb.select().from(mediaAssets).where(eq(mediaAssets.id, video.id));
    expect(v.posterPath).toBe(p.previewPath);
    expect(v.thumbPath).toBe(p.thumbPath);
    expect(v.durationMs).toBe(5000);
  });
});
