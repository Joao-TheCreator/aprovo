import { z } from "zod";
import { businessDiscoverySchema, mapMediaPage, mapProfile } from "./mapping";
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

export class GraphBusinessDiscoveryProvider implements InstagramProvider {
  constructor(
    private readonly igUserId: string,
    private readonly accessToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async query(username: string, cursor?: string) {
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${this.igUserId}`);
    url.searchParams.set("fields", buildFields(username, cursor));
    url.searchParams.set("access_token", this.accessToken);
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
    const parsed = businessDiscoverySchema.safeParse(body);
    if (!parsed.success) {
      return { code: "provider_down", message: "Resposta inesperada da Graph API." } as IgError;
    }
    return parsed.data.business_discovery;
  }

  async fetchProfile(username: string): Promise<IgProfile | IgError> {
    const r = await this.query(username);
    return "code" in r ? r : mapProfile(r);
  }

  async fetchMedia(username: string, cursor?: string): Promise<IgMediaPage | IgError> {
    const r = await this.query(username, cursor);
    return "code" in r ? r : mapMediaPage(r);
  }
}
