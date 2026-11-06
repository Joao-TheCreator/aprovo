import { NextResponse, type NextRequest } from "next/server";
import { assertSafeKey, LocalStorage, verifySignature } from "@/lib/storage/local";

export const runtime = "nodejs";

/** Serves files of the local storage driver, only with a valid signed URL. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  const forbidden = () => new NextResponse("Forbidden", { status: 403 });
  try {
    assertSafeKey(key);
  } catch {
    return forbidden();
  }
  const sp = req.nextUrl.searchParams;
  if (!verifySignature(key, sp.get("exp"), sp.get("sig"))) return forbidden();

  const obj = await new LocalStorage().getObject(key);
  if (!obj) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(obj.body), {
    headers: {
      "Content-Type": obj.contentType,
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(obj.body.length),
    },
  });
}
