import { NextResponse, type NextRequest } from "next/server";
import { getCurrentWorkspace, requireUser } from "@/lib/auth/require";
import {
  PROVIDER_COOKIE,
  STATE_COOKIE,
  STATE_TTL_SEC,
  activeOAuthProvider,
  buildAuthorizeUrl,
  buildFacebookAuthorizeUrl,
  generateState,
} from "@/lib/instagram/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const ws = await getCurrentWorkspace(user.id!);
  if (!ws) return NextResponse.redirect(new URL("/configuracoes?error=not_configured", req.url));
  const provider = activeOAuthProvider();
  if (!provider) {
    return NextResponse.redirect(new URL("/configuracoes?error=not_configured", req.url));
  }
  const state = generateState();
  const res = NextResponse.redirect(
    provider === "facebook" ? buildFacebookAuthorizeUrl(state) : buildAuthorizeUrl(state),
  );
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: STATE_TTL_SEC,
    path: "/",
  };
  res.cookies.set(STATE_COOKIE, state, options);
  res.cookies.set(PROVIDER_COOKIE, provider, options);
  return res;
}
