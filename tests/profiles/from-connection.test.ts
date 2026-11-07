import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importedPosts, profiles } from "@/db/schema";
import { completeOAuth, getConnectionById } from "@/lib/instagram/oauth";
import { ACCOUNT_DISCONNECTED_MESSAGE } from "@/lib/profiles/contracts";
import {
  createProfileAndImport,
  findOrCreateProfileForConnection,
  mapConnectionAccountType,
} from "@/lib/profiles/from-connection";
import { importProfileFromProvider } from "@/lib/profiles/import";
import { testDb } from "../setup";
import { makeRequireMock, seedWorkspace } from "../media/helpers";

const mocks = vi.hoisted(() => ({ user: { id: "" } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/instagram/download", () => ({ downloadImage: vi.fn(async () => null) }));
vi.mock("@/lib/auth/require", async () => {
  const base = await makeRequireMock(mocks);
  const { eq } = await import("drizzle-orm");
  const { db } = await import("@/db/client");
  const { workspaceMembers, workspaces } = await import("@/db/schema");
  return {
    ...base,
    getCurrentWorkspace: async (userId: string) => {
      const [row] = await db
        .select({ ws: workspaces })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .where(eq(workspaceMembers.userId, userId))
        .limit(1);
      return row ? { ...row.ws, role: "owner" } : null;
    },
  };
});

import { disconnectInstagram } from "@/app/(app)/configuracoes/actions";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Account = { id: string; username: string; type?: string };
const A: Account = { id: "17841400000000001", username: "conta_a", type: "MEDIA_CREATOR" };
const B: Account = { id: "17841400000000002", username: "conta_b", type: "BUSINESS" };

/**
 * Instagram Login mock: OAuth exchange (yielding `token`) and own-account reads. Every Graph
 * read records the access_token it carried so tests can assert which token was used.
 */
function metaFetch(account: Account, token: string, tokensSeen: string[] = []) {
  return vi.fn(async (input: URL | string | Request) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input : input.url,
    );
    if (url.origin === "https://api.instagram.com") {
      return json({
        access_token: "SHORT",
        user_id: account.id,
        permissions: "instagram_business_basic",
      });
    }
    if (url.pathname === "/access_token") {
      return json({ access_token: token, expires_in: 5184000 });
    }
    if (url.pathname === "/v21.0/me") {
      if (url.searchParams.get("fields")?.includes("followers_count")) {
        tokensSeen.push(url.searchParams.get("access_token") ?? "");
        return json({
          username: account.username,
          name: `Nome ${account.username}`,
          biography: "bio",
          followers_count: 10,
          follows_count: 5,
          media_count: 2,
        });
      }
      return json({
        user_id: account.id,
        username: account.username,
        account_type: account.type,
      });
    }
    if (url.pathname === "/v21.0/me/media") {
      tokensSeen.push(url.searchParams.get("access_token") ?? "");
      return json({
        data: [
          {
            id: `${account.id}_1`,
            media_type: "IMAGE",
            media_url: "https://cdn.example/1.jpg",
            permalink: "https://instagram.com/p/1",
            timestamp: "2026-01-01T00:00:00+0000",
          },
        ],
      });
    }
    return json({ error: { message: "unexpected " + url.pathname } }, 400);
  });
}

async function connect(workspaceId: string, userId: string, account: Account, token: string) {
  return completeOAuth(
    { code: "c", workspaceId, userId },
    metaFetch(account, token) as unknown as typeof fetch,
  );
}

beforeEach(() => {
  process.env.AUTH_SECRET ||= "test-secret";
  process.env.META_APP_ID = "app-id";
  process.env.META_APP_SECRET = "app-secret";
  process.env.META_REDIRECT_URI = "http://localhost:3000/api/instagram/callback";
  delete process.env.META_FB_APP_ID;
  delete process.env.META_FB_APP_SECRET;
  delete process.env.META_GRAPH_ACCESS_TOKEN;
  delete process.env.META_IG_USER_ID;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mapConnectionAccountType", () => {
  it("maps Graph account types", () => {
    expect(mapConnectionAccountType("BUSINESS")).toBe("business");
    expect(mapConnectionAccountType("MEDIA_CREATOR")).toBe("creator");
    expect(mapConnectionAccountType(null)).toBe("unknown");
    expect(mapConnectionAccountType("PERSONAL")).toBe("unknown");
  });
});

describe("createProfileAndImport", () => {
  it("creates the profile of a new account with header fields and imported posts", async () => {
    const s = await seedWorkspace();
    const conn = await connect(s.ws.id, s.user.id, A, "TOKEN_A");
    vi.stubGlobal("fetch", metaFetch(A, "unused"));

    const { profileId, created } = await createProfileAndImport(conn);
    expect(created).toBe(true);

    const [p] = await testDb.select().from(profiles).where(eq(profiles.id, profileId));
    expect(p.workspaceId).toBe(s.ws.id);
    expect(p.igUsername).toBe("conta_a");
    expect(p.connectionId).toBe(conn.id);
    expect(p.importSource).toBe("graph_api");
    expect(p.accountType).toBe("creator");
    expect(p.timezone).toBe("America/Sao_Paulo");
    expect(p.importStatus).toBe("ok");
    expect(p.displayName).toBe("Nome conta_a");
    expect(p.followersCount).toBe(10);
    const posts = await testDb
      .select()
      .from(importedPosts)
      .where(eq(importedPosts.profileId, profileId));
    expect(posts.length).toBeGreaterThanOrEqual(1);
  });

  it("reuses the profile when the same account connects again and re-links connection_id", async () => {
    const s = await seedWorkspace();
    const conn = await connect(s.ws.id, s.user.id, A, "TOKEN_A");
    vi.stubGlobal("fetch", metaFetch(A, "unused"));
    const first = await createProfileAndImport(conn);

    // Simulate a lost link, then reconnect (same ig_user_id keeps the same connection row).
    await testDb
      .update(profiles)
      .set({ connectionId: null })
      .where(eq(profiles.id, first.profileId));
    const again = await connect(s.ws.id, s.user.id, A, "TOKEN_A2");
    const second = await createProfileAndImport(again);

    expect(second.created).toBe(false);
    expect(second.profileId).toBe(first.profileId);
    const rows = await testDb.select().from(profiles).where(eq(profiles.workspaceId, s.ws.id));
    expect(rows.filter((r) => r.igUsername === "conta_a")).toHaveLength(1);
    expect(rows.find((r) => r.id === first.profileId)?.connectionId).toBe(again.id);
  });

  it("links an existing manual profile of the same @ (case-insensitive) instead of duplicating", async () => {
    const s = await seedWorkspace();
    const [manual] = await testDb
      .insert(profiles)
      .values({ workspaceId: s.ws.id, igUsername: "Conta_A" })
      .returning();
    const conn = await connect(s.ws.id, s.user.id, A, "TOKEN_A");
    const res = await findOrCreateProfileForConnection(conn);
    expect(res).toEqual({ profileId: manual.id, created: false });
    const [after] = await testDb.select().from(profiles).where(eq(profiles.id, manual.id));
    expect(after.connectionId).toBe(conn.id);
  });

  it("does not fail when the import fails; the profile keeps import_status failed", async () => {
    const s = await seedWorkspace();
    const conn = await connect(s.ws.id, s.user.id, A, "TOKEN_A");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: { message: "boom" } }, 500)),
    );
    const { profileId } = await createProfileAndImport(conn);
    const [p] = await testDb.select().from(profiles).where(eq(profiles.id, profileId));
    expect(p.importStatus).toBe("failed");
    expect(p.connectionId).toBe(conn.id);
  });
});

