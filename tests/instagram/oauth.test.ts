import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { instagramConnections, profiles, users } from "@/db/schema";
import { decrypt } from "@/lib/crypto/secretbox";
import {
  getInstagramProvider,
  getInstagramProviderForProfile,
  isGraphConfiguredForWorkspace,
} from "@/lib/instagram";
import {
  activeOAuthProvider,
  buildAuthorizeUrl,
  buildFacebookAuthorizeUrl,
  canPublish,
  completeOAuth,
  instagramScopes,
  PUBLISH_SCOPE,
  listConnections,
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

type FbAccounts = { id: string; instagram_business_account?: { id: string; username: string } }[];

function facebookFetch(calls: string[] = [], pages?: FbAccounts) {
  return vi.fn(async (input: URL | string | Request) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input : input.url,
    );
    calls.push(`${url.origin}${url.pathname}${url.searchParams.get("grant_type") ?? ""}`);
    if (url.origin !== "https://graph.facebook.com") {
      return json({ error: { message: "unexpected host " + url.origin } }, 400);
    }
    if (url.pathname === "/v21.0/oauth/access_token") {
      if (url.searchParams.get("grant_type") === "fb_exchange_token") {
        const prev = url.searchParams.get("fb_exchange_token");
        return json({
          access_token: prev === "FBSHORT" ? "FBLONG" : "FBREFRESHED",
          expires_in: 5184000,
        });
      }
      return json({ access_token: "FBSHORT", token_type: "bearer" });
    }
    if (url.pathname === "/v21.0/me/accounts") {
      return json({
        data: pages ?? [
          { id: "p1" },
          {
            id: "p2",
            instagram_business_account: { id: "17841499999999999", username: "elim" },
          },
        ],
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
  process.env.META_FB_APP_ID = "fb-app-id";
  process.env.META_FB_APP_SECRET = "fb-app-secret";
  delete process.env.META_FB_CONFIG_ID;
  delete process.env.META_FB_REDIRECT_URI;
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

describe("publish scope behind IG_PUBLISH_ENABLED", () => {
  afterEach(() => {
    delete process.env.IG_PUBLISH_ENABLED;
  });

  it("asks only for the basic scope when the flag is unset or not exactly true", () => {
    delete process.env.IG_PUBLISH_ENABLED;
    expect(instagramScopes()).toEqual(["instagram_business_basic"]);
    process.env.IG_PUBLISH_ENABLED = "false";
    expect(instagramScopes()).toEqual(["instagram_business_basic"]);
    expect(new URL(buildAuthorizeUrl("st")).searchParams.get("scope")).toBe(
      "instagram_business_basic",
    );
  });

  it("also asks for the publish scope when the flag is true", () => {
    process.env.IG_PUBLISH_ENABLED = "true";
    expect(instagramScopes()).toEqual(["instagram_business_basic", PUBLISH_SCOPE]);
    expect(new URL(buildAuthorizeUrl("st")).searchParams.get("scope")).toBe(
      "instagram_business_basic,instagram_business_content_publish",
    );
  });

  it("canPublish reflects the granted scopes", () => {
    expect(canPublish({ scopes: ["instagram_business_basic"] })).toBe(false);
    expect(canPublish({ scopes: ["instagram_business_basic", PUBLISH_SCOPE] })).toBe(true);
  });
});

describe("facebook authorize url", () => {
  it("defaults to Instagram Login; Facebook only when selected or the only one configured (ADR-009)", () => {
    expect(activeOAuthProvider()).toBe("instagram");
    process.env.META_OAUTH_PROVIDER = "facebook";
    expect(activeOAuthProvider()).toBe("facebook");
    delete process.env.META_OAUTH_PROVIDER;
    delete process.env.META_APP_ID;
    expect(activeOAuthProvider()).toBe("facebook");
    delete process.env.META_FB_APP_ID;
    expect(activeOAuthProvider()).toBeNull();
  });

  it("sends scopes when no config id is set", () => {
    const url = new URL(buildFacebookAuthorizeUrl("st"));
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v21.0/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("fb-app-id");
    expect(url.searchParams.get("scope")).toBe(
      "instagram_basic,pages_show_list,pages_read_engagement",
    );
    expect(url.searchParams.get("config_id")).toBeNull();
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("uses config_id instead of scope when META_FB_CONFIG_ID is set", () => {
    process.env.META_FB_CONFIG_ID = "cfg-1";
    const url = new URL(buildFacebookAuthorizeUrl("st"));
    expect(url.searchParams.get("config_id")).toBe("cfg-1");
    expect(url.searchParams.get("override_default_response_type")).toBe("true");
    expect(url.searchParams.get("scope")).toBeNull();
  });
});

describe("completeOAuth with Facebook", () => {
  it("exchanges code, long-lived token and /me/accounts, storing provider facebook", async () => {
    const calls: string[] = [];
    const f = facebookFetch(calls);
    await completeOAuth(
      { code: "CODE", workspaceId, userId, provider: "facebook" },
      f as unknown as typeof fetch,
    );
    expect(calls).toEqual([
      "https://graph.facebook.com/v21.0/oauth/access_token",
      "https://graph.facebook.com/v21.0/oauth/access_tokenfb_exchange_token",
      "https://graph.facebook.com/v21.0/me/accounts",
    ]);
    const [stored] = await testDb.select().from(instagramConnections);
    expect(stored.provider).toBe("facebook");
    expect(stored.igUserId).toBe("17841499999999999");
    expect(stored.username).toBe("elim");
    expect(stored.accessTokenEnc).not.toContain("FBLONG");
    expect(decrypt(stored.accessTokenEnc)).toBe("FBLONG");
    expect(stored.tokenExpiresAt.getTime()).toBeGreaterThan(Date.now() + 59 * 86400_000);
  });

  it("throws no_instagram_page when no Page has an Instagram account", async () => {
    const f = facebookFetch([], [{ id: "p1" }]);
    await expect(
      completeOAuth(
        { code: "CODE", workspaceId, userId, provider: "facebook" },
        f as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "no_instagram_page" });
    expect(await testDb.select().from(instagramConnections)).toHaveLength(0);
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
        headers: { cookie: "ig_oauth_state=s1; ig_oauth_provider=instagram" },
      }),
    );
    const [profile] = await testDb.select().from(profiles);
    expect(ok.headers.get("location")).toContain(`/perfis/${profile.id}?connected=1`);
    expect(await listConnections(workspaceId)).toHaveLength(1);
    const denied = await GET(
      new NextRequest(
        "http://localhost:3000/api/instagram/callback?error=access_denied&error_reason=user_denied",
      ),
    );
    expect(denied.headers.get("location")).toContain("error=denied");
  });
});

describe("provider resolution by connection_id", () => {
  it("uses the linked connection even when the username does not match", async () => {
    await completeOAuth({ code: "c", workspaceId, userId }, metaFetch() as unknown as typeof fetch);
    const [conn] = await listConnections(workspaceId);
    const calls: string[] = [];
    vi.stubGlobal("fetch", metaFetch(calls));
    const provider = await getInstagramProviderForProfile({
      workspaceId,
      igUsername: "cliente",
      connectionId: conn.id,
    });
    await provider.fetchProfile("samuel");
    expect(calls[0]).toBe("https://graph.instagram.com/v21.0/me");
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
    return (await listConnections(workspaceId))[0]!;
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
    expect(decrypt((await listConnections(workspaceId))[0]!.accessTokenEnc)).toBe("REFRESHED");
  });

  it("refreshes a facebook connection with fb_exchange_token", async () => {
    await completeOAuth(
      { code: "c", workspaceId, userId, provider: "facebook" },
      facebookFetch() as unknown as typeof fetch,
    );
    await testDb
      .update(instagramConnections)
      .set({ tokenExpiresAt: new Date(Date.now() + 3 * 86400_000) })
      .where(eq(instagramConnections.workspaceId, workspaceId));
    const c = (await listConnections(workspaceId))[0]!;
    const calls: string[] = [];
    const f = facebookFetch(calls);
    const out = await refreshIfNeeded(c, f as unknown as typeof fetch);
    expect(calls).toEqual(["https://graph.facebook.com/v21.0/oauth/access_tokenfb_exchange_token"]);
    expect(decrypt(out.accessTokenEnc)).toBe("FBREFRESHED");
    expect(out.provider).toBe("facebook");
    expect(out.tokenExpiresAt.getTime()).toBeGreaterThan(Date.now() + 59 * 86400_000);
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
  it("reads the own account through the Instagram user id on the Facebook host", async () => {
    await completeOAuth(
      { code: "c", workspaceId, userId, provider: "facebook" },
      facebookFetch() as unknown as typeof fetch,
    );
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL) => {
        seen.push(`${input.origin}${input.pathname}`);
        if (input.pathname.endsWith("/media")) return json({ data: [] });
        return json({ username: "elim" });
      }),
    );
    const provider = await getInstagramProviderForProfile({
      workspaceId,
      igUsername: "samuel",
      connectionId: null,
    });
    await provider.fetchProfile("elim");
    expect(seen).toEqual([
      "https://graph.facebook.com/v21.0/17841499999999999",
      "https://graph.facebook.com/v21.0/17841499999999999/media",
    ]);
  });

  it("uses the workspace connection over env, with the own-account path via /me", async () => {
    process.env.META_GRAPH_ACCESS_TOKEN = "ENV";
    process.env.META_IG_USER_ID = "999";
    await completeOAuth({ code: "c", workspaceId, userId }, metaFetch() as unknown as typeof fetch);
    expect(await isGraphConfiguredForWorkspace(workspaceId)).toBe(true);

    const calls: string[] = [];
    vi.stubGlobal("fetch", metaFetch(calls));
    const provider = await getInstagramProviderForProfile({
      workspaceId,
      igUsername: "samuel",
      connectionId: null,
    });
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
    const provider = await getInstagramProviderForProfile({
      workspaceId,
      igUsername: "samuel",
      connectionId: null,
    });
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
    await (
      await getInstagramProviderForProfile({
        workspaceId,
        igUsername: "samuel",
        connectionId: null,
      })
    ).fetchProfile("other");
    expect(seen[0]).toContain("https://graph.facebook.com/v21.0/999?");

    delete process.env.META_GRAPH_ACCESS_TOKEN;
    delete process.env.META_IG_USER_ID;
    expect(
      await (
        await getInstagramProviderForProfile({
          workspaceId,
          igUsername: "samuel",
          connectionId: null,
        })
      ).fetchProfile("x"),
    ).toEqual({
      code: "not_configured",
    });
    expect(await getInstagramProvider().fetchProfile("x")).toEqual({ code: "not_configured" });
  });
});
