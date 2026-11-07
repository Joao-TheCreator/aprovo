import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { instagramConnections } from "@/db/schema";
import { getInstagramProviderForProfile } from "@/lib/instagram";
import { classifyGraphError } from "@/lib/instagram/errors";
import { checkConnectionHealth, completeOAuth, getConnectionById } from "@/lib/instagram/oauth";
import { ACCOUNT_DISCONNECTED_MESSAGE } from "@/lib/profiles/contracts";
import { testDb } from "../setup";
import { seedWorkspace } from "../media/helpers";
import { GET as refreshRoute } from "@/app/api/instagram/refresh/route";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const ACCOUNT = { id: "17841400000000001", username: "conta_a" };

/** Instagram Login mock for the OAuth exchange. */
function oauthFetch() {
  return vi.fn(async (input: URL | string | Request) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input : input.url,
    );
    if (url.origin === "https://api.instagram.com") {
      return json({
        access_token: "SHORT",
        user_id: ACCOUNT.id,
        permissions: "instagram_business_basic",
      });
    }
    if (url.pathname === "/access_token") {
      return json({ access_token: "LONGTOKEN", expires_in: 5184000 });
    }
    return json({
      user_id: ACCOUNT.id,
      username: ACCOUNT.username,
      account_type: "MEDIA_CREATOR",
    });
  });
}

async function connect(workspaceId: string, userId: string) {
  return completeOAuth({ code: "c", workspaceId, userId }, oauthFetch() as unknown as typeof fetch);
}

const asFetch = (fn: unknown) => fn as typeof fetch;

