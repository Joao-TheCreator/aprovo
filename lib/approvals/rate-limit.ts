/** In-memory fixed-window limiter. Per instance only (fine for the MVP). */
const WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

/** Returns true when the call is allowed. */
export function allow(key: string, limit = 10, now = Date.now()): boolean {
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }
  const cur = hits.get(key);
  if (!cur || cur.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  cur.count++;
  return cur.count <= limit;
}

export function resetRateLimits(): void {
  hits.clear();
}
