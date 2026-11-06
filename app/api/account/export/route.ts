import { auth } from "@/lib/auth";
import { buildExport } from "@/lib/account/export";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const data = await buildExport(session.user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": "attachment; filename=aprovo-export.json",
      "Cache-Control": "no-store",
    },
  });
}
