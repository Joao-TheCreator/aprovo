/**
 * Runs one claimed publication (docs/12 sections 4.1 to 4.6). The cron route is the only caller
 * and the only writer of `published`. Never logs tokens or signed URLs.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { instagramConnections, posts, publications, type InstagramConnection } from "@/db/schema";
import { logActivity } from "@/lib/activity/log";
import { canPublish } from "@/lib/instagram/oauth";
import type { InstagramPublisher, PublishResult } from "@/lib/instagram/publish";
import {
  sanitizeRaw,
  type PublishError,
  type PublishErrorCode,
} from "@/lib/instagram/publish-errors";
import { notifyEvent } from "@/lib/realtime/notify";
import { onFailed, onPublished } from "./after";
import { isDefinitive, nextAttemptAt } from "./backoff";
import {
  failPost,
  failPublicationsForConnection,
  isAccountErrorCode,
  notifyConnectionLost,
} from "./connection-loss";
import {
  PUBLICATION_ERROR_MESSAGES,
  PublishValidationError,
  type PreparedMedia,
} from "./contracts";
import { logInfo, logWarn } from "./logger";
import { preparePostMedia } from "./prepare";
import { release, type PublicationRow, type ReleaseOutcome } from "./queue";

/** A container older than this is not reused (docs/12 section 3, expires in 24 h). [confirmar] */
const CONTAINER_MAX_AGE_MS = 24 * 3600 * 1000;
/** Container errors are retried by recreating the container: 1 try + 2 recreations. */
const MAX_CONTAINER_ATTEMPTS = 3;
const CHILDREN_PREFIX = "children:";
/** [confirmar] heuristic: an ERROR container whose detail mentions a format problem is definitive. */
const FORMAT_ERROR =
  /format|aspect|ratio|resolution|codec|duration|size|unsupported|invalid|corrupt/i;
const SCHEDULER_ACTOR = "system:scheduler" as const;

export const CONNECTION_DOWN_MESSAGE = "Conecte o Instagram novamente para publicar.";

const CONNECTION_STATUS_FOR: Partial<Record<PublishErrorCode, InstagramConnection["status"]>> = {
  token_expired: "expired",
  not_professional: "not_professional",
  missing_scope: "missing_scope",
};

/**
 * Post-publication hooks (e-mail, feed import). Failures inside a hook never change the outcome.
 * An object so tests can spy on the calls.
 */
export const afterHooks = { onPublished, onFailed };

export type RunOutcome = {
  kind: "published" | "retried" | "failed" | "skipped";
  code: PublishErrorCode | null;
};

export type LimitResult = PublishResult<{ quotaUsage: number; quotaTotal: number }>;

export type RunDeps = {
  publisher: (connection: InstagramConnection) => InstagramPublisher;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** Default 15 s between status polls (docs/12 section 4.4). */
  pollIntervalMs?: number;
  /** Default 60 s of polling inside one run. */
  pollBudgetMs?: number;
  /** Share one map across the jobs of a run to ask for the daily limit once per connection. */
  limitCache?: Map<string, LimitResult>;
};

type Decision = {
  outcome: ReleaseOutcome;
  /** Set when the failure came from a Meta response, so the connection status is updated. */
  fromMeta?: boolean;
};

function messageFor(code: PublishErrorCode): string {
  return code === "media_not_ready"
    ? PUBLICATION_ERROR_MESSAGES.container_error
    : PUBLICATION_ERROR_MESSAGES[code];
}

function failed(
  code: PublishErrorCode,
  raw: unknown = null,
  message: string = messageFor(code),
  fromMeta = false,
): Decision {
  return { outcome: { kind: "failed", code, message, raw }, fromMeta };
}

/**
 * Container still processing. Not a failure: `claimDue` already counted this claim, so the
 * attempt is given back (`uncountAttempt`). Keeps the stored container.
 */
function stillProcessing(job: PublicationRow, now: Date, containerId?: string): Decision {
  return {
    outcome: {
      kind: "retry",
      at: nextAttemptAt(job.attempts, "media_not_ready", now),
      code: null,
      message: null,
      raw: null,
      uncountAttempt: true,
      ...(containerId !== undefined ? { containerId } : {}),
    },
  };
}

/** Retry with backoff, or fail when `max_attempts` is exhausted. */
function retryOrFail(
  job: PublicationRow,
  code: PublishErrorCode,
  raw: unknown,
  now: Date,
  extra: { containerId?: string | null; containerCreatedAt?: Date | null } = {},
  fromMeta = false,
): Decision {
  if (job.attempts >= job.maxAttempts) return failed(code, raw, undefined, fromMeta);
  return {
    outcome: {
      kind: "retry",
      at: nextAttemptAt(job.attempts, code, now),
      code,
      message: messageFor(code),
      raw,
      ...extra,
    },
    fromMeta,
  };
}

