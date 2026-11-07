import { NextResponse, type NextRequest } from "next/server";
import { getCurrentWorkspace, requireUser } from "@/lib/auth/require";
import {
  OAuthError,
  PROVIDER_COOKIE,
  STATE_COOKIE,
  activeOAuthProvider,
  completeOAuth,
  isOAuthConfigured,
  statesMatch,
} from "@/lib/instagram/oauth";
import { createProfileAndImport } from "@/lib/profiles/from-connection";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/configuracoes?${q}`, req.url));
    res.cookies.delete(STATE_COOKIE);
    res.cookies.delete(PROVIDER_COOKIE);
    return res;
  };
  const params = req.nextUrl.searchParams;

  // Instagram and Facebook both send error / error_reason / error_description on denial.
  if (params.get("error") || params.get("error_reason") || params.get("error_description")) {
    return back("error=denied");
  }
  if (!isOAuthConfigured()) return back("error=not_configured");
  if (!statesMatch(req.cookies.get(STATE_COOKIE)?.value, params.get("state"))) {
    return back("error=state_mismatch");
  }
  const cookieProvider = req.cookies.get(PROVIDER_COOKIE)?.value;
  const provider =
    cookieProvider === "facebook" || cookieProvider === "instagram"
      ? cookieProvider
      : (activeOAuthProvider() ?? "instagram");
  // Instagram appends "#_" to the code; it is not part of it.
  const code = params.get("code")?.replace(/#_$/, "");
  if (!code) return back("error=exchange_failed");

  const ws = await getCurrentWorkspace(user.id!);
  if (!ws) return back("error=exchange_failed");

  let connection;
  try {
    connection = await completeOAuth({ code, workspaceId: ws.id, userId: user.id!, provider });
  } catch (e) {
    if (e instanceof OAuthError && e.code === "no_instagram_page") {
      return back("error=no_instagram_page");
    }
    console.error(
      "[instagram] oauth callback failed:",
      e instanceof OAuthError ? e.message : e instanceof Error ? e.name : "unknown",
    );
    return back("error=exchange_failed");
  }

  // ADR-009: every connected account becomes a profile, imported with its own token.
  try {
    const { profileId } = await createProfileAndImport(connection);
    const res = NextResponse.redirect(new URL(`/perfis/${profileId}?connected=1`, req.url));
    res.cookies.delete(STATE_COOKIE);
    res.cookies.delete(PROVIDER_COOKIE);
    return res;
  } catch (e) {
    console.error("[instagram] profile creation failed:", e instanceof Error ? e.name : "unknown");
    return back("connected=1");
  }
}
