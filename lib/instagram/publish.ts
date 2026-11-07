/**
 * Client for the Instagram Content Publishing API (docs/12 §4.3, §4.4).
 * Every method returns a discriminated result and never throws for Meta/network failures.
 * Nothing here logs tokens or media URLs.
 */
import type { InstagramConnection } from "@/db/schema";
import { decryptToken, IG_GRAPH_HOST } from "./oauth";
import { classifyPublishError, type PublishError } from "./publish-errors";
import { sharedFakePublisher } from "./publish-fake";

export type { PublishError, PublishErrorCode } from "./publish-errors";

/** Same version as lib/instagram/graph.ts (not exported there). */
export const PUBLISH_API_VERSION = "v21.0";
const TIMEOUT_MS = 20_000;

export type PublishResult<T> = { ok: true; data: T } | { ok: false; error: PublishError };

export type ContainerStatusCode = "IN_PROGRESS" | "FINISHED" | "ERROR" | "EXPIRED" | "PUBLISHED";
export type ContainerStatus = { status: ContainerStatusCode; detail: string | null };

export interface InstagramPublisher {
  createImageContainer(input: {
    imageUrl: string;
    caption?: string;
    isCarouselItem?: boolean;
  }): Promise<PublishResult<{ id: string }>>;
  createVideoContainer(input: {
    videoUrl: string;
    caption?: string;
    coverUrl?: string;
    shareToFeed?: boolean;
    isCarouselItem?: boolean;
  }): Promise<PublishResult<{ id: string }>>;
  createCarouselContainer(input: {
    children: string[];
    caption?: string;
  }): Promise<PublishResult<{ id: string }>>;
  getContainerStatus(containerId: string): Promise<PublishResult<ContainerStatus>>;
  publish(creationId: string): Promise<PublishResult<{ igMediaId: string }>>;
  getPublishingLimit(): Promise<PublishResult<{ quotaUsage: number; quotaTotal: number }>>;
  getMediaPermalink(igMediaId: string): Promise<PublishResult<string | null>>;
}

export type GraphPublisherConfig = {
  igUserId: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
  host?: string;
  version?: string;
};

const STATUS_CODES: readonly ContainerStatusCode[] = [
  "IN_PROGRESS",
  "FINISHED",
  "ERROR",
  "EXPIRED",
  "PUBLISHED",
];

function fail<T>(error: PublishError): PublishResult<T> {
  return { ok: false, error };
}

