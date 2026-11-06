import { z } from "zod";
import {
  businessDiscoverySchema,
  mapMediaPage,
  mapMeMediaPage,
  mapMeProfile,
  mapProfile,
  meMediaSchema,
  meProfileSchema,
} from "./mapping";
import type { IgError, IgMediaPage, IgProfile, InstagramProvider } from "./types";

const GRAPH_VERSION = "v21.0";

const graphErrorSchema = z.object({
  error: z.object({
    message: z.string().optional(),
    code: z.number().optional(),
    error_subcode: z.number().optional(),
    error_user_msg: z.string().optional(),
  }),
});

export function mapGraphError(status: number, body: unknown): IgError {
  if (status === 429) return { code: "rate_limited", retryAfterSec: 600 };
  const parsed = graphErrorSchema.safeParse(body);
  if (!parsed.success) return { code: "provider_down", message: `Graph API HTTP ${status}` };
  const { code, error_subcode, message = "" } = parsed.data.error;
  const msg = message.toLowerCase();
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return { code: "rate_limited", retryAfterSec: 600 };
  }
  if (error_subcode === 2207013 || msg.includes("business account") || msg.includes("2207013")) {
    return { code: "private_or_personal" };
  }
  if (
    code === 803 ||
    error_subcode === 2207001 ||
    msg.includes("not found") ||
    msg.includes("does not exist")
  ) {
    return { code: "not_found" };
  }
  return { code: "provider_down", message: message || `Graph API error ${code ?? status}` };
}

export function buildFields(username: string, cursor?: string): string {
  const after = cursor ? `.after(${cursor})` : "";
  const mediaFields =
    "id,media_type,media_url,thumbnail_url,permalink,caption,timestamp,children{media_type,media_url,thumbnail_url}";
  return (
    `business_discovery.username(${username}){username,name,biography,website,profile_picture_url,` +
    `followers_count,follows_count,media_count,media.limit(36)${after}{${mediaFields}}}`
  );
}

export const FACEBOOK_GRAPH_HOST = "https://graph.facebook.com";
export const INSTAGRAM_GRAPH_HOST = "https://graph.instagram.com";

export const ME_PROFILE_FIELDS =
  "username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count";
export const ME_MEDIA_FIELDS =
  "id,media_type,media_url,thumbnail_url,permalink,caption,timestamp,children{media_type,media_url,thumbnail_url}";

export type GraphProviderConfig = {
  host: string;
  igUserId: string;
  accessToken: string;
  /** Username of the connected account: requests for it use /me instead of business_discovery. */
  ownUsername?: string | null;
  fetchImpl?: typeof fetch;
};

export class GraphBusinessDiscoveryProvider implements InstagramProvider {
  private readonly cfg: GraphProviderConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(cfg: GraphProviderConfig) {
    this.cfg = cfg;
    this.fetchImpl = cfg.fetchImpl ?? ((...a) => fetch(...a));
  }

  private isOwn(username: string): boolean {
    return !!this.cfg.ownUsername && this.cfg.ownUsername.toLowerCase() === username.toLowerCase();
  }

  private async get(path: string, params: Record<string, string>): Promise<unknown | IgError> {
    const url = new URL(`${this.cfg.host}/${GRAPH_VERSION}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("access_token", this.cfg.accessToken);
    let res: Response;
    try {
      res = await this.fetchImpl(url, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    } catch (e) {
      return {
        code: "provider_down",
        message: e instanceof Error ? e.message : "network",
      } as IgError;
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) return mapGraphError(res.status, body);
    return body ?? ({ code: "provider_down", message: "Resposta vazia." } as IgError);
  }

  private async query(username: string, cursor?: string) {
    const body = await this.get(this.cfg.igUserId, { fields: buildFields(username, cursor) });
    if (isErr(body)) return body;
    const parsed = businessDiscoverySchema.safeParse(body);
    if (!parsed.success) {
      return { code: "provider_down", message: "Resposta inesperada da Graph API." } as IgError;
    }
    return parsed.data.business_discovery;
  }

  private async ownMedia(cursor?: string): Promise<IgMediaPage | IgError> {
    const params: Record<string, string> = { fields: ME_MEDIA_FIELDS, limit: "36" };
    if (cursor) params.after = cursor;
    const body = await this.get("me/media", params);
    if (isErr(body)) return body;
    const parsed = meMediaSchema.safeParse(body);
    if (!parsed.success) {
      return { code: "provider_down", message: "Resposta inesperada da Graph API." };
    }
    return mapMeMediaPage(parsed.data);
  }

  private async ownProfile(): Promise<IgProfile | IgError> {
    const body = await this.get("me", { fields: ME_PROFILE_FIELDS });
    if (isErr(body)) return body;
    const parsed = meProfileSchema.safeParse(body);
    if (!parsed.success) {
      return { code: "provider_down", message: "Resposta inesperada da Graph API." };
    }
    const page = await this.ownMedia();
    if ("code" in page) return page;
    return mapMeProfile(parsed.data, page);
  }

  async fetchProfile(username: string): Promise<IgProfile | IgError> {
    if (this.isOwn(username)) return this.ownProfile();
    const r = await this.query(username);
    return "code" in r ? r : mapProfile(r);
  }

  async fetchMedia(username: string, cursor?: string): Promise<IgMediaPage | IgError> {
    if (this.isOwn(username)) return this.ownMedia(cursor);
    const r = await this.query(username, cursor);
    return "code" in r ? r : mapMediaPage(r);
  }
}

function isErr(v: unknown): v is IgError {
  if (typeof v !== "object" || v === null || !("code" in v)) return false;
  return typeof (v as { code: unknown }).code === "string";
}
