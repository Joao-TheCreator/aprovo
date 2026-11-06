"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/lib/auth";

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
