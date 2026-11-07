import { describe, expect, it } from "vitest";
import { isDefinitive, nextAttemptAt, RETRYABLE_CODES } from "@/lib/publishing/backoff";

const NOW = new Date("2026-01-01T12:00:00Z");
const minutes = (d: Date) => (d.getTime() - NOW.getTime()) / 60_000;

describe("nextAttemptAt", () => {
  it("follows 1, 5, 15, 60, 180 minutes for attempts 1..5", () => {
    expect([1, 2, 3, 4, 5].map((n) => minutes(nextAttemptAt(n, "rate_limited", NOW)))).toEqual([
      1, 5, 15, 60, 180,
    ]);
  });

  it("caps at 180 minutes beyond attempt 5 and treats 0 like 1", () => {
    expect(minutes(nextAttemptAt(9, "network", NOW))).toBe(180);
    expect(minutes(nextAttemptAt(0, "unknown", NOW))).toBe(1);
  });

  it("daily_limit waits for the window reset, or one hour", () => {
    const reset = new Date(NOW.getTime() + 7 * 3_600_000);
    expect(nextAttemptAt(1, "daily_limit", NOW, { windowResetAt: reset })).toEqual(reset);
    expect(minutes(nextAttemptAt(3, "daily_limit", NOW))).toBe(60);
    // A reset in the past is ignored.
    const past = new Date(NOW.getTime() - 1000);
    expect(minutes(nextAttemptAt(1, "daily_limit", NOW, { windowResetAt: past }))).toBe(60);
  });

  it("media_not_ready waits 2 minutes", () => {
    expect(minutes(nextAttemptAt(4, "media_not_ready", NOW))).toBe(2);
  });
});

describe("error classes", () => {
  it("separates definitive from retryable codes", () => {
    for (const c of [
      "token_expired",
      "not_professional",
      "missing_scope",
      "media_rejected",
    ] as const) {
      expect(isDefinitive(c)).toBe(true);
      expect(RETRYABLE_CODES.has(c)).toBe(false);
    }
    for (const c of RETRYABLE_CODES) expect(isDefinitive(c)).toBe(false);
  });
});
