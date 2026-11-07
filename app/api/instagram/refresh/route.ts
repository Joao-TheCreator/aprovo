import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { purgeLinkOpens } from "@/lib/approvals/purge";
import { checkAllConnections, refreshExpiringConnections } from "@/lib/instagram/oauth";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Vercel cron sends `Authorization: Bearer $CRON_SECRET`; manual calls use x-cron-secret.
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
  const refresh = await refreshExpiringConnections();
  const health = await checkAllConnections();
  // Weekly housekeeping (docs/13 §8): approval link opens older than the retention window.
  let purgedOpens = 0;
  try {
    purgedOpens = await purgeLinkOpens();
  } catch (e) {
    console.warn(
      "[approvals] purge of link opens skipped:",
      e instanceof Error ? e.name : "unknown",
    );
  }
  return NextResponse.json({ ...refresh, ...health, purgedOpens });
}
