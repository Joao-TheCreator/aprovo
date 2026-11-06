import postgres from "postgres";
import type { LiveEvent } from "@/lib/approvals/contracts";
import { EVENTS_CHANNEL } from "./events";

/** Opens a dedicated connection LISTENing on aprovo_events; returns a stop function. */
export async function listenEvents(
  profileId: string,
  onEvent: (e: LiveEvent) => void,
): Promise<() => Promise<void>> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const client = postgres(url, { max: 1, prepare: false });
  try {
    await client.listen(EVENTS_CHANNEL, (raw) => {
      try {
        const ev = JSON.parse(raw) as LiveEvent;
        if (ev.profileId === profileId) onEvent(ev);
      } catch {
        /* ignore malformed payloads */
      }
    });
  } catch (e) {
    await client.end({ timeout: 1 }).catch(() => undefined);
    throw e;
  }
  return async () => {
    await client.end({ timeout: 1 }).catch(() => undefined);
  };
}