function fromPublishError(job: PublicationRow, e: PublishError, now: Date): Decision {
  if (e.code === "media_not_ready") return stillProcessing(job, now);
  if (isDefinitive(e.code) || !e.retryable) return failed(e.code, e.raw, undefined, true);
  return retryOrFail(job, e.code, e.raw, now, {}, true);
}

type WaitResult =
  | { kind: "finished" }
  | { kind: "in_progress" }
  | { kind: "published" }
  | { kind: "bad_container"; status: "ERROR" | "EXPIRED"; detail: string | null }
  | { kind: "error"; error: PublishError };

export async function runPublication(job: PublicationRow, deps: RunDeps): Promise<RunOutcome> {
  const clock = deps.now ?? (() => new Date());
  const started = Date.now();
  let decision: Decision;
  try {
    decision = await execute(job, deps, clock);
  } catch (err) {
    // Unexpected (storage, database...). Never echo the message: it may carry URLs.
    logWarn("publication_unexpected_error", {
      publication_id: job.id,
      post_id: job.postId,
      connection_id: job.connectionId,
      detail: err instanceof Error ? err.name : "unknown",
    });
    decision = retryOrFail(job, "unknown", null, clock());
  }
  const durationMs = Date.now() - started;

  const released = await release(job.id, decision.outcome);
  if (!released) {
    logWarn("publication_release_skipped", {
      publication_id: job.id,
      post_id: job.postId,
      detail: "job no longer in publishing state",
    });
    return { kind: "skipped", code: null };
  }

  const out = decision.outcome;
  const code = out.kind === "published" ? null : out.code;
  const outcomeName = out.kind === "retry" ? "retried" : out.kind;
  (out.kind === "failed" ? logWarn : logInfo)("publication_attempt", {
    publication_id: job.id,
    post_id: job.postId,
    connection_id: job.connectionId,
    attempt: job.attempts,
    outcome: outcomeName,
    code,
    duration_ms: durationMs,
  });

  const result = await recordOutcome(job, released, decision, durationMs, clock);
  if (result.published) await runHook("onPublished", released);
  for (const row of result.failed) await runHook("onFailed", row);
  if (result.connectionId) await notifyLoss(result.connectionId, result.failed.length);
  return { kind: outcomeName, code };
}

/** One e-mail per lost connection, not one per publication. Never throws. */
async function notifyLoss(connectionId: string, affected: number): Promise<void> {
  try {
    const [c] = await db
      .select()
      .from(instagramConnections)
      .where(eq(instagramConnections.id, connectionId))
      .limit(1);
    if (c) await notifyConnectionLost(c, affected);
  } catch {
    logWarn("publication_hook_failed", { connection_id: connectionId, detail: "connection_lost" });
  }
}

async function runHook(name: keyof typeof afterHooks, row: PublicationRow): Promise<void> {
  try {
    await afterHooks[name](row);
  } catch {
    logWarn("publication_hook_failed", {
      publication_id: row.id,
      post_id: row.postId,
      detail: name,
    });
  }
}

