import { beforeAll, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto/secretbox";

beforeAll(() => {
  process.env.AUTH_SECRET ||= "test-secret";
});

describe("secretbox", () => {
  it("round-trips and uses the v1 format", () => {
    const enc = encrypt("IGQ-token-ã");
    expect(enc.split(":")).toHaveLength(4);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain("IGQ-token");
    expect(decrypt(enc)).toBe("IGQ-token-ã");
  });

  it("uses a fresh IV per call", () => {
    expect(encrypt("x")).not.toBe(encrypt("x"));
  });

  it("rejects tampered ciphertext and bad format", () => {
    const parts = encrypt("secret").split(":");
    const ct = Buffer.from(parts[2], "base64");
    ct[0] ^= 1;
    parts[2] = ct.toString("base64");
    expect(() => decrypt(parts.join(":"))).toThrow();
    expect(() => decrypt("v2:a:b:c")).toThrow();
    expect(() => decrypt("garbage")).toThrow();
  });

  it("fails with a different key", () => {
    const enc = encrypt("secret");
    const prev = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "other-secret";
    try {
      expect(() => decrypt(enc)).toThrow();
    } finally {
      process.env.AUTH_SECRET = prev;
    }
  });
});
