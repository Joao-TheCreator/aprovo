import { describe, expect, it } from "vitest";
import fixture from "../fixtures/business_discovery.json";
import { buildFields, mapGraphError } from "@/lib/instagram/graph";
import { businessDiscoverySchema, mapProfile } from "@/lib/instagram/mapping";

describe("business discovery mapping", () => {
  const profile = mapProfile(businessDiscoverySchema.parse(fixture).business_discovery);

  it("maps header fields", () => {
    expect(profile.username).toBe("cpcann");
    expect(profile.displayName).toBe("CPCann");
    expect(profile.followersCount).toBe(12840);
    expect(profile.followingCount).toBe(312);
    expect(profile.mediaCount).toBe(487);
    expect(profile.externalUrl).toBe("https://cpcann.org.br");
    expect(profile.avatarUrl).toContain("avatar.jpg");
    expect(profile.nextCursor).toBe("QVFIUjZAxMjM0");
  });

  it("maps 5 media with types and thumbnail choice", () => {
    expect(profile.media).toHaveLength(5);
    expect(profile.media.map((m) => m.mediaType)).toEqual([
      "image",
      "carousel",
      "video",
      "image",
      "image",
    ]);
    expect(profile.media[0].thumbnailUrl).toContain("img1.jpg");
    expect(profile.media[1].thumbnailUrl).toContain("car2_a.jpg"); // first child
    expect(profile.media[2].thumbnailUrl).toContain("reel3_thumb.jpg"); // not the mp4
    expect(profile.media[4].caption).toBeNull();
    expect(profile.media[0].publishedAt?.toISOString()).toBe("2026-10-30T14:00:00.000Z");
  });

  it("builds the business_discovery query", () => {
    const f = buildFields("cpcann");
    expect(f).toContain("business_discovery.username(cpcann)");
    expect(f).toContain("media.limit(36)");
    expect(f).toContain("children{");
  });
});

describe("graph error mapping", () => {
  it("maps known errors", () => {
    expect(
      mapGraphError(400, { error: { code: 100, error_subcode: 2207013, message: "x" } }),
    ).toEqual({
      code: "private_or_personal",
    });
    expect(mapGraphError(400, { error: { code: 110, message: "Not a business account" } })).toEqual(
      {
        code: "private_or_personal",
      },
    );
    expect(mapGraphError(400, { error: { code: 803, message: "Object does not exist" } })).toEqual({
      code: "not_found",
    });
    expect(mapGraphError(400, { error: { code: 4, message: "limit" } }).code).toBe("rate_limited");
    expect(mapGraphError(429, null).code).toBe("rate_limited");
    expect(mapGraphError(500, { error: { code: 2, message: "boom" } }).code).toBe("provider_down");
  });
});
