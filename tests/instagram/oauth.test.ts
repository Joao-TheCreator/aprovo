import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { instagramConnections, users } from "@/db/schema";
import { decrypt } from "@/lib/crypto/secretbox";
import {
  getInstagramProvider,
  getInstagramProviderForWorkspace,
  isGraphConfiguredForWorkspace,
} from "@/lib/instagram";
import {
  buildAuthorizeUrl,
  completeOAuth,
  getWorkspaceConnection,
  refreshIfNeeded,
  statesMatch,
} from "@/lib/instagram/oauth";
import { createWorkspaceForUser } from "@/lib/workspace/create";
import { testDb } from "../setup";

const mocks = vi.hoisted(() => ({ user: { id: "" }, wsId: "" }));
vi.mock("@/lib/auth/require", () => ({
  requireUser: async () => mocks.user,
  getCurrentWorkspace: async () => ({ id: mocks.wsId }),
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function metaFetch(calls: string[] = []) {
  return vi.fn(async (input: URL | string | Request) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input : input.url,
    );
    calls.push(`${url.origin}${url.pathname}`);
    if (url.origin === "https://api.instagram.com") {
      return json({
        access_token: "SHORT",
        user_id: 1784,
        permissions: "instagram_business_basic",
      });
    }
    if (url.pathname === "/access_token")
      return json({ access_token: "LONG", expires_in: 5184000 });
    if (url.pathname === "/refresh_access_token") {
      return json({ access_token: "REFRESHED", expires_in: 5184000 });
    }
    if (url.pathname === "/v21.0/me") {
      if (url.searchParams.get("fields")?.includes("followers_count")) {
        return json({ username: "Samuel", name: "Samuel S", followers_count: 10, media_count: 2 });
      }
      return json({
        user_id: "17841400000000001",
        username: "samuel",
        account_type: "MEDIA_CREATOR",
        profile_picture_url: "https://cdn/x.jpg",
      });
    }
    if (url.pathname === "/v21.0/me/media") {
      return json({
        data: [
          {
            id: "1",
            media_type: "IMAGE",
            media_url: "https://cdn/1.jpg",
            timestamp: "2026-01-01T00:00:00+0000",
          },
          { id: "2", media_type: "VIDEO", thumbnail_url: "https://cdn/2.jpg" },
        ],
        paging: { cursors: { after: "CUR" } },
      });
    }
    return json({ error: { message: "unexpected " + url.pathname } }, 400);
  });
}

let workspaceId: string;
let userId: string;

beforeAll(() => {
  process.env.AUTH_SECRET ||= "test-secret";
});
beforeEach(async () => {
  process.env.META_APP_ID = "app-id";
  process.env.META_APP_SECRET = "app-secret";
  process.env.META_REDIRECT_URI = "http://localhost:3000/api/instagram/callback";
  delete process.env.META_GRAPH_ACCESS_TOKEN;
  delete process.env.META_IG_USER_ID;
  const [u] = await testDb.insert(users).values({ email: "a@x.co" }).returning();
  const ws = await createWorkspaceForUser(testDb, u);
  userId = u.id;
  workspaceId = ws.id;
  mocks.user.id = u.id;
  mocks.wsId = ws.id;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authorize url and state", () => {
  it("builds the Instagram Login authorize URL", () => {
    const url = new URL(buildAuthorizeUrl("st"));
    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("app-id");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("st");
  });
  it("compares state strictly", () => {
    expect(statesMatch("abc", "abc")).toBe(true);
    expect(statesMatch("abc", "abd")).toBe(false);
    expect(statesMatch(undefined, "abc")).toBe(false);
    expect(statesMatch("abc", null)).toBe(false);
  });
});

describe("completeOAuth", () => {
  it("exchanges code, long-lived token and /me, storing the token encrypted", async () => {
    const calls: string[] = [];
    const f = metaFetch(calls);
    const row = await completeOAuth(
      { code: "CODE", workspaceId, userId },
      f as unknown as typeof fetch,
    );
    expect(calls).toEqual([
      "https://api.instagram.com/oauth/access_token",
      "https://graph.instagram.com/access_token",
      "https://graph.instagram.com/v21.0/me",
    ]);
    const [stored] = await testDb.select().from(instagramConnections);
    expect(stored.id).toBe(row.id);
    expect(stored.igUserId).toBe("17841400000000001");
    expect(stored.username).toBe("samuel");
    expect(stored.accessTokenEnc).not.toContain("LONG");
    expect(decrypt(stored.accessTokenEnc)).toBe("LONG");
    expect(stored.tokenExpiresAt.getTime()).toBeGreaterThan(Date.now() + 59 * 86400_000);
    // reconnect upserts
    await completeOAuth({ code: "CODE2", workspaceId, userId }, f as unknown as typeof fetch);
    expect(await testDb.select().from(instagramConnections)).toHaveLength(1);
  });

  it("fails on a bad Meta response without storing anything", async () => {
    const f = vi.fn(async () => json({ error: { message: "bad code" } }, 400));
    await expect(
      completeOAuth({ code: "x", workspaceId, userId }, f as unknown as typeof fetch),
    ).rejects.toThrow(/code exchange HTTP 400/);
    expect(await testDb.select().from(instagramConnections)).toHaveLength(0);
  });
});

describe("callback route", () => {
  it("rejects a state mismatch", async () => {
    const { GET } = await import("@/app/api/instagram/callback/route");
    const f = metaFetch();
    vi.stubGlobal("fetch", f);
    const req = new NextRequest("http://localhost:3000/api/instagram/callback?code=c&state=wrong", {
      headers: { cookie: "ig_oauth_state=right" },
    });
    const res = await GET(req);
    expect(res.headers.get("location")).toContain("/configuracoes?error=state_mismatch");
    expect(f).not.toHaveBeenCalled();
    expect(await testDb.select().from(instagramConnections)).toHaveLength(0);
  });

  it("connects when state matches, and maps denial", async () => {
    const { GET } = await import("@/app/api/instagram/callback/route");
    vi.stubGlobal("fetch", metaFetch());
    const ok = await GET(
      new NextRequest("http://localhost:3000/api/instagram/callback?code=c%23_&state=s1", {
        headers: { cookie: "ig_oauth_state=s1" },
      }),
    );
    expect(ok.headers.get("location")).toContain("/configuracoes?connected=1");
    expect(await getWorkspaceConnection(workspaceId)).not.toBeNull();
    const denied = await GET(
      new NextRequest(
        "http://localhost:3000/api/instagram/callback?error=access_denied&error_reason=user_denied",
      ),
    );
    expect(denied.headers.get("location")).toContain("error=denied");
  });
});

describe("refreshIfNeeded", () => {
  async function seed(expiresInDays: number) {
    const f = metaFetch();
    await completeOAuth({ code: "c", workspaceId, userId }, f as unknown as typeof fetch);
    await testDb
      .update(instagramConnections)
      .set({ tokenExpiresAt: new Date(Date.now() + expiresInDays * 86400_000) })
      .where(eq(instagramConnections.workspaceId, workspaceId));
    return (await getWorkspaceConnection(workspaceId))!;
  }

  it("does nothing when far from expiry", async () => {
    const c = await seed(30);
    const f = metaFetch();
    const out = await refreshIfNeeded(c, f as unknown as typeof fetch);
    expect(f).not.toHaveBeenCalled();
    expect(out.accessTokenEnc).toBe(c.accessTokenEnc);
  });

  it("refreshes within 7 days of expiry", async () => {
    const c = await seed(3);
    const f = metaFetch();
    const out = await refreshIfNeeded(c, f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(1);
    expect(decrypt(out.accessTokenEnc)).toBe("REFRESHED");
    expect(out.tokenExpiresAt.getTime()).toBeGreaterThan(Date.now() + 59 * 86400_000);
    expect(decrypt((await getWorkspaceConnection(workspaceId))!.accessTokenEnc)).toBe("REFRESHED");
  });

  it("keeps the connection when refresh fails", async () => {
    const c = await seed(2);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const f = vi.fn(async () => json({ error: { message: "nope" } }, 400));
    const out = await refreshIfNeeded(c, f as unknown as typeof fetch);
    expect(out.accessTokenEnc).toBe(c.accessTokenEnc);
  });
});

describe("provider resolution", () => {
  it("uses the workspace connection over env, with the own-account path via /me", async () => {
    process.env.META_GRAPH_ACCESS_TOKEN = "ENV";
    process.env.META_IG_USER_ID = "999";
    await completeOAuth({ code: "c", workspaceId, userId }, metaFetch() as unknown as typeof fetch);
    expect(await isGraphConfiguredForWorkspace(workspaceId)).toBe(true);

    const calls: string[] = [];
    vi.stubGlobal("fetch", metaFetch(calls));
    const provider = await getInstagramProviderForWorkspace(workspaceId);
    const profile = await provider.fetchProfile("SAMUEL");
    expect("code" in profile).toBe(false);
    if ("code" in profile) return;
    expect(profile.username).toBe("samuel");
    expect(profile.media).toHaveLength(2);
    expect(profile.nextCursor).toBe("CUR");
    expect(calls).toEqual([
      "https://graph.instagram.com/v21.0/me",
      "https://graph.instagram.com/v21.0/me/media",
    ]);
  });

  it("uses business_discovery on graph.instagram.com for other accounts", async () => {
    await completeOAuth({ code: "c", workspaceId, userId }, metaFetch() as unknown as typeof fetch);
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL) => {
        seen.push(input.toString());
        return json({ business_discovery: { username: "other", media: { data: [] } } });
      }),
    );
    const provider = await getInstagramProviderForWorkspace(workspaceId);
    const r = await provider.fetchProfile("other");
    expect("code" in r).toBe(false);
    expect(seen[0]).toContain("https://graph.instagram.com/v21.0/17841400000000001?");
    expect(decodeURIComponent(seen[0])).toContain("business_discovery.username(other)");
  });

  it("falls back to env, then to not_configured", async () => {
    process.env.META_GRAPH_ACCESS_TOKEN = "ENV";
    process.env.META_IG_USER_ID = "999";
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL) => {
        seen.push(input.toString());
        return json({ business_discovery: { username: "other", media: { data: [] } } });
      }),
    );
    await (await getInstagramProviderForWorkspace(workspaceId)).fetchProfile("other");
    expect(seen[0]).toContain("https://graph.facebook.com/v21.0/999?");

    delete process.env.META_GRAPH_ACCESS_TOKEN;
    delete process.env.META_IG_USER_ID;
    expect(await (await getInstagramProviderForWorkspace(workspaceId)).fetchProfile("x")).toEqual({
      code: "not_configured",
    });
    expect(await getInstagramProvider().fetchProfile("x")).toEqual({ code: "not_configured" });
  });
});
