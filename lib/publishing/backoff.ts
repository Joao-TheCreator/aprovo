/**
 * Retry schedule for scheduled publications (docs/12 section 4.5). Pure: no I/O.
 */
import type { PublishErrorCode } from "@/lib/instagram/publish-errors";

const MINUTE_MS = 60_000;
/** Minutes to wait after attempt 1..5. Attempts beyond the table reuse the last value. */
export const BACKOFF_MINUTES = [1, 5, 15, 60, 180] as const;
const DAILY_LIMIT_FALLBACK_MS = 60 * MINUTE_MS;
const MEDIA_NOT_READY_MS = 2 * MINUTE_MS;

/** Codes that are worth another attempt. The others are definitive. */
export const RETRYABLE_CODES: ReadonlySet<PublishErrorCode> = new Set<PublishErrorCode>([
  "daily_limit",
  "rate_limited",
  "container_error",
  "network",
  "unknown",
  "media_not_ready",
]);

/** Definitive errors are never retried: it avoids double posts and hammering a dead token. */
export function isDefinitive(code: PublishErrorCode): boolean {
  return (
    code === "token_expired" ||
    code === "not_professional" ||
    code === "missing_scope" ||
    code === "media_rejected"
  );
}

/** When the job becomes due again. `attempts` is the count already made (1 after the first try). */
export function nextAttemptAt(
  attempts: number,
  code: PublishErrorCode,
  now: Date,
  opts: { windowResetAt?: Date } = {},
): Date {
  if (code === "daily_limit") {
    if (opts.windowResetAt && opts.windowResetAt.getTime() > now.getTime()) {
      return opts.windowResetAt;
    }
    return new Date(now.getTime() + DAILY_LIMIT_FALLBACK_MS);
  }
  if (code === "media_not_ready") return new Date(now.getTime() + MEDIA_NOT_READY_MS);
  const index = Math.min(Math.max(attempts, 1), BACKOFF_MINUTES.length) - 1;
  return new Date(now.getTime() + BACKOFF_MINUTES[index] * MINUTE_MS);
}
