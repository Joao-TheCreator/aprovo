import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { instagramConnections } from "@/db/schema";
import { parseSignedRequest } from "@/lib/instagram/signed-request";

export const dynamic = "force-dynamic";

/**
 * Meta "Deauthorize callback": POSTs a form-encoded `signed_request` when a user removes the app.
 * System-level route (no session): authenticity comes from the HMAC with the app secret.
 * Never log the raw request.
 *
 * NOTE: the Meta app currently points deauthorize to /legal/exclusao-de-dados; update it in the
 * Meta dashboard to https://aprovo-six.vercel.app/api/instagram/deauthorize (docs/11).
 */
const formSchema = z.object({ signed_request: z.string().min(1) });

export async function POST(req: NextRequest) {
  const secret = process.env.META_APP_SECRET || process.env.META_FB_APP_SECRET || "";
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const input = formSchema.safeParse({ signed_request: form.get("signed_request") });
  if (!input.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const parsed = parseSignedRequest(input.data.signed_request, secret);
  if (!parsed) return NextResponse.json({ error: "invalid_signature" }, { status: 400 });

  const rows = await db
    .update(instagramConnections)
    .set({
      status: "revoked",
      statusDetail: "Desautorizado pelo usuário",
      statusCheckedAt: new Date(),
    })
    .where(eq(instagramConnections.igUserId, parsed.userId))
    .returning({ id: instagramConnections.id });
  console.info(`[instagram] deauthorized connections=${rows.length}`);
  return NextResponse.json({ ok: true });
}
