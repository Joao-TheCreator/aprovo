// Server-only module: never import from client components.
/**
 * Meta OAuth: Facebook Login (current) and Instagram Login (legacy). All Meta URLs live here so they are easy to adjust.
 * [Meta-side assumption] endpoints/versions follow the current docs; confirm in the Meta dashboard.
 */
import { randomBytes } from "node:crypto";
import { and, asc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  instagramConnections,
  type ConnectionProvider,
  type InstagramConnection,
} from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto/secretbox";

export const IG_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
export const IG_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
export const IG_GRAPH_HOST = "https://graph.instagram.com";
export const IG_LONG_LIVED_URL = `${IG_GRAPH_HOST}/access_token`;
export const IG_REFRESH_URL = `${IG_GRAPH_HOST}/refresh_access_token`;
export const IG_ME_URL = `${IG_GRAPH_HOST}/v21.0/me`;
export const SCOPES = ["instagram_business_basic"] as const;
export const FB_AUTHORIZE_URL = "https://www.facebook.com/v21.0/dialog/oauth";
export const FB_GRAPH_HOST = "https://graph.facebook.com";
export const FB_TOKEN_URL = `${FB_GRAPH_HOST}/v21.0/oauth/access_token`;
export const FB_SCOPES = ["instagram_basic", "pages_show_list", "pages_read_engagement"] as const;
const FB_DEFAULT_EXPIRES_IN_SEC = 60 * 24 * 60 * 60;
export const STATE_COOKIE = "ig_oauth_state";
export const PROVIDER_COOKIE = "ig_oauth_provider";
export const STATE_TTL_SEC = 600;
export const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type OAuthErrorCode =
  "not_configured" | "denied" | "exchange_failed" | "state_mismatch" | "no_instagram_page";

export function isFacebookOAuthConfigured(): boolean {
  return !!process.env.META_FB_APP_ID && !!process.env.META_FB_APP_SECRET;
}

function isInstagramLoginConfigured(): boolean {
  return !!process.env.META_APP_ID && !!process.env.META_APP_SECRET;
}

export function isOAuthConfigured(): boolean {
  return isFacebookOAuthConfigured() || isInstagramLoginConfigured();
}

/** Provider used for new connections (see META_OAUTH_PROVIDER). */
export function activeOAuthProvider(): ConnectionProvider | null {
  // ADR-009: Instagram Login is the default; Facebook Login only when explicitly selected.
  const preferred = process.env.META_OAUTH_PROVIDER === "facebook" ? "facebook" : "instagram";
  if (preferred === "facebook" && isFacebookOAuthConfigured()) return "facebook";
  if (isInstagramLoginConfigured()) return "instagram";
  if (isFacebookOAuthConfigured()) return "facebook";
  return null;
}

