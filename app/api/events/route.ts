import { and, asc, eq, gt } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import { activityLog } from "@/db/schema";
import { requireWorkspaceForProfile } from "@/lib/auth/require";
import type { LiveEvent } from "@/lib/approvals/contracts";
import { listenEvents } from "@/lib/realtime/listen";
import { toLiveEvent } from "@/lib/realtime/events";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function GET(req: NextRequest) {
  const profileId = req.nextUrl.searchParams.get("profile") ?? "";
  if (!UUID_RE.test(profileId)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    await requireWorkspaceForProfile(profileId);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (req.headers.get("accept")?.includes("text/event-stream")) {
    const enc = new TextEncoder();
    let stop: (() => Promise<void>) | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let closed = false;
    const cleanup = async () => {
      if (closed) return;
      closed = true;
      if (timer) clearInterval(timer);
      await stop?.();
    };
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (chunk: string) => {
          try {
            controller.enqueue(enc.encode(chunk));
          } catch {
            void cleanup();
          }
        };
        req.signal.addEventListener("abort", () => {
          void cleanup().then(() => {
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          });
        });
        try {
          stop = await listenEvents(profileId, (ev) => send(`data: ${JSON.stringify(ev)}\n\n`));
        } catch {
          send("event: error\ndata: {}\n\n");
          controller.close();
          return;
        }
        if (closed) return void (await stop?.());
        send(": connected\n\n");
        timer = setInterval(() => send(": ping\n\n"), 20_000);
      },
      cancel() {
        return cleanup();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  const sinceRaw = req.nextUrl.searchParams.get("since");
  const sinceDate = sinceRaw ? new Date(sinceRaw) : new Date(Date.now() - 60_000);
  const since = Number.isNaN(sinceDate.getTime()) ? new Date(Date.now() - 60_000) : sinceDate;
  const rows = await db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.profileId, profileId), gt(activityLog.createdAt, since)))
    .orderBy(asc(activityLog.createdAt))
    .limit(100);
  const events = rows.flatMap((r): LiveEvent[] => {
    const e = toLiveEvent(r);
    return e ? [e] : [];
  });
  return NextResponse.json({ events, now: new Date().toISOString() });
}
