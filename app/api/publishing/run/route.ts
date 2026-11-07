import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getPublisher } from "@/lib/instagram/publish";
import { logInfo, logWarn } from "@/lib/publishing/logger";
import { claimDue, lagSeconds } from "@/lib/publishing/queue";
import { runPublication, type LimitResult } from "@/lib/publishing/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Jobs per run (docs/12 section 5.2): serial processing must fit in maxDuration. */
const BATCH_SIZE = 5;
/** Scheduler lag alert threshold (docs/12 section 5.5), in seconds. */
const LAG_ALERT_SECONDS = 15 * 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Vercel cron sends `Authorization: Bearer $CRON_SECRET`; external triggers use x-cron-secret.
  const given =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer /i, "") ??
    "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const runId = `run_${Date.now()}_${randomBytes(4).toString("hex")}`;
  const jobs = await claimDue(BATCH_SIZE, runId);
  const counts = { claimed: jobs.length, published: 0, retried: 0, failed: 0, skipped: 0 };
  const limitCache = new Map<string, LimitResult>();

  for (const job of jobs) {
    try {
      const outcome = await runPublication(job, { publisher: getPublisher, limitCache });
      counts[outcome.kind] += 1;
    } catch (err) {
      // The job stays `publishing`; the 10 minute lock timeout makes it eligible again.
      counts.skipped += 1;
      logWarn("publication_run_crashed", {
        run_id: runId,
        publication_id: job.id,
        post_id: job.postId,
        detail: err instanceof Error ? err.name : "unknown",
      });
    }
  }

  const lag = await lagSeconds();
  if (lag > LAG_ALERT_SECONDS) {
    // Sentry is not wired in this project yet; swap this for Sentry.captureMessage when it is.
    logWarn("scheduler lag", { run_id: runId, detail: `${lag}s` });
  }
  logInfo("publishing_run", { run_id: runId, detail: JSON.stringify(counts) });

  return NextResponse.json({ ...counts, lagSeconds: lag });
}
