import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mediaAssets } from "@/db/schema";
import { signPutKey, verifyPutSignature, verifySignature } from "@/lib/storage/local";
import { getStorage } from "@/lib/storage";
import { testDb } from "../setup";
import { makeRequireMock, makeTempStorage, seedWorkspace } from "./helpers";

const mocks = vi.hoisted(() => ({ user: { id: "" } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require", async () => makeRequireMock(mocks));

import { requestUpload } from "@/lib/media/actions";

let tmp: Awaited<ReturnType<typeof makeTempStorage>>;
beforeAll(async () => {
  tmp = await makeTempStorage();
});
afterAll(async () => tmp.cleanup());

describe("requestUpload", () => {
  it("rejects wrong type and too-large files", async () => {
    const { user, profile } = await seedWorkspace();
    mocks.user.id = user.id;
    const base = { profileId: profile.id, filename: "a.jpg", kind: "image" as const };
    expect(
      await requestUpload({ ...base, contentType: "application/pdf", size: 10 }),
    ).toMatchObject({
      ok: false,
      code: "invalid_type",
    });
    expect(await requestUpload({ ...base, contentType: "video/mp4", size: 10 })).toMatchObject({
      code: "invalid_type",
    });
    expect(
      await requestUpload({ ...base, contentType: "image/jpeg", size: 31 * 1024 * 1024 }),
    ).toMatchObject({ code: "too_large" });
    expect(
      await requestUpload({
        ...base,
        filename: "v.mov",
        kind: "video",
        contentType: "video/quicktime",
        size: 301 * 1024 * 1024,
      }),
    ).toMatchObject({ code: "too_large" });
  });

  it("creates the row and returns a local PUT ticket; sniffs heic", async () => {
    const { user, profile, ws } = await seedWorkspace();
    mocks.user.id = user.id;
    const res = await requestUpload({
      profileId: profile.id,
      filename: "Foto Ação.HEIC",
      contentType: "application/octet-stream",
      size: 1000,
      kind: "image",
    });
    if (!res.ok) throw new Error(res.code);
    expect(res.data.method).toBe("PUT");
    expect(res.data.headers["Content-Type"]).toBe("image/heic");
    const [row] = await testDb
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, res.data.assetId));
    expect(row.status).toBe("uploading");
    expect(row.workspaceId).toBe(ws.id);
    expect(row.originalPath).toMatch(new RegExp(`^originals/${ws.id}/${row.id}/[A-Za-z0-9._-]+$`));

    const url = new URL(res.data.uploadUrl);
    expect(url.pathname).toBe(`/api/files/${row.originalPath}`);
    expect(url.searchParams.get("op")).toBe("put");
    const key = decodeURIComponent(url.pathname.replace("/api/files/", ""));
    expect(verifyPutSignature(key, url.searchParams.get("exp"), url.searchParams.get("sig"))).toBe(
      true,
    );
  });

  it("denies non-members", async () => {
    const { profile } = await seedWorkspace("a@x.co");
    const other = await seedWorkspace("b@x.co");
    mocks.user.id = other.user.id;
    const res = await requestUpload({
      profileId: profile.id,
      filename: "a.jpg",
      contentType: "image/jpeg",
      size: 10,
      kind: "image",
    });
    expect(res).toMatchObject({ ok: false, code: "not_found" });
  });
});

describe("local PUT signatures", () => {
  it("verifies PUT signatures and keeps them separate from GET", async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = signPutKey("originals/w/a/f.jpg", exp);
    expect(verifyPutSignature("originals/w/a/f.jpg", String(exp), sig)).toBe(true);
    expect(verifyPutSignature("originals/w/a/other.jpg", String(exp), sig)).toBe(false);
    expect(verifyPutSignature("originals/w/a/f.jpg", String(exp), "bad")).toBe(false);
    expect(verifyPutSignature("originals/w/a/f.jpg", String(exp - 120), sig)).toBe(false);
    expect(verifySignature("originals/w/a/f.jpg", String(exp), sig)).toBe(false);
  });

  it("PUT route stores the body and rejects bad signatures", async () => {
    const { PUT } = await import("@/app/api/files/[...key]/route");
    const { NextRequest } = await import("next/server");
    const key = "originals/w/a/up.jpg";
    const { url } = await getStorage().getSignedUploadUrl(key, "image/jpeg");
    const call = (u: string) =>
      PUT(
        new NextRequest(u, {
          method: "PUT",
          body: "hello",
          headers: { "Content-Type": "image/jpeg" },
        }),
        {
          params: Promise.resolve({ key: key.split("/") }),
        },
      );
    expect((await call(url.replace(/sig=[^&]+/, "sig=bad"))).status).toBe(403);
    expect((await call(url)).status).toBe(204);
    const head = await getStorage().headObject(key);
    expect(head).toEqual({ size: 5, contentType: "image/jpeg" });
  });
});
