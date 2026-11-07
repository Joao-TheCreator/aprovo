import type { BrowserContext } from "@playwright/test";
import { SESSION_COOKIE_NAME, type Scenario } from "./seed";

/** Logs the context in as the scenario's user by planting the Auth.js database-session cookie. */
export async function signIn(context: BrowserContext, s: Scenario): Promise<void> {
  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: s.sessionToken,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 86_400,
    },
  ]);
}