describe("manual profiles", () => {
  it("keep connection_id null and still import through the env bridge", async () => {
    const s = await seedWorkspace();
    process.env.META_GRAPH_ACCESS_TOKEN = "ENV";
    process.env.META_IG_USER_ID = "999";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ business_discovery: { username: "cliente", media: { data: [] } } })),
    );
    const res = await importProfileFromProvider(s.profile.id);
    expect(res.ok).toBe(true);
    const [p] = await testDb.select().from(profiles).where(eq(profiles.id, s.profile.id));
    expect(p.connectionId).toBeNull();
    expect(p.importStatus).toBe("ok");
  });
});

describe("token per connection", () => {
  it("each workspace imports its profile with its own connection token", async () => {
    const s1 = await seedWorkspace("a@x.co");
    const s2 = await seedWorkspace("b@x.co");
    const c1 = await connect(s1.ws.id, s1.user.id, A, "TOKEN_WS1");
    const c2 = await connect(s2.ws.id, s2.user.id, A, "TOKEN_WS2");

    const seen1: string[] = [];
    vi.stubGlobal("fetch", metaFetch(A, "unused", seen1));
    await createProfileAndImport(c1);
    expect(seen1.length).toBeGreaterThan(0);
    expect(new Set(seen1)).toEqual(new Set(["TOKEN_WS1"]));

    const seen2: string[] = [];
    vi.stubGlobal("fetch", metaFetch(A, "unused", seen2));
    await createProfileAndImport(c2);
    expect(new Set(seen2)).toEqual(new Set(["TOKEN_WS2"]));

    const rows = await testDb.select().from(profiles).where(eq(profiles.igUsername, "conta_a"));
    expect(rows).toHaveLength(2);
  });

  it("two accounts in one workspace use their own tokens", async () => {
    const s = await seedWorkspace();
    const ca = await connect(s.ws.id, s.user.id, A, "TOKEN_A");
    const cb = await connect(s.ws.id, s.user.id, B, "TOKEN_B");
    const seen: string[] = [];
    vi.stubGlobal("fetch", metaFetch(B, "unused", seen));
    await createProfileAndImport(cb);
    expect(new Set(seen)).toEqual(new Set(["TOKEN_B"]));
    expect((await getConnectionById(ca.id, s.ws.id))?.id).toBe(ca.id);
  });
});

