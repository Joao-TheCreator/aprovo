import { sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { LiveEvent } from "@/lib/approvals/contracts";
import { EVENTS_CHANNEL } from "./events";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** NOTIFY aprovo_events (payload stays well under the 8000-byte limit; comments are truncated). */
export async function notifyEvent(conn: Database | Tx, event: LiveEvent): Promise<void> {
  let payload = JSON.stringify(event);
  if (payload.length > 7000 && event.type === "post.status" && event.decision) {
    payload = JSON.stringify({
      ...event,
      decision: { ...event.decision, comment: event.decision.comment?.slice(0, 500) ?? null },
    });
  }
  await conn.execute(sql`select pg_notify(${EVENTS_CHANNEL}, ${payload})`);
}
