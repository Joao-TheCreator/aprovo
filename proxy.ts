import { NextResponse, type NextRequest } from "next/server";

/**
 * Next 16 proxy (the former middleware.ts). Cheap gate only: with database sessions the
 * proxy cannot validate the session without the adapter, so it just checks that an Auth.js
 * session cookie exists and redirects anonymous requests to /entrar. The real check is
 * requireUser() in lib/auth/require.ts, called by every protected page and action.
 */
const PUBLIC = [
  /^\/entrar(\/|$)/,
  /^\/verificar(\/|$)/,
  /^\/a\//,
  /^\/api\/auth(\/|$)/,
  /^\/api\/files\//, // local storage driver (signed URLs)
  /^\/manifest\.webmanifest$/,
  /^\/icons\//,
  /^\/brand\//,
  /^\/favicon\.ico$/,
];

const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();
  if (SESSION_COOKIES.some((name) => req.cookies.has(name))) return NextResponse.next();
  const url = new URL("/entrar", req.nextUrl);
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

// Run on everything except Next internals and static images; public paths are handled above.
export const config = { matcher: ["/((?!_next/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"] };