export function getRedirectUri(): string {
  const explicit = process.env.META_REDIRECT_URI;
  if (explicit) return explicit;
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/api/instagram/callback`;
}

export function getFacebookRedirectUri(): string {
  return process.env.META_FB_REDIRECT_URI || getRedirectUri();
}

export function generateState(): string {
  return randomBytes(32).toString("base64url");
}

export function buildAuthorizeUrl(state: string): string {
  const url = new URL(IG_AUTHORIZE_URL);
  url.searchParams.set("client_id", process.env.META_APP_ID ?? "");
  url.searchParams.set("redirect_uri", getRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

export function buildFacebookAuthorizeUrl(state: string): string {
  const url = new URL(FB_AUTHORIZE_URL);
  url.searchParams.set("client_id", process.env.META_FB_APP_ID ?? "");
  url.searchParams.set("redirect_uri", getFacebookRedirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  const configId = process.env.META_FB_CONFIG_ID;
  if (configId) {
    url.searchParams.set("config_id", configId);
    url.searchParams.set("override_default_response_type", "true");
  } else {
    url.searchParams.set("scope", FB_SCOPES.join(","));
  }
  return url.toString();
}

export function statesMatch(cookie: string | undefined, param: string | null): boolean {
  if (!cookie || !param || cookie.length !== param.length) return false;
  let diff = 0;
  for (let i = 0; i < cookie.length; i++) diff |= cookie.charCodeAt(i) ^ param.charCodeAt(i);
  return diff === 0;
}

// ---- Meta response schemas -------------------------------------------------

const shortTokenEntry = z.object({
  access_token: z.string(),
  user_id: z.union([z.string(), z.number()]).optional(),
  permissions: z.union([z.string(), z.array(z.string())]).optional(),
});
// Docs have shown both a flat object and a `{ data: [ ... ] }` wrapper.
const shortTokenSchema = z
  .union([shortTokenEntry, z.object({ data: z.array(shortTokenEntry).min(1) })])
  .transform((v) => ("data" in v ? v.data[0] : v));

const longTokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });

const meSchema = z.object({
  user_id: z.union([z.string(), z.number()]).optional(),
  id: z.union([z.string(), z.number()]).optional(),
  username: z.string(),
  account_type: z.string().optional(),
  profile_picture_url: z.string().optional(),
});

const fbTokenSchema = z.object({
  access_token: z.string(),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
});

const fbAccountsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      instagram_business_account: z
        .object({
          id: z.string(),
          username: z.string().optional(),
          profile_picture_url: z.string().optional(),
        })
        .optional(),
    }),
  ),
});

export class OAuthError extends Error {
  constructor(
    public readonly code: OAuthErrorCode,
    detail: string,
  ) {
    super(detail);
  }
}

async function readJson(res: Response, step: string): Promise<unknown> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* handled below */
  }
  if (!res.ok) {
    // Meta error bodies never echo our tokens; still only log status + message.
    const msg =
      typeof body === "object" && body !== null
        ? JSON.stringify(
            (body as Record<string, unknown>).error ??
              (body as Record<string, unknown>).error_message ??
              "",
          ).slice(0, 300)
        : "";
    throw new OAuthError("exchange_failed", `${step} HTTP ${res.status} ${msg}`);
  }
  return body;
}

function parse<T>(schema: z.ZodType<T>, body: unknown, step: string): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new OAuthError("exchange_failed", `${step}: unexpected response shape`);
  return r.data;
}

// ---- Flow --------------------------------------------------------------------

export async function exchangeCode(code: string, fetchImpl: typeof fetch = fetch) {
  const form = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    client_secret: process.env.META_APP_SECRET ?? "",
    grant_type: "authorization_code",
    redirect_uri: getRedirectUri(),
    code,
  });
  const short = parse(
    shortTokenSchema,
    await readJson(await fetchImpl(IG_TOKEN_URL, { method: "POST", body: form }), "code exchange"),
    "code exchange",
  );

  const longUrl = new URL(IG_LONG_LIVED_URL);
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", process.env.META_APP_SECRET ?? "");
  longUrl.searchParams.set("access_token", short.access_token);
  const long = parse(
    longTokenSchema,
    await readJson(await fetchImpl(longUrl), "long-lived exchange"),
    "long-lived exchange",
  );

  const meUrl = new URL(IG_ME_URL);
  meUrl.searchParams.set("fields", "user_id,username,account_type,profile_picture_url");
  meUrl.searchParams.set("access_token", long.access_token);
  const me = parse(meSchema, await readJson(await fetchImpl(meUrl), "me"), "me");

  const permissions =
    typeof short.permissions === "string"
      ? short.permissions.split(",").map((s) => s.trim())
      : (short.permissions ?? [...SCOPES]);
  // Prefer the string ids from /me: numeric JSON ids can lose precision.
  const igUserId = String(me.user_id ?? me.id ?? short.user_id ?? "");
  if (!igUserId) throw new OAuthError("exchange_failed", "me: missing user id");

  return {
    accessToken: long.access_token,
    expiresAt: new Date(Date.now() + long.expires_in * 1000),
    igUserId,
    username: me.username,
    accountType: me.account_type ?? null,
    profilePictureUrl: me.profile_picture_url ?? null,
    scopes: permissions,
  };
}

/** fb_exchange_token grant: short -> long-lived, and also the refresh of a long-lived token. */
async function fbExchangeToken(token: string, fetchImpl: typeof fetch, step: string) {
  const url = new URL(FB_TOKEN_URL);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", process.env.META_FB_APP_ID ?? "");
  url.searchParams.set("client_secret", process.env.META_FB_APP_SECRET ?? "");
  url.searchParams.set("fb_exchange_token", token);
  const r = parse(fbTokenSchema, await readJson(await fetchImpl(url), step), step);
  return {
    accessToken: r.access_token,
    expiresAt: new Date(Date.now() + (r.expires_in ?? FB_DEFAULT_EXPIRES_IN_SEC) * 1000),
  };
}

/** Facebook Login: code -> short token -> long-lived user token -> Page with an Instagram account. */
export async function exchangeFacebookCode(code: string, fetchImpl: typeof fetch = fetch) {
  const shortUrl = new URL(FB_TOKEN_URL);
  shortUrl.searchParams.set("client_id", process.env.META_FB_APP_ID ?? "");
  shortUrl.searchParams.set("client_secret", process.env.META_FB_APP_SECRET ?? "");
  shortUrl.searchParams.set("redirect_uri", getFacebookRedirectUri());
  shortUrl.searchParams.set("code", code);
  const short = parse(
    fbTokenSchema,
    await readJson(await fetchImpl(shortUrl), "code exchange"),
    "code exchange",
  );

  const long = await fbExchangeToken(short.access_token, fetchImpl, "long-lived exchange");

  const accountsUrl = new URL(`${FB_GRAPH_HOST}/v21.0/me/accounts`);
  accountsUrl.searchParams.set(
    "fields",
    "id,name,instagram_business_account{id,username,profile_picture_url}",
  );
  accountsUrl.searchParams.set("limit", "100");
  accountsUrl.searchParams.set("access_token", long.accessToken);
  const accounts = parse(
    fbAccountsSchema,
    await readJson(await fetchImpl(accountsUrl), "me/accounts"),
    "me/accounts",
  );
  const ig = accounts.data.find((p) => p.instagram_business_account)?.instagram_business_account;
  if (!ig) {
    // Diagnostic only: page names and whether each has an Instagram account. No tokens.
    console.warn(
      "[instagram] no page with an Instagram account; pages granted:",
      JSON.stringify(
        accounts.data.map((p) => ({ name: p.name ?? p.id, ig: !!p.instagram_business_account })),
      ).slice(0, 500),
    );
    throw new OAuthError("no_instagram_page", "no page with an Instagram professional account");
  }

  return {
    accessToken: long.accessToken,
    expiresAt: long.expiresAt,
    igUserId: ig.id,
    username: ig.username ?? ig.id,
    accountType: null as string | null,
    profilePictureUrl: ig.profile_picture_url ?? null,
    scopes: [...FB_SCOPES] as string[],
  };
}

/** Runs the full provider exchange and upserts the connection for (workspace, Instagram account). */
export async function completeOAuth(
  input: { code: string; workspaceId: string; userId: string; provider?: ConnectionProvider },
  fetchImpl: typeof fetch = fetch,
): Promise<InstagramConnection> {
  const provider = input.provider ?? "instagram";
  const r =
    provider === "facebook"
      ? await exchangeFacebookCode(input.code, fetchImpl)
      : await exchangeCode(input.code, fetchImpl);
  const values = {
    provider,
    workspaceId: input.workspaceId,
    igUserId: r.igUserId,
    username: r.username,
    accountType: r.accountType,
    profilePictureUrl: r.profilePictureUrl,
    accessTokenEnc: encrypt(r.accessToken),
    tokenExpiresAt: r.expiresAt,
    scopes: r.scopes,
    connectedBy: input.userId,
    lastRefreshedAt: new Date(),
  };
  const [row] = await db
    .insert(instagramConnections)
    .values(values)
    .onConflictDoUpdate({
      target: [instagramConnections.workspaceId, instagramConnections.igUserId],
      set: { ...values, updatedAt: new Date() },
    })
    .returning();
  return row;
}

/** All Instagram connections of a workspace, oldest first. */
export async function listConnections(workspaceId: string): Promise<InstagramConnection[]> {
  return db
    .select()
    .from(instagramConnections)
    .where(eq(instagramConnections.workspaceId, workspaceId))
    .orderBy(asc(instagramConnections.createdAt), asc(instagramConnections.id));
}

/** One connection, only if it belongs to the given workspace. */
export async function getConnectionById(
  id: string,
  workspaceId: string,
): Promise<InstagramConnection | null> {
  const [row] = await db
    .select()
    .from(instagramConnections)
    .where(and(eq(instagramConnections.id, id), eq(instagramConnections.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

export function decryptToken(connection: Pick<InstagramConnection, "accessTokenEnc">): string {
  return decrypt(connection.accessTokenEnc);
}

/**
 * Refreshes the long-lived token when it expires within 7 days. Never throws: on failure the
 * original connection is returned (the token may still be valid for some days).
 */
export async function refreshIfNeeded(
  connection: InstagramConnection,
  fetchImpl: typeof fetch = fetch,
): Promise<InstagramConnection> {
  if (connection.tokenExpiresAt.getTime() >= Date.now() + REFRESH_WINDOW_MS) return connection;
  try {
    let token: string;
    let expiresAt: Date;
    if (connection.provider === "facebook") {
      const r = await fbExchangeToken(decryptToken(connection), fetchImpl, "token refresh");
      token = r.accessToken;
      expiresAt = r.expiresAt;
    } else {
      const url = new URL(IG_REFRESH_URL);
      url.searchParams.set("grant_type", "ig_refresh_token");
      url.searchParams.set("access_token", decryptToken(connection));
      const r = parse(
        longTokenSchema,
        await readJson(await fetchImpl(url), "token refresh"),
        "token refresh",
      );
      token = r.access_token;
      expiresAt = new Date(Date.now() + r.expires_in * 1000);
    }
    const [row] = await db
      .update(instagramConnections)
      .set({
        accessTokenEnc: encrypt(token),
        tokenExpiresAt: expiresAt,
        lastRefreshedAt: new Date(),
      })
      .where(eq(instagramConnections.id, connection.id))
      .returning();
    return row ?? connection;
  } catch (e) {
    console.error("[instagram] token refresh failed:", e instanceof Error ? e.message : e);
    return connection;
  }
}

/**
 * Refreshes every connection expiring within the window (weekly cron). One failing connection
 * never stops the others; outcomes are logged per connection id (no tokens).
 */
export async function refreshExpiringConnections(fetchImpl: typeof fetch = fetch) {
  const due = await db
    .select()
    .from(instagramConnections)
    .where(lt(instagramConnections.tokenExpiresAt, new Date(Date.now() + REFRESH_WINDOW_MS)));
  let refreshed = 0;
  let failed = 0;
  for (const c of due) {
    try {
      const next = await refreshIfNeeded(c, fetchImpl);
      if (next.tokenExpiresAt.getTime() !== c.tokenExpiresAt.getTime()) {
        refreshed++;
        console.info(`[instagram] refresh ok connection=${c.id}`);
      } else {
        failed++;
        console.warn(`[instagram] refresh not applied connection=${c.id}`);
      }
    } catch (e) {
      failed++;
      console.error(
        `[instagram] refresh error connection=${c.id}:`,
        e instanceof Error ? e.name : "unknown",
      );
    }
  }
  return { due: due.length, refreshed, failed };
}
