import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextResponse, type NextRequest } from "next/server";
import {
  assertSafeKey,
  LocalStorage,
  verifyPutSignature,
  verifySignature,
} from "@/lib/storage/local";

export const runtime = "nodejs";

const MAX_PUT_BYTES = 300 * 1024 * 1024;

type Ctx = { params: Promise<{ key: string[] }> };

/** Serves files of the local storage driver, only with a valid signed URL. */
export async function GET(req: NextRequest, ctx: Ctx) {
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

/** Direct upload for the local driver. Requires an op=put signature from getSignedUploadUrl. */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  try {
    assertSafeKey(key);
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  if (sp.get("op") !== "put" || !verifyPutSignature(key, sp.get("exp"), sp.get("sig"))) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_PUT_BYTES) return new NextResponse("Payload too large", { status: 413 });
  if (!req.body) return new NextResponse("Empty body", { status: 400 });

  const storage = new LocalStorage();
  const file = storage.resolvePath(key);
  const tmp = `${file}.${process.pid}.part`;
  await fs.mkdir(path.dirname(file), { recursive: true });

  let received = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      received += chunk.length;
      if (received > MAX_PUT_BYTES) cb(new Error("too_large"));
      else cb(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(req.body as import("node:stream/web").ReadableStream),
      limiter,
      createWriteStream(tmp),
    );
  } catch (e) {
    await fs.rm(tmp, { force: true });
    if (e instanceof Error && e.message === "too_large") {
      return new NextResponse("Payload too large", { status: 413 });
    }
    return new NextResponse("Upload failed", { status: 500 });
  }
  await fs.rename(tmp, file);
  await storage.writeMeta(key, req.headers.get("content-type") || "application/octet-stream");
  return new NextResponse(null, { status: 204 });
}