describe("disconnect", () => {
  it("sets connection_id to null and the next import reports the disconnected account", async () => {
    const s = await seedWorkspace();
    mocks.user.id = s.user.id;
    const conn = await connect(s.ws.id, s.user.id, A, "TOKEN_A");
    vi.stubGlobal("fetch", metaFetch(A, "unused"));
    const { profileId } = await createProfileAndImport(conn);

    await expect(disconnectInstagram(conn.id)).rejects.toThrow(/NEXT_REDIRECT/);
    const [p] = await testDb.select().from(profiles).where(eq(profiles.id, profileId));
    expect(p.connectionId).toBeNull();
    expect(p.importSource).toBe("graph_api");

    const res = await importProfileFromProvider(profileId);
    expect(res.ok).toBe(false);
    const [after] = await testDb.select().from(profiles).where(eq(profiles.id, profileId));
    expect(after.importStatus).toBe("failed");
    expect(after.importError).toBe(ACCOUNT_DISCONNECTED_MESSAGE);
    expect(ACCOUNT_DISCONNECTED_MESSAGE).toBe(
      "Conta do Instagram desconectada. Reconecte em Configurações.",
    );
  });
});

describe("callback route", () => {
  it("creates the profile and redirects to /perfis/<id>?connected=1", async () => {
    const s = await seedWorkspace();
    mocks.user.id = s.user.id;
    vi.stubGlobal("fetch", metaFetch(B, "TOKEN_B"));
    const { GET } = await import("@/app/api/instagram/callback/route");
    const res = await GET(
      new NextRequest("http://localhost:3000/api/instagram/callback?code=c%23_&state=s1", {
        headers: { cookie: "ig_oauth_state=s1; ig_oauth_provider=instagram" },
      }),
    );
    const [p] = await testDb.select().from(profiles).where(eq(profiles.igUsername, "conta_b"));
    expect(p).toBeDefined();
    expect(p.accountType).toBe("business");
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname + location.search).toBe(`/perfis/${p.id}?connected=1`);
  });
});