function networkError(): PublishError {
  return {
    code: "network",
    retryable: true,
    message: "Não foi possível falar com o Instagram (rede ou tempo esgotado).",
    raw: null,
    httpStatus: 0,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export class GraphPublisher implements InstagramPublisher {
  private readonly igUserId: string;
  private readonly accessToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly base: string;

  constructor(config: GraphPublisherConfig) {
    if (!config.igUserId) throw new Error("GraphPublisher requires igUserId.");
    if (!config.accessToken) throw new Error("GraphPublisher requires accessToken.");
    this.igUserId = config.igUserId;
    this.accessToken = config.accessToken;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.base = `${config.host ?? IG_GRAPH_HOST}/${config.version ?? PUBLISH_API_VERSION}`;
  }

  /**
   * One Graph call. POST sends form-urlencoded with the token in the BODY (keeps it out of URLs
   * and proxy logs) [confirmar: Meta accepts access_token in the body; otherwise move it to the
   * query string]. GET sends the token as a query param.
   */
  private async call(
    method: "GET" | "POST",
    path: string,
    params: Record<string, string>,
  ): Promise<PublishResult<Record<string, unknown>>> {
    const url = new URL(`${this.base}/${path}`);
    const init: RequestInit = { method, signal: AbortSignal.timeout(TIMEOUT_MS) };
    if (method === "GET") {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      url.searchParams.set("access_token", this.accessToken);
    } else {
      const body = new URLSearchParams(params);
      body.set("access_token", this.accessToken);
      init.body = body;
      init.headers = { "content-type": "application/x-www-form-urlencoded" };
    }

    let res: Response;
    try {
      res = await this.fetchImpl(url, init);
    } catch {
      // Never forward the thrown error: its message may contain the URL.
      return fail(networkError());
    }

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok || asRecord(body).error !== undefined) {
      return fail(classifyPublishError(res.status, body));
    }
    return { ok: true, data: asRecord(body) };
  }

  private async createContainer(
    params: Record<string, string>,
  ): Promise<PublishResult<{ id: string }>> {
    const r = await this.call("POST", `${this.igUserId}/media`, params);
    if (!r.ok) return r;
    const id = r.data.id;
    if (typeof id !== "string" || !id) return fail(classifyPublishError(200, { malformed: true }));
    return { ok: true, data: { id } };
  }

  createImageContainer(input: { imageUrl: string; caption?: string; isCarouselItem?: boolean }) {
    const params: Record<string, string> = { image_url: input.imageUrl };
    if (input.caption !== undefined) params.caption = input.caption;
    if (input.isCarouselItem) params.is_carousel_item = "true";
    return this.createContainer(params);
  }

  createVideoContainer(input: {
    videoUrl: string;
    caption?: string;
    coverUrl?: string;
    shareToFeed?: boolean;
    isCarouselItem?: boolean;
  }) {
    // [confirmar] carousel video items use media_type=VIDEO + is_carousel_item=true.
    const params: Record<string, string> = {
      media_type: input.isCarouselItem ? "VIDEO" : "REELS",
      video_url: input.videoUrl,
    };
    if (input.isCarouselItem) {
      params.is_carousel_item = "true";
    } else {
      if (input.caption !== undefined) params.caption = input.caption;
      params.share_to_feed = String(input.shareToFeed ?? true);
      if (input.coverUrl) params.cover_url = input.coverUrl;
    }
    return this.createContainer(params);
  }

  createCarouselContainer(input: { children: string[]; caption?: string }) {
    if (input.children.length < 2 || input.children.length > 10) {
      throw new Error("A carousel needs between 2 and 10 children.");
    }
    const params: Record<string, string> = {
      media_type: "CAROUSEL",
      children: input.children.join(","),
    };
    if (input.caption !== undefined) params.caption = input.caption;
    return this.createContainer(params);
  }

  async getContainerStatus(containerId: string): Promise<PublishResult<ContainerStatus>> {
    const r = await this.call("GET", containerId, { fields: "status_code,status" });
    if (!r.ok) return r;
    const code = r.data.status_code;
    const status = STATUS_CODES.find((s) => s === code);
    if (!status) return fail(classifyPublishError(200, { unexpectedStatusCode: String(code) }));
    const detail = typeof r.data.status === "string" ? r.data.status : null;
    return { ok: true, data: { status, detail } };
  }

  async publish(creationId: string): Promise<PublishResult<{ igMediaId: string }>> {
    const r = await this.call("POST", `${this.igUserId}/media_publish`, {
      creation_id: creationId,
    });
    if (!r.ok) return r;
    const id = r.data.id;
    if (typeof id !== "string" || !id) return fail(classifyPublishError(200, { malformed: true }));
    return { ok: true, data: { igMediaId: id } };
  }

  async getPublishingLimit(): Promise<PublishResult<{ quotaUsage: number; quotaTotal: number }>> {
    const r = await this.call("GET", `${this.igUserId}/content_publishing_limit`, {
      fields: "quota_usage,config",
    });
    if (!r.ok) return r;
    const first = asRecord(Array.isArray(r.data.data) ? r.data.data[0] : null);
    const usage = first.quota_usage;
    const total = asRecord(first.config).quota_total;
    if (typeof usage !== "number" || typeof total !== "number") {
      return fail(classifyPublishError(200, { malformed: true }));
    }
    return { ok: true, data: { quotaUsage: usage, quotaTotal: total } };
  }

  async getMediaPermalink(igMediaId: string): Promise<PublishResult<string | null>> {
    const r = await this.call("GET", igMediaId, { fields: "permalink" });
    if (!r.ok) return r;
    const link = r.data.permalink;
    return { ok: true, data: typeof link === "string" ? link : null };
  }
}

export function publisherForConnection(
  connection: InstagramConnection,
  fetchImpl?: typeof fetch,
): GraphPublisher {
  return new GraphPublisher({
    igUserId: connection.igUserId,
    accessToken: decryptToken(connection),
    fetchImpl,
  });
}

/** `IG_PUBLISHER=fake` swaps in the in-memory publisher (e2e/local without Meta). */
export function getPublisher(connection: InstagramConnection): InstagramPublisher {
  if (process.env.IG_PUBLISHER === "fake") return sharedFakePublisher();
  return publisherForConnection(connection);
}
