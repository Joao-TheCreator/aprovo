import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { instagramConnections } from "@/db/schema";
import { decrypt } from "@/lib/crypto/secretbox";
import { completeOAuth, getConnectionById, listConnections } from "@/lib/instagram/oauth";
import { testDb } from "../setup";
import { makeRequireMock, seedWorkspace } from "../media/helpers";

const mocks = vi.hoisted(() => ({ user: { id: "" } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));
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
import { GET as refreshRoute } from "@/app/api/instagram/refresh/route";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Facebook Login mock exposing a single Instagram account; `longToken` is the exchanged token. */
function facebookFetch(account: { id: string; username: string }, longToken = "FBLONG") {
  return vi.fn(async (input: URL | string | Request) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input : input.url,
    );
    if (url.pathname === "/v21.0/oauth/access_token") {
      if (url.searchParams.get("grant_type") === "fb_exchange_token") {
        return json({ access_token: longToken, expires_in: 5184000 });
      }
      return json({ access_token: "FBSHORT", token_type: "bearer" });
    }
    if (url.pathname === "/v21.0/me/accounts") {
      return json({ data: [{ id: "p1", instagram_business_account: account }] });
    }
    return json({ error: { message: "unexpected " + url.pathname } }, 400);
  });
}

const A = { id: "17841400000000001", username: "conta_a" };
const B = { id: "17841400000000002", username: "conta_b" };

async function connect(
  workspaceId: string,
  userId: string,
  account: { id: string; username: string },
  token?: string,
) {
  return completeOAuth(
    { code: "c", workspaceId, userId, provider: "facebook" },
    facebookFetch(account, token) as unknown as typeof fetch,
  );
}

beforeEach(() => {
  process.env.AUTH_SECRET ||= "test-secret";
  process.env.META_FB_APP_ID = "fb-app-id";
  process.env.META_FB_APP_SECRET = "fb-app-secret";
  process.env.CRON_SECRET = "cron";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("multiple connections per workspace", () => {
  it("connects two accounts, and reconnecting one updates its row instead of duplicating", async () => {
    const s = await seedWorkspace();
    const first = await connect(s.ws.id, s.user.id, A, "TOKEN1");
    await connect(s.ws.id, s.user.id, B);
    expect(await listConnections(s.ws.id)).toHaveLength(2);

    const again = await connect(s.ws.id, s.user.id, A, "TOKEN2");
    expect(again.id).toBe(first.id);
    const rows = await listConnections(s.ws.id);
    expect(rows).toHaveLength(2);
    expect(decrypt(rows.find((r) => r.igUserId === A.id)!.accessTokenEnc)).toBe("TOKEN2");
  });

  it("lists and fetches only connections of the given workspace", async () => {
    const s1 = await seedWorkspace("a@x.co");
    const s2 = await seedWorkspace("b@x.co");
    const c1 = await connect(s1.ws.id, s1.user.id, A);
    await connect(s2.ws.id, s2.user.id, B);
    expect((await listConnections(s1.ws.id)).map((c) => c.id)).toEqual([c1.id]);
    expect(await getConnectionById(c1.id, s1.ws.id)).not.toBeNull();
    expect(await getConnectionById(c1.id, s2.ws.id)).toBeNull();
  });

  it("the same Instagram account can be connected in two workspaces", async () => {
    const s1 = await seedWorkspace("a@x.co");
    const s2 = await seedWorkspace("b@x.co");
    await connect(s1.ws.id, s1.user.id, A);
    await connect(s2.ws.id, s2.user.id, A);
    expect(await testDb.select().from(instagramConnections)).toHaveLength(2);
  });
});

describe("disconnectInstagram", () => {
  it("removes only the chosen connection of the own workspace", async () => {
    const s = await seedWorkspace();
    mocks.user.id = s.user.id;
    const a = await connect(s.ws.id, s.user.id, A);
    const b = await connect(s.ws.id, s.user.id, B);
    await expect(disconnectInstagram(a.id)).rejects.toThrow(/NEXT_REDIRECT/);
    const left = await listConnections(s.ws.id);
    expect(left.map((c) => c.id)).toEqual([b.id]);
  });

  it("is not found for a connection of another workspace", async () => {
    const mine = await seedWorkspace("a@x.co");
    const other = await seedWorkspace("b@x.co");
    mocks.user.id = mine.user.id;
    const theirs = await connect(other.ws.id, other.user.id, B);
    await expect(disconnectInstagram(theirs.id)).rejects.toThrow(/NEXT_NOT_FOUND/);
    expect(await getConnectionById(theirs.id, other.ws.id)).not.toBeNull();
  });

  it("rejects ids that are not uuids", async () => {
    const s = await seedWorkspace();
    mocks.user.id = s.user.id;
    await expect(disconnectInstagram("nope")).rejects.toThrow(/NEXT_NOT_FOUND/);
  });
});

describe("refresh route", () => {
  const call = (secret = "cron") =>
    refreshRoute(
      new NextRequest("http://localhost:3000/api/instagram/refresh", {
        headers: { "x-cron-secret": secret },
      }),
    );

  it("renews every due connection and keeps going after a failure", async () => {
    const s = await seedWorkspace();
    await connect(s.ws.id, s.user.id, A);
    await connect(s.ws.id, s.user.id, B);
    await testDb
      .update(instagramConnections)
      .set({ tokenExpiresAt: new Date(Date.now() + 2 * 86400_000) })
      .where(eq(instagramConnections.workspaceId, s.ws.id));
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    // The first refresh call fails, the second succeeds: both connections must be attempted.
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ++n === 1
          ? json({ error: { message: "boom" } }, 400)
          : json({ access_token: "FBREFRESHED", expires_in: 5184000 }),
      ),
    );
    const res = await call();
    expect(await res.json()).toEqual({ due: 2, refreshed: 1, failed: 1 });
    expect(n).toBe(2);

    n = 1; // all succeed now
    const res2 = await call();
    expect(await res2.json()).toEqual({ due: 1, refreshed: 1, failed: 0 });
    const rows = await listConnections(s.ws.id);
    expect(rows.every((r) => decrypt(r.accessTokenEnc) === "FBREFRESHED")).toBe(true);
  });

  it("rejects calls without the cron secret", async () => {
    expect((await call("wrong")).status).toBe(401);
  });
});
