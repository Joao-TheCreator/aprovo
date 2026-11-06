import { NextResponse, type NextRequest } from "next/server";
import { getCurrentWorkspace, requireUser } from "@/lib/auth/require";
import {
  STATE_COOKIE,
  STATE_TTL_SEC,
  buildAuthorizeUrl,
  generateState,
  isOAuthConfigured,
} from "@/lib/instagram/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const ws = await getCurrentWorkspace(user.id!);
  if (!ws) return NextResponse.redirect(new URL("/configuracoes?error=not_configured", req.url));
  if (!isOAuthConfigured()) {
    return NextResponse.redirect(new URL("/configuracoes?error=not_configured", req.url));
  }
  const state = generateState();
  const res = NextResponse.redirect(buildAuthorizeUrl(state));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: STATE_TTL_SEC,
    path: "/",
  });
  return res;
}
