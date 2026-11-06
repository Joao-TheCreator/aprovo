"use client";

import { useEffect, useRef } from "react";

import type { LiveEvent } from "./contracts";

const POLL_MS = 5000;

/**
 * Subscribes to live approval events of a profile. Uses SSE; on error falls back to polling
 * `/api/events?profile=<id>&since=<last now>` every 5 s, paused while the tab is hidden.
 */
export function useLiveEvents(profileId: string, onEvent: (event: LiveEvent) => void): void {
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });

  useEffect(() => {
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let since = new Date().toISOString();
    let inflight = false;
    let stopped = false;
    const seen = new Set<string>();
    const base = `/api/events?profile=${encodeURIComponent(profileId)}`;

    function dispatch(event: LiveEvent) {
      const key = `${event.type}:${"postId" in event ? event.postId : event.linkId}:${event.at}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (seen.size > 200) seen.delete(seen.values().next().value as string);
      if (event.at > since) since = event.at;
      handler.current(event);
    }

    async function poll() {
      if (stopped || inflight || document.hidden) return;
      inflight = true;
      try {
        const res = await fetch(`${base}&since=${encodeURIComponent(since)}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as { events: LiveEvent[]; now: string };
        body.events.forEach(dispatch);
        if (body.now) since = body.now;
      } catch {
        // offline: try again on the next tick
      } finally {
        inflight = false;
      }
    }

    function startPolling() {
      if (timer || stopped) return;
      void poll();
      timer = setInterval(() => void poll(), POLL_MS);
    }

    function onVisibility() {
      if (!document.hidden && timer) void poll();
    }

    if (typeof EventSource === "undefined") {
      startPolling();
    } else {
      source = new EventSource(base);
      source.onmessage = (msg) => {
        try {
          dispatch(JSON.parse(msg.data as string) as LiveEvent);
        } catch {
          // ignore malformed payloads
        }
      };
      source.onerror = () => {
        source?.close();
        source = null;
        startPolling();
      };
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      source?.close();
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [profileId]);
}
