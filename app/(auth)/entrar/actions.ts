"use server";

import { AuthError } from "next-auth";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { signIn } from "@/lib/auth";
import { sessionCookieName, signInReviewer } from "@/lib/auth/reviewer";

const emailSchema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email()) });

export async function signInWithEmail(formData: FormData) {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) redirect("/entrar?error=InvalidEmail");
  try {
    await signIn("resend", { email: parsed.data.email, redirectTo: "/perfis" });
  } catch (e) {
    // signIn throws a redirect on success; only AuthError is a real failure.
    if (e instanceof AuthError) redirect("/entrar?error=EmailSignin");
    throw e;
  }
}

export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/perfis" });
}

const reviewerSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(200),
  password: z.string().min(1).max(200),
});

/** Reviewer access for the Meta App Review (docs/10 §9). Issues an Auth.js database session. */
export async function signInAsReviewer(formData: FormData) {
  const parsed = reviewerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/entrar?error=ReviewerSignin");
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const result = await signInReviewer(db, { ...parsed.data, ip });
  if (!result.ok) {
    redirect(
      `/entrar?error=${result.code === "rate_limited" ? "ReviewerRateLimited" : "ReviewerSignin"}`,
    );
  }
  const jar = await cookies();
  jar.set(sessionCookieName(), result.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: sessionCookieName().startsWith("__Secure-"),
    path: "/",
    expires: result.expires,
  });
  redirect("/perfis");
}
