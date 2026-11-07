import { describe, expect, it } from "vitest";
import type { MediaAssetRow } from "@/lib/media/urls";
import { validateForInstagram } from "@/lib/publishing/prepare";

let seq = 0;
function asset(over: Partial<MediaAssetRow> = {}): MediaAssetRow {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    workspaceId: "w",
    kind: "image",
    originalPath: "originals/w/a/orig",
    previewPath: null,
    thumbPath: null,
    posterPath: null,
    publishPath: null,
    width: 1080,
    height: 1350,
    durationMs: null,
    sizeBytes: 500_000,
    mimeType: "image/jpeg",
    sha256: null,
    status: "ready",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as MediaAssetRow;
}
const media = (...assets: MediaAssetRow[]) => assets.map((a, i) => ({ asset: a, sortOrder: i }));

describe("validateForInstagram", () => {
  it("accepts a 4:5 JPEG", () => {
    expect(validateForInstagram({ kind: "post", media: media(asset()) })).toEqual([]);
  });

  it("accepts a 1:1 PNG (converted later)", () => {
    const png = asset({ mimeType: "image/png", width: 1000, height: 1000 });
    expect(validateForInstagram({ kind: "post", media: media(png) })).toEqual([]);
  });

  it("rejects a 1:3 image with the doc 12 message", () => {
    const tall = asset({ width: 400, height: 1200 });
    const issues = validateForInstagram({ kind: "post", media: media(asset(), tall) });
    expect(issues).toEqual([
      {
        code: "media_rejected",
        message: "A imagem 2 tem proporção 1:3; o Instagram aceita entre 4:5 e 1.91:1.",
        assetId: tall.id,
      },
    ]);
  });

  it("rejects 11 items and empty posts", () => {
    const eleven = Array.from({ length: 11 }, () => asset());
    expect(validateForInstagram({ kind: "post", media: media(...eleven) })[0].code).toBe(
      "too_many_items",
    );
    expect(validateForInstagram({ kind: "post", media: [] })[0].code).toBe("no_media");
  });

  it("accepts a MOV video and a video mixed with images in a post", () => {
    const mov = asset({
      kind: "video",
      mimeType: "video/quicktime",
      durationMs: 20_000,
      sizeBytes: 50_000_000,
      width: 1080,
      height: 1920,
    });
    expect(validateForInstagram({ kind: "video", media: media(mov) })).toEqual([]);
    expect(validateForInstagram({ kind: "post", media: media(mov, asset(), asset()) })).toEqual([]);
  });

  it("rejects a video post with more than one item or an image", () => {
    const mp4 = asset({ kind: "video", mimeType: "video/mp4", durationMs: 10_000 });
    expect(validateForInstagram({ kind: "video", media: media(mp4, mp4) })[0].code).toBe(
      "too_many_items",
    );
    expect(validateForInstagram({ kind: "video", media: media(asset()) })[0].code).toBe(
      "unsupported_type",
    );
  });

  it("flags assets that are not ready", () => {
    const issues = validateForInstagram({
      kind: "post",
      media: media(asset({ status: "processing" })),
    });
    expect(issues.map((i) => i.code)).toEqual(["media_not_ready"]);
  });
});
