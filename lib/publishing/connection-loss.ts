/**
 * Connection loss (docs/12 section 7): when an Instagram connection stops being usable, every
 * `scheduled` publication of it fails at once instead of waiting for its time. Shared by the
 * scheduler (`run.ts`), the weekly health check and the deauthorize callback.
 * Never logs or stores tokens.
 */
import { and, count, eq, inArray, ne } from "drizzle-orm";
import { db, type Database } from "@/db/client";
import { posts, publications, users, type InstagramConnection } from "@/db/schema";
import { logActivity, type ActivityActor } from "@/lib/activity/log";
import { sendConnectionLostEmail, type ConnectionLostReason } from "@/lib/email/send";
import type { PostStatus } from "@/lib/profiles/contracts";
import { notifyEvent } from "@/lib/realtime/notify";
import { PUBLICATION_ERROR_MESSAGES, type PublicationErrorCode } from "./contracts";
import { InvalidTransitionError, nextPostStatus } from "./state";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type PublicationRow = typeof publications.$inferSelect;

/** Account-level failure codes: the connection itself is unusable. */
export type AccountErrorCode = Extract<
  PublicationErrorCode,
  "token_expired" | "missing_scope" | "not_professional"
>;

export const ACCOUNT_ERROR_CODES: ReadonlySet<string> = new Set<AccountErrorCode>([
  "token_expired",
  "missing_scope",
  "not_professional",
]);

export function isAccountErrorCode(code: string | null | undefined): code is AccountErrorCode {
  return !!code && ACCOUNT_ERROR_CODES.has(code);
}

/** Maps a non-active connection status to the publication error code. `revoked` reads as expired. */
export function accountCodeForStatus(
  status: InstagramConnection["status"],
): AccountErrorCode | null {
  switch (status) {
    case "expired":
    case "revoked":
      return "token_expired";
    case "missing_scope":
      return "missing_scope";
    case "not_professional":
      return "not_professional";
    default:
      return null;
  }
}

/**
 * Moves the post to `publish_failed` (only from `scheduled`, via the state machine), logs one
 * `publication.failed` and emits the live event. Must run inside the caller's transaction.
 */
export async function failPost(
  tx: Tx,
  row: Pick<PublicationRow, "id" | "postId" | "profileId">,
  code: string,
  message: string,
  actor: ActivityActor,
  at: Date = new Date(),
): Promise<void> {
  const [post] = await tx.select().from(posts).where(eq(posts.id, row.postId)).limit(1);
  let status: PostStatus | null = null;
  if (post) {
    try {
      status = nextPostStatus(post.status, "publish_failed");
    } catch (err) {
      if (!(err instanceof InvalidTransitionError)) throw err;
    }
  }
  if (status) await tx.update(posts).set({ status }).where(eq(posts.id, row.postId));
  await logActivity(tx, {
    profileId: row.profileId,
    actor,
    event: "publication.failed",
    payload: { publicationId: row.id, postId: row.postId, code, message },
  });
  if (status) {
    await notifyEvent(tx, {
      type: "post.status",
      profileId: row.profileId,
      postId: row.postId,
      status,
      decision: null,
      at: at.toISOString(),
    });
  }
}

type FailOptions = {
  /** Join the caller's transaction instead of opening one. */
  tx?: Tx;
  /** A publication already handled by the caller. */
  exceptId?: string;
  message?: string;
  now?: () => Date;
};

/**
 * Fails every `scheduled` publication of the connection in ONE update, then fixes the posts and
 * logs one `publication.failed` per publication. Returns the failed rows (empty when none).
 */
export async function failPublicationsForConnection(
  connectionId: string,
  code: AccountErrorCode,
  actor: ActivityActor,
  opts: FailOptions = {},
): Promise<PublicationRow[]> {
  const at = (opts.now ?? (() => new Date()))();
  const message = opts.message ?? PUBLICATION_ERROR_MESSAGES[code];
  const run = async (tx: Tx): Promise<PublicationRow[]> => {
    const rows = await tx
      .update(publications)
      .set({
        status: "failed",
        lastErrorCode: code,
        lastError: message,
        lastErrorRaw: null,
        lockedAt: null,
        lockedBy: null,
        updatedAt: at,
      })
      .where(
        and(
          eq(publications.connectionId, connectionId),
          eq(publications.status, "scheduled"),
          ...(opts.exceptId ? [ne(publications.id, opts.exceptId)] : []),
        ),
      )
      .returning();
    for (const row of rows) await failPost(tx, row, code, message, actor, at);
    return rows;
  };
  return opts.tx ? run(opts.tx) : db.transaction(run);
}

function reasonFor(connection: Pick<InstagramConnection, "status">): ConnectionLostReason {
  switch (connection.status) {
    case "missing_scope":
      return "missing_scope";
    case "not_professional":
      return "not_professional";
    case "revoked":
      return "revoked";
    default:
      return "expired";
  }
}

/** One e-mail to whoever connected the account. Never throws. */
export async function notifyConnectionLost(
  connection: Pick<InstagramConnection, "id" | "username" | "status" | "connectedBy">,
  affected: number,
): Promise<void> {
  try {
    if (!connection.connectedBy) return;
    const [u] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, connection.connectedBy))
      .limit(1);
    if (!u?.email) return;
    const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
    await sendConnectionLostEmail({
      to: u.email,
      username: connection.username,
      affected,
      reason: reasonFor(connection),
      url: `${base}/configuracoes`,
    });
  } catch (e) {
    console.warn("[publishing] connection-lost e-mail skipped:", e instanceof Error ? e.name : e);
  }
}

/**
 * Health-check / deauthorize entry point: fail the scheduled publications and, when there were
 * any, send the single e-mail. Never throws.
 */
export async function handleConnectionLoss(
  connection: Pick<InstagramConnection, "id" | "username" | "status" | "connectedBy">,
  actor: ActivityActor,
): Promise<number> {
  try {
    const code = accountCodeForStatus(connection.status);
    if (!code) return 0;
    const rows = await failPublicationsForConnection(connection.id, code, actor);
    if (rows.length > 0) await notifyConnectionLost(connection, rows.length);
    return rows.length;
  } catch (e) {
    console.error(
      `[publishing] connection loss handling failed connection=${connection.id}:`,
      e instanceof Error ? e.name : "unknown",
    );
    return 0;
  }
}

/**
 * Failed publications that a reconnection can fix (account-level codes), per connection.
 * Connections without any are absent from the map.
 */
export async function countRescheduleableFailures(
  connectionIds: string[],
): Promise<Map<string, number>> {
  if (connectionIds.length === 0) return new Map();
  const rows = await db
    .select({ connectionId: publications.connectionId, n: count() })
    .from(publications)
    .where(
      and(
        inArray(publications.connectionId, connectionIds),
        eq(publications.status, "failed"),
        inArray(publications.lastErrorCode, [...ACCOUNT_ERROR_CODES]),
      ),
    )
    .groupBy(publications.connectionId);
  const out = new Map<string, number>();
  for (const r of rows) if (r.connectionId && r.n > 0) out.set(r.connectionId, Number(r.n));
  return out;
}
