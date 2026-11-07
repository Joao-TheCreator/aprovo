import { describe, expect, it, vi } from "vitest";
import { GraphPublisher, getPublisher } from "@/lib/instagram/publish";
import { classifyPublishError, sanitizeRaw } from "@/lib/instagram/publish-errors";
import type { InstagramConnection } from "@/db/schema";
import { FakePublisher, ScriptedPublisher, publishError } from "./fake-publisher";

const TOKEN = "IGAAtoken1234567890abcdefghijkl";
const IG_USER = "17841400000000001";
const SECRET_URL = "https://r2.example.com/previews/a.jpg?X-Amz-Signature=abc123&X-Amz-Expires=600";

type Recorded = { url: URL; method: string; body: URLSearchParams | null; signal: unknown };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(respond: (r: Recorded) => Response | Promise<Response> | never) {
  const calls: Recorded[] = [];
  const fn = vi.fn(async (input: URL | string | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url,
    );
    const rec: Recorded = {
      url,
      method: init?.method ?? "GET",
      body: init?.body instanceof URLSearchParams ? init.body : null,
      signal: init?.signal,
    };
    calls.push(rec);
    return respond(rec);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function publisher(fetchImpl: typeof fetch) {
  return new GraphPublisher({ igUserId: IG_USER, accessToken: TOKEN, fetchImpl });
}

describe("GraphPublisher requests", () => {
  it("creates an image container with image_url and caption (token in body, not URL)", async () => {
    const { fn, calls } = mockFetch(() => json({ id: "c1" }));
    const r = await publisher(fn).createImageContainer({ imageUrl: SECRET_URL, caption: "Olá" });
    expect(r).toEqual({ ok: true, data: { id: "c1" } });
    const c = calls[0];
    expect(c.method).toBe("POST");
    expect(c.url.origin + c.url.pathname).toBe(
      `https://graph.instagram.com/v21.0/${IG_USER}/media`,
    );
    expect(c.url.search).toBe("");
    expect(c.body?.get("image_url")).toBe(SECRET_URL);
    expect(c.body?.get("caption")).toBe("Olá");
    expect(c.body?.get("access_token")).toBe(TOKEN);
    expect(c.body?.has("is_carousel_item")).toBe(false);
    expect(c.signal).toBeInstanceOf(AbortSignal);
  });

  it("creates a reel container", async () => {
    const { fn, calls } = mockFetch(() => json({ id: "r1" }));
    await publisher(fn).createVideoContainer({
      videoUrl: "https://x/v.mp4",
      caption: "legenda",
      coverUrl: "https://x/c.jpg",
      shareToFeed: true,
    });
    const b = calls[0].body;
    expect(b?.get("media_type")).toBe("REELS");
    expect(b?.get("video_url")).toBe("https://x/v.mp4");
    expect(b?.get("share_to_feed")).toBe("true");
    expect(b?.get("cover_url")).toBe("https://x/c.jpg");
    expect(b?.get("caption")).toBe("legenda");
  });

  it("flags carousel items (image and video)", async () => {
    const { fn, calls } = mockFetch(() => json({ id: "i" }));
    const p = publisher(fn);
    await p.createImageContainer({ imageUrl: "https://x/a.jpg", isCarouselItem: true });
    await p.createVideoContainer({ videoUrl: "https://x/v.mp4", isCarouselItem: true });
    expect(calls[0].body?.get("is_carousel_item")).toBe("true");
    expect(calls[1].body?.get("media_type")).toBe("VIDEO");
    expect(calls[1].body?.get("is_carousel_item")).toBe("true");
    expect(calls[1].body?.has("share_to_feed")).toBe(false);
  });

  it("creates a carousel container with comma-joined children", async () => {
    const { fn, calls } = mockFetch(() => json({ id: "car" }));
    const r = await publisher(fn).createCarouselContainer({ children: ["a", "b"], caption: "x" });
    expect(r.ok).toBe(true);
    expect(calls[0].body?.get("media_type")).toBe("CAROUSEL");
    expect(calls[0].body?.get("children")).toBe("a,b");
    expect(calls[0].body?.get("caption")).toBe("x");
  });

  it("throws on programmer error (carousel with 1 child)", () => {
    const { fn } = mockFetch(() => json({}));
    expect(() => publisher(fn).createCarouselContainer({ children: ["a"] })).toThrow();
  });

  it("publishes with creation_id", async () => {
    const { fn, calls } = mockFetch(() => json({ id: "m1" }));
    const r = await publisher(fn).publish("c1");
    expect(r).toEqual({ ok: true, data: { igMediaId: "m1" } });
    expect(calls[0].url.pathname).toBe(`/v21.0/${IG_USER}/media_publish`);
    expect(calls[0].body?.get("creation_id")).toBe("c1");
  });

  it("reads the publishing limit", async () => {
    const { fn, calls } = mockFetch(() =>
      json({ data: [{ quota_usage: 7, config: { quota_total: 100, quota_duration: 86400 } }] }),
    );
    const r = await publisher(fn).getPublishingLimit();
    expect(r).toEqual({ ok: true, data: { quotaUsage: 7, quotaTotal: 100 } });
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url.pathname).toBe(`/v21.0/${IG_USER}/content_publishing_limit`);
    expect(calls[0].url.searchParams.get("fields")).toBe("quota_usage,config");
    expect(calls[0].url.searchParams.get("access_token")).toBe(TOKEN);
  });

  it("reads the permalink (and null when absent)", async () => {
    const { fn, calls } = mockFetch((r) =>
      json(
        r.url.pathname.endsWith("/m1") ? { id: "m1", permalink: "https://ig/p/1/" } : { id: "m2" },
      ),
    );
    const p = publisher(fn);
    expect(await p.getMediaPermalink("m1")).toEqual({ ok: true, data: "https://ig/p/1/" });
    expect(await p.getMediaPermalink("m2")).toEqual({ ok: true, data: null });
    expect(calls[0].url.searchParams.get("fields")).toBe("permalink");
  });

  it("maps every status_code", async () => {
    for (const code of ["IN_PROGRESS", "FINISHED", "ERROR", "EXPIRED", "PUBLISHED"] as const) {
      const { fn, calls } = mockFetch(() => json({ status_code: code, status: "detalhe" }));
      const r = await publisher(fn).getContainerStatus("c1");
      expect(r).toEqual({ ok: true, data: { status: code, detail: "detalhe" } });
      expect(calls[0].url.pathname).toBe("/v21.0/c1");
      expect(calls[0].url.searchParams.get("fields")).toBe("status_code,status");
    }
    const { fn } = mockFetch(() => json({ status_code: "FINISHED" }));
    expect(await publisher(fn).getContainerStatus("c1")).toEqual({
      ok: true,
      data: { status: "FINISHED", detail: null },
    });
  });

  it("returns an error for an unknown status_code", async () => {
    const { fn } = mockFetch(() => json({ status_code: "WAT" }));
    const r = await publisher(fn).getContainerStatus("c1");
    expect(r.ok).toBe(false);
  });
});

describe("GraphPublisher errors", () => {
  it("never leaks the token or media URLs in returned errors", async () => {
    const { fn } = mockFetch(() =>
      json(
        {
          error: {
            code: 36003,
            message: `Cannot fetch ${SECRET_URL} with access_token=${TOKEN}`,
            access_token: TOKEN,
          },
        },
        400,
      ),
    );
    const r = await publisher(fn).createImageContainer({ imageUrl: SECRET_URL });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const dump = JSON.stringify(r.error);
    expect(dump).not.toContain(TOKEN);
    expect(dump).not.toContain("abc123");
    expect(dump).not.toContain("X-Amz-Signature=abc123");
    expect(r.error.code).toBe("media_rejected");
  });

  it("maps a fetch rejection to a retryable network error without leaking", async () => {
    const { fn } = mockFetch(() => {
      throw new Error(`boom https://graph.instagram.com/?access_token=${TOKEN}`);
    });
    const r = await publisher(fn).publish("c1");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatchObject({ code: "network", retryable: true, httpStatus: 0 });
    expect(JSON.stringify(r.error)).not.toContain(TOKEN);
  });

  it("maps a timeout (AbortError) to network", async () => {
    const { fn } = mockFetch(() => {
      throw new DOMException("The operation was aborted", "AbortError");
    });
    const r = await publisher(fn).getPublishingLimit();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("network");
  });

  it("handles a non-JSON 502 body", async () => {
    const { fn } = mockFetch(() => new Response("<html>bad gateway</html>", { status: 502 }));
    const r = await publisher(fn).publish("c1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ code: "network", httpStatus: 502 });
  });

  it("treats 9007 on media_publish as media_not_ready (retryable)", async () => {
    const { fn } = mockFetch(() =>
      json({ error: { code: 9007, message: "Media not ready" } }, 400),
    );
    const r = await publisher(fn).publish("c1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ code: "media_not_ready", retryable: true });
  });
});

describe("classifyPublishError", () => {
  const err = (code: number, message = "x", subcode?: number) => ({
    error: { code, message, ...(subcode ? { error_subcode: subcode } : {}) },
  });

  it.each([
    [400, err(190), "token_expired", false],
    [400, err(10), "missing_scope", false],
    [400, err(200), "missing_scope", false],
    [400, err(9), "daily_limit", true],
    [400, err(4), "rate_limited", true],
    [400, err(17), "rate_limited", true],
    [400, err(32), "rate_limited", true],
    [400, err(613), "rate_limited", true],
    [429, null, "rate_limited", true],
    [400, err(9007), "media_not_ready", true],
    [400, err(36003), "media_rejected", false],
    [400, err(1, "x", 2207026), "media_rejected", false],
    [400, err(100, "Must be a professional account"), "not_professional", false],
    [500, null, "network", true],
    [0, null, "network", true],
    [400, err(1), "unknown", true],
  ] as const)("HTTP %i %j -> %s (retryable %s)", (status, body, code, retryable) => {
    const e = classifyPublishError(status, body);
    expect(e.code).toBe(code);
    expect(e.retryable).toBe(retryable);
    expect(e.httpStatus).toBe(status);
  });

  it("sanitizeRaw strips tokens and signed URLs deeply", () => {
    const out = JSON.stringify(
      sanitizeRaw({
        error: {
          message: `url ${SECRET_URL} access_token=${TOKEN}`,
          nested: [`X-Amz-Signature=zzz`],
        },
        access_token: TOKEN,
      }),
    );
    expect(out).not.toContain(TOKEN);
    expect(out).not.toContain("abc123");
    expect(out).not.toContain("zzz");
  });
});

describe("FakePublisher", () => {
  it("finishes containers after N polls with deterministic ids", async () => {
    const f = new FakePublisher({ pollsUntilFinished: 3 });
    const c = await f.createImageContainer();
    if (!c.ok) throw new Error("unexpected");
    expect(c.data.id).toBe("fake_container_1");
    const statuses: string[] = [];
    for (let i = 0; i < 3; i++) {
      const s = await f.getContainerStatus(c.data.id);
      if (s.ok) statuses.push(s.data.status);
    }
    expect(statuses).toEqual(["IN_PROGRESS", "IN_PROGRESS", "FINISHED"]);
    const p1 = await f.publish();
    const p2 = await f.publish();
    expect(p1).toEqual({ ok: true, data: { igMediaId: "fake_1" } });
    expect(p2).toEqual({ ok: true, data: { igMediaId: "fake_2" } });
    expect(await f.getMediaPermalink("fake_1")).toEqual({
      ok: true,
      data: "https://www.instagram.com/p/FAKE1/",
    });
    expect(await f.getPublishingLimit()).toEqual({
      ok: true,
      data: { quotaUsage: 2, quotaTotal: 100 },
    });
  });

  it("ScriptedPublisher serves queued responses then falls back", async () => {
    const s = new ScriptedPublisher().fail("publish", publishError("daily_limit"));
    const first = await s.publish("c1");
    expect(first.ok).toBe(false);
    expect(await s.publish("c1")).toEqual({ ok: true, data: { igMediaId: "fake_1" } });
    expect(s.calls.map((c) => c.method)).toEqual(["publish", "publish"]);
  });

  it("getPublisher returns the fake when IG_PUBLISHER=fake", () => {
    vi.stubEnv("IG_PUBLISHER", "fake");
    try {
      const p = getPublisher({} as InstagramConnection);
      expect(p).toBeInstanceOf(FakePublisher);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