async function execute(job: PublicationRow, deps: RunDeps, clock: () => Date): Promise<Decision> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pollInterval = deps.pollIntervalMs ?? 15_000;
  const pollBudget = deps.pollBudgetMs ?? 60_000;

  // a. Connection must be active and allowed to publish. No Meta call otherwise.
  const connection = job.connectionId
    ? ((
        await db
          .select()
          .from(instagramConnections)
          .where(eq(instagramConnections.id, job.connectionId))
          .limit(1)
      )[0] ?? null)
    : null;
  if (!connection || connection.status !== "active") {
    return failed("token_expired", null, CONNECTION_DOWN_MESSAGE);
  }
  if (!canPublish(connection)) return failed("missing_scope");

  // b. Validate and sign the media.
  let prepared: PreparedMedia;
  try {
    prepared = await preparePostMedia(job.postId);
  } catch (err) {
    if (err instanceof PublishValidationError) {
      return failed("media_rejected", { issues: err.issues.map((i) => i.code) }, err.message);
    }
    throw err;
  }

  const pub = deps.publisher(connection);

  // c. Daily limit, once per run per connection.
  const cache = deps.limitCache;
  let limit = cache?.get(connection.id);
  if (!limit) {
    limit = await pub.getPublishingLimit();
    cache?.set(connection.id, limit);
  }
  if (!limit.ok) return fromPublishError(job, limit.error, clock());
  if (limit.data.quotaUsage >= limit.data.quotaTotal) {
    return retryOrFail(job, "daily_limit", { ...limit.data }, clock());
  }

  // d. Container: reuse a recent one, otherwise create.
  const persist = async (stored: string): Promise<void> => {
    await db
      .update(publications)
      .set({ containerId: stored, containerCreatedAt: clock() })
      .where(and(eq(publications.id, job.id), eq(publications.status, "publishing")));
  };

  let containerId: string | null = null;
  let pendingChildren: string[] | null = null;
  const reusable =
    job.containerId !== null &&
    job.containerCreatedAt !== null &&
    clock().getTime() - job.containerCreatedAt.getTime() < CONTAINER_MAX_AGE_MS;

  if (reusable && job.containerId) {
    if (job.containerId.startsWith(CHILDREN_PREFIX)) {
      pendingChildren = job.containerId.slice(CHILDREN_PREFIX.length).split(",");
    } else {
      const st = await pub.getContainerStatus(job.containerId);
      if (!st.ok) return fromPublishError(job, st.error, clock());
      switch (st.data.status) {
        case "PUBLISHED":
          // Already live (a previous run died after media_publish): never publish twice.
          return finishAlreadyPublished(pub, job.containerId, clock);
        case "ERROR": {
          // Recreate in this same run unless definitive or the recreations ran out.
          const bad = badContainer(job, "ERROR", st.data.detail);
          if (bad) return bad;
          break;
        }
        case "EXPIRED":
          break;
        default:
          containerId = job.containerId;
      }
    }
  }

  if (containerId === null && pendingChildren === null) {
    const items = prepared.items;
    if (items.length === 1 && items[0].kind === "image") {
      const r = await pub.createImageContainer({
        imageUrl: items[0].url,
        caption: prepared.caption,
      });
      if (!r.ok) return fromPublishError(job, r.error, clock());
      containerId = r.data.id;
      await persist(containerId);
    } else if (items.length === 1) {
      const r = await pub.createVideoContainer({
        videoUrl: items[0].url,
        caption: prepared.caption,
        coverUrl: items[0].coverUrl,
        shareToFeed: true,
      });
      if (!r.ok) return fromPublishError(job, r.error, clock());
      containerId = r.data.id;
      await persist(containerId);
    } else {
      const ids: string[] = [];
      for (const item of items) {
        const r =
          item.kind === "image"
            ? await pub.createImageContainer({ imageUrl: item.url, isCarouselItem: true })
            : await pub.createVideoContainer({
                videoUrl: item.url,
                coverUrl: item.coverUrl,
                isCarouselItem: true,
              });
        if (!r.ok) return fromPublishError(job, r.error, clock());
        ids.push(r.data.id);
      }
      // Children are saved first so a slow video does not restart from zero on the next run.
      await persist(`${CHILDREN_PREFIX}${ids.join(",")}`);
      pendingChildren = ids;
    }
  }

  // e. Wait for processing. The poll budget is shared by every wait of this run.
  let waitedMs = 0;
  const waitFinished = async (id: string, onlyOnce: boolean): Promise<WaitResult> => {
    for (;;) {
      const st = await pub.getContainerStatus(id);
      if (!st.ok) return { kind: "error", error: st.error };
      switch (st.data.status) {
        case "FINISHED":
          return { kind: "finished" };
        case "PUBLISHED":
          return { kind: "published" };
        case "ERROR":
        case "EXPIRED":
          return { kind: "bad_container", status: st.data.status, detail: st.data.detail };
        case "IN_PROGRESS":
          if (onlyOnce || waitedMs + pollInterval > pollBudget) return { kind: "in_progress" };
          await sleep(pollInterval);
          waitedMs += pollInterval;
      }
    }
  };
  const handleWait = (w: WaitResult, keepId: string): Decision | null => {
    switch (w.kind) {
      case "finished":
      case "published":
        return null;
      case "in_progress":
        return stillProcessing(job, clock(), keepId);
      case "error":
        return fromPublishError(job, w.error, clock());
      case "bad_container":
        // Forget the dead container so the next attempt creates a new one.
        return (
          badContainer(job, w.status, w.detail) ??
          retryOrFail(job, "container_error", null, clock(), {
            containerId: null,
            containerCreatedAt: null,
          })
        );
    }
  };

  if (pendingChildren) {
    const keep = `${CHILDREN_PREFIX}${pendingChildren.join(",")}`;
    for (const child of pendingChildren) {
      const d = handleWait(await waitFinished(child, false), keep);
      if (d) return d;
    }
    const r = await pub.createCarouselContainer({
      children: pendingChildren,
      caption: prepared.caption,
    });
    if (!r.ok) return fromPublishError(job, r.error, clock());
    containerId = r.data.id;
    await persist(containerId);
  }

  if (containerId === null) throw new Error("container missing");
  const isImage = prepared.items.length === 1 && prepared.items[0].kind === "image";
  const waited = await waitFinished(containerId, isImage);
  if (waited.kind === "published") return finishAlreadyPublished(pub, containerId, clock);
  const waitDecision = handleWait(waited, containerId);
  if (waitDecision) return waitDecision;

  // f. Publish.
  const pr = await pub.publish(containerId);
  if (!pr.ok) return fromPublishError(job, pr.error, clock());
  const permalink = await pub.getMediaPermalink(pr.data.igMediaId);
  return {
    outcome: {
      kind: "published",
      igMediaId: pr.data.igMediaId,
      permalink: permalink.ok ? permalink.data : null,
      publishedAt: clock(),
    },
  };
}

