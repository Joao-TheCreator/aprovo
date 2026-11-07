import { lt } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalLinkOpens } from "@/db/schema";

/** IP and user agent of link opens are personal data (LGPD): kept 90 days (doc 13 section 8). */
export const OPENS_RETENTION_DAYS = 90;

/** Deletes link opens older than the retention. Returns how many rows were removed. */
export async function purgeLinkOpens(
  now: Date = new Date(),
  retentionDays: number = OPENS_RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  const deleted = await db
    .delete(approvalLinkOpens)
    .where(lt(approvalLinkOpens.openedAt, cutoff))
    .returning({ id: approvalLinkOpens.id });
  return deleted.length;
}
