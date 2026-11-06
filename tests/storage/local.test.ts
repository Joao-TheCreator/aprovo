import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalStorage, verifySignature } from "@/lib/storage/local";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "aprovo-storage-"));
  process.env.AUTH_SECRET ||= "test-secret";
  process.env.APP_URL = "http://localhost:3000";
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("LocalStorage", () => {
  it("puts, gets and deletes objects with content type", async () => {
    const s = new LocalStorage(dir);
    await s.putObject("ig-cache/w/a/thumb.webp", Buffer.from("hello"), "image/webp");
    const got = await s.getObject("ig-cache/w/a/thumb.webp");
    expect(got?.body.toString()).toBe("hello");
    expect(got?.contentType).toBe("image/webp");
    await s.deleteObject("ig-cache/w/a/thumb.webp");
    expect(await s.getObject("ig-cache/w/a/thumb.webp")).toBeNull();
  });

  it("signs URLs that verify and rejects tampering or expiry", async () => {
    const s = new LocalStorage(dir);
    const key = "ig-cache/w/a/thumb.webp";
    const url = new URL(await s.getSignedUrl(key, 60));
    expect(url.pathname).toBe(`/api/files/${key}`);
    const exp = url.searchParams.get("exp");
    const sig = url.searchParams.get("sig");
    expect(verifySignature(key, exp, sig)).toBe(true);
    expect(verifySignature("ig-cache/w/b/thumb.webp", exp, sig)).toBe(false);
    expect(verifySignature(key, String(Number(exp) + 1), sig)).toBe(false);
    expect(verifySignature(key, exp, sig + "x")).toBe(false);
    expect(verifySignature(key, null, null)).toBe(false);
    const expired = new URL(await s.getSignedUrl(key, -10));
    expect(
      verifySignature(key, expired.searchParams.get("exp"), expired.searchParams.get("sig")),
    ).toBe(false);
  });

  it("rejects path traversal", async () => {
    const s = new LocalStorage(dir);
    await expect(s.putObject("../evil", Buffer.from("x"), "text/plain")).rejects.toThrow();
    await expect(s.getObject("a/../../etc/passwd")).rejects.toThrow();
    await expect(s.getSignedUrl("/abs/path")).rejects.toThrow();
  });
});
