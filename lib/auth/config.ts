import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";

export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

/**
 * Providers and pages only, NO adapter. lib/auth/index.ts spreads it and adds the
 * Drizzle adapter. Kept separate so it can be reused without a DB driver.
 */
export const authConfig = {
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM ?? "APROVO <onboarding@resend.dev>",
    }),
    ...(googleEnabled ? [Google] : []),
  ],
  pages: { signIn: "/entrar", verifyRequest: "/verificar" },
} satisfies NextAuthConfig;
