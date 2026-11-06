import type { Database } from "@/db/client";
import { activityLog } from "@/db/schema";

/** A Drizzle transaction handle (first arg of `db.transaction` callbacks). */
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type ActivityActor = `user:${string}` | `link:${string}`;

export async function logActivity(
  conn: Database | Tx,
  entry: {
    profileId: string;
    actor: ActivityActor;
    event: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await conn.insert(activityLog).values({
    profileId: entry.profileId,
    actor: entry.actor,
    event: entry.event,
    payload: entry.payload ?? null,
  });
}
