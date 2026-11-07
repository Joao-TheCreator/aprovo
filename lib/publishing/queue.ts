/**
 * Job queue for scheduled publications (docs/12 section 5.3).
 * `claimDue` is one atomic statement; `release` is one UPDATE per outcome.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { publications } from "@/db/schema";
import type { PublishErrorCode } from "@/lib/instagram/publish-errors";

export type PublicationRow = typeof publications.$inferSelect;

/** A lock older than this is considered abandoned (the function died mid-run). */
export const LOCK_TIMEOUT_MINUTES = 10;

/**
 * Atomically takes up to `limit` due jobs: `scheduled`, `next_attempt_at <= now()` and unlocked
 * (or locked for more than 10 minutes). `for update skip locked` guarantees two concurrent runs
 * never receive the same job. `attempts` is incremented here, so it counts every claim.
 */
export async function claimDue(limit: number, runId: string): Promise<PublicationRow[]> {
  const claimed = await db.execute<{ id: string }>(sql`
    with due as (
      select id from publications
      where status = 'scheduled'
        and next_attempt_at <= now()
        and (locked_at is null or locked_at < now() - make_interval(mins => ${LOCK_TIMEOUT_MINUTES}))
      order by next_attempt_at
      limit ${limit}
      for update skip locked
    )
    update publications p
    set status = 'publishing', locked_at = now(), locked_by = ${runId},
        attempts = p.attempts + 1, updated_at = now()
    from due
    where p.id = due.id
    returning p.id
  `);
  const ids = [...claimed].map((r) => r.id);
  if (ids.length === 0) return [];
  // Read back through Drizzle so timestamps and jsonb are mapped like everywhere else.
  return db
    .select()
    .from(publications)
    .where(inArray(publications.id, ids))
    .orderBy(asc(publications.nextAttemptAt));
}

export type ReleaseOutcome =
  | { kind: "published"; igMediaId: string; permalink: string | null; publishedAt: Date }
  | {
      kind: "retry";
      at: Date;
      /** `null` for "container still processing": it is not an error, so the last error is cleared. */
      code: PublishErrorCode | null;
      message: string | null;
      raw: unknown;
      /** `undefined` keeps the stored container, `null` forgets it, a string stores it. */
      containerId?: string | null;
      containerCreatedAt?: Date | null;
      /**
       * Gives back the attempt `claimDue` counted. Used when the container is merely still
       * processing (docs/12 section 4.4): waiting is expected and must not eat `max_attempts`.
       */
      uncountAttempt?: boolean;
    }
  | { kind: "failed"; code: PublishErrorCode; message: string; raw: unknown };

/** Applies an outcome to a job we hold (`status = 'publishing'`). Returns null if we no longer hold it. */
export async function release(id: string, outcome: ReleaseOutcome): Promise<PublicationRow | null> {
  const where = and(eq(publications.id, id), eq(publications.status, "publishing"));
  const cleared = { lockedAt: null, lockedBy: null, updatedAt: new Date() } as const;
  let set: PgUpdateSetSource<typeof publications>;
  switch (outcome.kind) {
    case "published":
      set = {
        ...cleared,
        status: "published",
        igMediaId: outcome.igMediaId,
        permalink: outcome.permalink,
        publishedAt: outcome.publishedAt,
        lastErrorCode: null,
        lastError: null,
        lastErrorRaw: null,
      };
      break;
    case "retry":
      set = {
        ...cleared,
        status: "scheduled",
        nextAttemptAt: outcome.at,
        lastErrorCode: outcome.code,
        lastError: outcome.message,
        lastErrorRaw: outcome.raw ?? null,
        ...(outcome.containerId !== undefined ? { containerId: outcome.containerId } : {}),
        ...(outcome.containerCreatedAt !== undefined
          ? { containerCreatedAt: outcome.containerCreatedAt }
          : {}),
        ...(outcome.uncountAttempt
          ? { attempts: sql`greatest(${publications.attempts} - 1, 0)` }
          : {}),
      };
      break;
    case "failed":
      set = {
        ...cleared,
        status: "failed",
        lastErrorCode: outcome.code,
        lastError: outcome.message,
        lastErrorRaw: outcome.raw ?? null,
      };
      break;
  }
  const [row] = await db.update(publications).set(set).where(where).returning();
  return row ?? null;
}

/** Seconds the oldest due `scheduled` job has been waiting past its `next_attempt_at` (0 if none). */
export async function lagSeconds(): Promise<number> {
  const rows = await db.execute<{ lag: string | number | null }>(sql`
    select extract(epoch from (now() - min(next_attempt_at))) as lag
    from publications
    where status = 'scheduled' and next_attempt_at <= now()
  `);
  const lag = Number([...rows][0]?.lag ?? 0);
  return Number.isFinite(lag) && lag > 0 ? Math.floor(lag) : 0;
}