beforeEach(() => {
  process.env.AUTH_SECRET ||= "test-secret";
  process.env.META_APP_ID = "app-id";
  process.env.META_APP_SECRET = "app-secret";
  process.env.CRON_SECRET = "cron";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("classifyGraphError", () => {
  const err = (code: number, message = "x") => ({ error: { code, message } });

  it.each([
    [400, err(190, "Error validating access token"), "token_expired", false],
    [403, err(10, "Application does not have permission"), "missing_scope", false],
    [400, err(200, "Requires something"), "missing_scope", false],
    [400, err(1, "(#1) Missing permission to do that"), "missing_scope", false],
    [400, err(4), "rate_limited", true],
    [400, err(17), "rate_limited", true],
    [400, err(32), "rate_limited", true],
    [400, err(613), "rate_limited", true],
    [429, null, "rate_limited", true],
    [500, null, "network", true],
    [503, { foo: "bar" }, "network", true],
    [0, null, "network", true],
    [400, err(100, "The account is not a business account"), "not_professional", false],
    [400, err(100, "Only creator or professional accounts"), "not_professional", false],
    [400, err(100, "Invalid parameter"), "unknown", true],
    [404, null, "unknown", true],
  ] as const)("HTTP %i %j -> %s (retryable=%s)", (status, body, code, retryable) => {
    const r = classifyGraphError(status, body);
    expect(r.code).toBe(code);
    expect(r.retryable).toBe(retryable);
    expect(r.message.length).toBeGreaterThan(0);
  });

  it("never includes access tokens in the message", () => {
    const r = classifyGraphError(400, {
      error: {
        code: 190,
        message:
          "Invalid token https://graph.instagram.com/me?access_token=IGQVJSECRET123&fields=id EAABsbCS1iHgBAOabcdefghijklmnop12345",
      },
    });
    expect(r.message).not.toContain("IGQVJSECRET123");
    expect(r.message).not.toContain("EAABsbCS1iHgBAOabcdefghijklmnop12345");
  });
});

describe("checkConnectionHealth", () => {
  it("ok -> active, refreshes username and account type", async () => {
    const s = await seedWorkspace();
    const conn = await connect(s.ws.id, s.user.id);
    await testDb
      .update(instagramConnections)
      .set({ status: "expired", statusDetail: "old" })
      .where(eq(instagramConnections.id, conn.id));
    const before = (await getConnectionById(conn.id, s.ws.id))!;
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (input: URL | string | Request) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input : input.url,
      );
      seen.push(`${url.origin}${url.pathname}?${url.searchParams.get("fields")}`);
      return json({ id: ACCOUNT.id, username: "novo_nome", account_type: "BUSINESS" });
    });
    const after = await checkConnectionHealth(before, asFetch(fetchImpl));
    expect(seen).toEqual(["https://graph.instagram.com/v21.0/me?id,username,account_type"]);
    expect(after.status).toBe("active");
    expect(after.statusDetail).toBeNull();
    expect(after.statusCheckedAt).not.toBeNull();
    expect(after.username).toBe("novo_nome");
    expect(after.accountType).toBe("BUSINESS");
  });

  it("code 190 -> expired", async () => {
    const s = await seedWorkspace();
    const conn = await connect(s.ws.id, s.user.id);
    const after = await checkConnectionHealth(
      conn,
      asFetch(vi.fn(async () => json({ error: { code: 190, message: "expired" } }, 400))),
    );
    expect(after.status).toBe("expired");
    expect(after.statusDetail).toBeTruthy();
    expect(after.statusDetail).not.toContain("LONGTOKEN");
  });

  it("code 10 -> missing_scope", async () => {
    const s = await seedWorkspace();
    const conn = await connect(s.ws.id, s.user.id);
    const after = await checkConnectionHealth(
      conn,
      asFetch(vi.fn(async () => json({ error: { code: 10, message: "no permission" } }, 403))),
    );
    expect(after.status).toBe("missing_scope");
  });

  it("HTTP 500 keeps the status but records the check", async () => {
    const s = await seedWorkspace();
    const conn = await connect(s.ws.id, s.user.id);
    await testDb
      .update(instagramConnections)
      .set({ statusCheckedAt: null })
      .where(eq(instagramConnections.id, conn.id));
    const fresh = (await getConnectionById(conn.id, s.ws.id))!;
    expect(fresh.statusCheckedAt).toBeNull();
    const after = await checkConnectionHealth(fresh, asFetch(vi.fn(async () => json({}, 500))));
    expect(after.status).toBe("active");
    expect(after.statusCheckedAt).not.toBeNull();
    expect(after.statusDetail).toBeTruthy();
  });

  it("a network failure keeps the status", async () => {
    const s = await seedWorkspace();
    const conn = await connect(s.ws.id, s.user.id);
    const after = await checkConnectionHealth(
      conn,
      asFetch(
        vi.fn(async () => {
          throw new TypeError("fetch failed");
        }),
      ),
    );
    expect(after.status).toBe("active");
  });

  it("expired by date -> expired without calling Meta", async () => {
    const s = await seedWorkspace();
    const conn = await connect(s.ws.id, s.user.id);
    await testDb
      .update(instagramConnections)
      .set({ tokenExpiresAt: new Date(Date.now() - 86400_000) })
      .where(eq(instagramConnections.id, conn.id));
    const stale = (await getConnectionById(conn.id, s.ws.id))!;
    const fetchImpl = vi.fn();
    const after = await checkConnectionHealth(stale, asFetch(fetchImpl));
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(after.status).toBe("expired");
  });

  it("reconnecting (completeOAuth) after expiry makes the connection active again", async () => {
    const s = await seedWorkspace();
    const conn = await connect(s.ws.id, s.user.id);
    await testDb
      .update(instagramConnections)
      .set({ status: "expired", statusDetail: "Token expirado" })
      .where(eq(instagramConnections.id, conn.id));
    const again = await connect(s.ws.id, s.user.id);
    expect(again.id).toBe(conn.id);
    expect(again.status).toBe("active");
    expect(again.statusDetail).toBeNull();
  });
});

describe("provider gating", () => {
  it("does not call Meta for a linked connection that is not active", async () => {
    const s = await seedWorkspace();
    const conn = await connect(s.ws.id, s.user.id);
    await testDb
      .update(instagramConnections)
      .set({ status: "expired" })
      .where(eq(instagramConnections.id, conn.id));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const provider = await getInstagramProviderForProfile({
      workspaceId: s.ws.id,
      igUsername: ACCOUNT.username,
      connectionId: conn.id,
    });
    expect(await provider.fetchProfile(ACCOUNT.username)).toEqual({
      code: "provider_down",
      message: ACCOUNT_DISCONNECTED_MESSAGE,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("refresh route health summary", () => {
  it("returns the new shape and counts unhealthy connections", async () => {
    const s = await seedWorkspace();
    const conn = await connect(s.ws.id, s.user.id);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ error: { code: 190, message: "expired" } }, 400)),
    );
    const res = await refreshRoute(
      new NextRequest("http://localhost:3000/api/instagram/refresh", {
        headers: { "x-cron-secret": "cron" },
      }),
    );
    expect(await res.json()).toEqual({
      due: 0,
      refreshed: 0,
      failed: 0,
      checked: 1,
      unhealthy: 1,
    });
    expect((await getConnectionById(conn.id, s.ws.id))!.status).toBe("expired");
  });
});