/**
 * ERROR/EXPIRED container. Returns a definitive failure (format reason) or a "recreations
 * exhausted" failure, or null when the caller should recreate the container (EXPIRED, or ERROR
 * within the budget of 2 recreations, counted through `attempts`).
 */
function badContainer(
  job: PublicationRow,
  status: "ERROR" | "EXPIRED",
  detail: string | null,
): Decision | null {
  if (status === "EXPIRED") return null;
  const raw = sanitizeRaw({ status, detail });
  if (detail && FORMAT_ERROR.test(detail)) return failed("media_rejected", raw, undefined, true);
  if (job.attempts > MAX_CONTAINER_ATTEMPTS) return failed("container_error", raw);
  return null;
}

/**
 * The container is already PUBLISHED (docs/12 section 5.3). Meta does not document the media id
 * of a published container, so the container id is used as the media id. [confirmar]
 */
async function finishAlreadyPublished(
  pub: InstagramPublisher,
  containerId: string,
  clock: () => Date,
): Promise<Decision> {
  const permalink = await pub.getMediaPermalink(containerId);
  return {
    outcome: {
      kind: "published",
      igMediaId: containerId,
      permalink: permalink.ok ? permalink.data : null,
      publishedAt: clock(),
    },
  };
}

/** Post status, activity log and live event for one finished attempt (docs/12 section 4.6). */
async function recordOutcome(
  job: PublicationRow,
  released: PublicationRow,
  decision: Decision,
  durationMs: number,
  clock: () => Date,
): Promise<{ published: boolean; failed: PublicationRow[]; connectionId: string | null }> {
  const out = decision.outcome;
  const failedRows: PublicationRow[] = [];
  let lostConnectionId: string | null = null;
  const profileId = job.profileId;

  await db.transaction(async (tx) => {
    await logActivity(tx, {
      profileId,
      actor: SCHEDULER_ACTOR,
      event: "publication.attempt",
      payload: {
        publicationId: job.id,
        postId: job.postId,
        attempt: job.attempts,
        outcome: out.kind,
        code: out.kind === "published" ? null : out.code,
        durationMs,
      },
    });

    if (out.kind === "published") {
      // The post is live on Instagram: record it even if the local status drifted.
      await tx
        .update(posts)
        .set({ status: "published", publishedMediaId: out.igMediaId })
        .where(eq(posts.id, job.postId));
      await logActivity(tx, {
        profileId,
        actor: SCHEDULER_ACTOR,
        event: "publication.published",
        payload: {
          publicationId: job.id,
          postId: job.postId,
          igMediaId: out.igMediaId,
          permalink: out.permalink,
        },
      });
      await notifyEvent(tx, {
        type: "post.status",
        profileId,
        postId: job.postId,
        status: "published",
        decision: null,
        at: clock().toISOString(),
      });
      return;
    }

    if (out.kind !== "failed") return;

    await failPost(tx, released, out.code, out.message, SCHEDULER_ACTOR, clock());
    failedRows.push(released);

    // docs/12 section 7: a dead connection fails every other live publication at once.
    if (isAccountErrorCode(out.code) && job.connectionId) {
      const status = CONNECTION_STATUS_FOR[out.code];
      if (status && decision.fromMeta) {
        await tx
          .update(instagramConnections)
          .set({ status, statusDetail: out.message, statusCheckedAt: clock() })
          .where(eq(instagramConnections.id, job.connectionId));
      }
      const siblings = await failPublicationsForConnection(
        job.connectionId,
        out.code,
        SCHEDULER_ACTOR,
        { tx, exceptId: job.id, message: out.message, now: clock },
      );
      failedRows.push(...siblings);
      lostConnectionId = job.connectionId;
    }
  });

  return {
    published: out.kind === "published",
    failed: failedRows,
    connectionId: lostConnectionId,
  };
}
