import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { instagramConnections } from "@/db/schema";
import { encrypt } from "@/lib/crypto/secretbox";
import { parseSignedRequest } from "@/lib/instagram/signed-request";
import { testDb } from "../setup";
import { seedWorkspace } from "../media/helpers";
import { POST as deauthorize } from "@/app/api/instagram/deauthorize/route";

const SECRET = "test-app-secret";

function sign(payload: Record<string, unknown>, secret = SECRET): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${sig}.${encoded}`;
}

describe("parseSignedRequest", () => {
  const payload = { algorithm: "HMAC-SHA256", user_id: "17841400000000001", issued_at: 1700000000 };

  it("parses a valid signed request", () => {
    expect(parseSignedRequest(sign(payload), SECRET)).toEqual({
      userId: "17841400000000001",
      issuedAt: 1700000000,
    });
  });

  it("accepts a numeric user_id as a string", () => {
    expect(parseSignedRequest(sign({ ...payload, user_id: 123 }), SECRET)?.userId).toBe("123");
  });

  it("rejects a wrong secret", () => {
    expect(parseSignedRequest(sign(payload, "other"), SECRET)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const [sig] = sign(payload).split(".");
    const forged = Buffer.from(JSON.stringify({ ...payload, user_id: "999" })).toString(
      "base64url",
    );
    expect(parseSignedRequest(`${sig}.${forged}`, SECRET)).toBeNull();
  });

  it("rejects another algorithm even if correctly signed", () => {
    expect(parseSignedRequest(sign({ ...payload, algorithm: "HMAC-SHA1" }), SECRET)).toBeNull();
  });

  it.each(["", "abc", "a.b.c", ".", "x."])("rejects malformed input %j", (raw) => {
    expect(parseSignedRequest(raw, SECRET)).toBeNull();
  });

  it("rejects everything without a secret", () => {
    expect(parseSignedRequest(sign(payload, ""), "")).toBeNull();
  });
});

describe("deauthorize route", () => {
  beforeEach(() => {
    process.env.META_APP_SECRET = SECRET;
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const request = (fields: Record<string, string>) =>
    new NextRequest("http://localhost:3000/api/instagram/deauthorize", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    });

  async function seedConnection(igUserId: string, email: string) {
    const s = await seedWorkspace(email);
    const [row] = await testDb
      .insert(instagramConnections)
      .values({
        workspaceId: s.ws.id,
        igUserId,
        username: "conta",
        accessTokenEnc: encrypt("TOKEN"),
        tokenExpiresAt: new Date(Date.now() + 86400_000),
      })
      .returning();
    return row;
  }

  const byId = async (id: string) =>
    (await testDb.select().from(instagramConnections).where(eq(instagramConnections.id, id)))[0];

  it("marks every connection of that Instagram user as revoked", async () => {
    const mine = await seedConnection("111", "a@x.co");
    const other = await seedConnection("222", "b@x.co");
    const res = await deauthorize(
      request({ signed_request: sign({ algorithm: "HMAC-SHA256", user_id: "111", issued_at: 1 }) }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const a = await byId(mine.id);
    expect(a.status).toBe("revoked");
    expect(a.statusDetail).toBe("Desautorizado pelo usuário");
    expect((await byId(other.id)).status).toBe("active");
  });

  it("returns 400 on a bad signature and changes nothing", async () => {
    const conn = await seedConnection("111", "a@x.co");
    const res = await deauthorize(
      request({ signed_request: sign({ algorithm: "HMAC-SHA256", user_id: "111" }, "wrong") }),
    );
    expect(res.status).toBe(400);
    expect((await byId(conn.id)).status).toBe("active");
  });

  it("returns 400 when signed_request is missing", async () => {
    expect((await deauthorize(request({}))).status).toBe(400);
  });
});
