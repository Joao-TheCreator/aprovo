import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/business_discovery.json";
import { importedPosts, mediaAssets, profiles, users } from "@/db/schema";
import { mapProfile, businessDiscoverySchema } from "@/lib/instagram/mapping";
import { igUsernameSchema } from "@/lib/profiles/contracts";
import { createWorkspaceForUser } from "@/lib/workspace/create";
import { testDb } from "../setup";

const mocks = vi.hoisted(() => ({
  provider: { fetchProfile: vi.fn(), fetchMedia: vi.fn() },
  download: vi.fn(),
  user: { id: "" },
}));
vi.mock("@/lib/instagram", async (orig) => ({
  ...(await orig<typeof import("@/lib/instagram")>()),
  getInstagramProvider: () => mocks.provider,
}));
vi.mock("@/lib/instagram/download", () => ({ downloadImage: mocks.download }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require", async () => {
  const { eq, asc } = await import("drizzle-orm");
  const { db } = await import("@/db/client");
  const schema = await import("@/db/schema");
  return {
    requireUser: async () => mocks.user,
    getCurrentWorkspace: async (userId: string) => {
      const [r] = await db
        .select({ w: schema.workspaces })
        .from(schema.workspaceMembers)
        .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
        .where(eq(schema.workspaceMembers.userId, userId))
        .orderBy(asc(schema.workspaceMembers.createdAt))
        .limit(1);
      return r?.w ?? null;
    },
  };
});

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "aprovo-import-"));
  process.env.LOCAL_STORAGE_DIR = dir;
  process.env.STORAGE_DRIVER = "local";
  process.env.AUTH_SECRET ||= "test-secret";
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function setup() {
  const [u] = await testDb.insert(users).values({ email: "a@x.co" }).returning();
  const ws = await createWorkspaceForUser(testDb, u);
  mocks.user.id = u.id;
  const png = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: "#c33" },
  })
    .png()
    .toBuffer();
  mocks.download.mockReset().mockResolvedValue(png);
  mocks.provider.fetchProfile
    .mockReset()
    .mockResolvedValue(mapProfile(businessDiscoverySchema.parse(fixture).business_discovery));
  return { ws };
}

describe("igUsernameSchema", () => {
  it("normalizes and validates", () => {
    expect(igUsernameSchema.parse(" @CPCann ")).toBe("cpcann");
    expect(igUsernameSchema.safeParse("bad name!").success).toBe(false);
    expect(igUsernameSchema.safeParse("a".repeat(31)).success).toBe(false);
  });
});

describe("importProfileFromProvider", () => {
  it("imports header, posts and thumbnails", async () => {
    const { ws } = await setup();
    const { importProfileFromProvider } = await import("@/lib/profiles/import");
    const [p] = await testDb
      .insert(profiles)
      .values({ workspaceId: ws.id, igUsername: "cpcann" })
      .returning();

    const res = await importProfileFromProvider(p.id);
    expect(res).toEqual({ ok: true, imported: 5 });

    const [after] = await testDb.select().from(profiles).where(eq(profiles.id, p.id));
    expect(after.displayName).toBe("CPCann");
    expect(after.followersCount).toBe(12840);
    expect(after.importStatus).toBe("ok");
    expect(after.importSource).toBe("graph_api");
    expect(after.accountType).toBe("business");
    expect(after.lastImportedAt).not.toBeNull();
    expect(after.avatarAssetId).not.toBeNull();

    const posts = await testDb
      .select()
      .from(importedPosts)
      .where(eq(importedPosts.profileId, p.id));
    expect(posts).toHaveLength(5);
    expect(posts.every((x) => x.thumbAssetId)).toBe(true);
    const assets = await testDb.select().from(mediaAssets);
    expect(assets).toHaveLength(6); // 5 + avatar
    const a = assets[0];
    expect(a.originalPath).toMatch(/^ig-cache\/.+\/thumb\.webp$/);
    expect(a.width).toBe(640);
    expect(a.height).toBe(480);
    const file = await readFile(path.join(dir, a.thumbPath!));
    expect((await sharp(file).metadata()).format).toBe("webp");
  });

  it("survives download failures (null thumbs)", async () => {
    const { ws } = await setup();
    mocks.download.mockResolvedValue(null);
    const { importProfileFromProvider } = await import("@/lib/profiles/import");
    const [p] = await testDb
      .insert(profiles)
      .values({ workspaceId: ws.id, igUsername: "cpcann" })
      .returning();
    expect(await importProfileFromProvider(p.id)).toEqual({ ok: true, imported: 5 });
    const posts = await testDb.select().from(importedPosts);
    expect(posts.every((x) => x.thumbAssetId === null)).toBe(true);
  });

  it("marks failed on provider error", async () => {
    const { ws } = await setup();
    mocks.provider.fetchProfile.mockResolvedValue({ code: "private_or_personal" });
    const { importProfileFromProvider } = await import("@/lib/profiles/import");
    const [p] = await testDb
      .insert(profiles)
      .values({ workspaceId: ws.id, igUsername: "pessoal" })
      .returning();
    const res = await importProfileFromProvider(p.id);
    expect(res).toEqual({ ok: false, error: { code: "private_or_personal" } });
    const [after] = await testDb.select().from(profiles).where(eq(profiles.id, p.id));
    expect(after.importStatus).toBe("failed");
    expect(after.importError).toBeTruthy();
  });
});

describe("connectProfile", () => {
  it("connects, then reports already_connected", async () => {
    await setup();
    const { connectProfile, createProfileWithoutFeed } = await import("@/lib/profiles/actions");
    const first = await connectProfile({ username: "@CPCann" });
    expect(first).toMatchObject({ ok: true, imported: 5, source: "graph_api" });
    const again = await connectProfile({ username: "cpcann" });
    expect(again).toMatchObject({
      ok: false,
      code: "already_connected",
      profileId: first.ok ? first.profileId : undefined,
    });
    expect(await connectProfile({ username: "no good" })).toMatchObject({
      ok: false,
      code: "invalid_username",
    });
    expect(await createProfileWithoutFeed({ username: "outro" })).toMatchObject({
      ok: true,
      imported: 0,
      source: "none",
    });
  });

  it("keeps the profile on provider error", async () => {
    await setup();
    mocks.provider.fetchProfile.mockResolvedValue({ code: "not_configured" });
    const { connectProfile } = await import("@/lib/profiles/actions");
    const res = await connectProfile({ username: "x.y" });
    expect(res).toMatchObject({ ok: false, code: "not_configured" });
    const rows = await testDb.select().from(profiles);
    expect(rows).toHaveLength(1);
    expect(rows[0].importStatus).toBe("failed");
  });
});
