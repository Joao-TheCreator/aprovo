import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { googleEnabled } from "@/lib/auth/config";
import { reviewerLoginEnabled } from "@/lib/auth/reviewer";
import { AuthScreen, GoogleIcon } from "../_components/AuthScreen";
import { signInAsReviewer, signInWithEmail, signInWithGoogle } from "./actions";

const ERRORS: Record<string, string> = {
  InvalidEmail: "Esse e-mail não parece certo. Confere e tenta de novo.",
  EmailSignin: "Não rolou enviar o link. Tenta de novo em instantes.",
  Verification: "Esse link expirou ou já foi usado. Pede um novo aqui embaixo.",
  AccessDenied: "Acesso negado. Se acha que é engano, fala com a gente.",
  Configuration: "O login está com problema de configuração. Avisa o suporte.",
  OAuthAccountNotLinked: "Esse e-mail já entra de outro jeito. Use o método de sempre.",
  ReviewerSignin: "Reviewer login failed: check the e-mail and password provided for the review.",
  ReviewerRateLimited: "Too many attempts. Wait a minute and try again.",
};
const DEFAULT_ERROR = "Não rolou entrar. Tenta de novo.";

export const metadata = { title: "Entrar · APROVO" };

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; deleted?: string }>;
}) {
  const { error, deleted } = await searchParams;

  return (
    <AuthScreen>
      <div className="space-y-1">
        <h1 className="font-display text-h2">Entrar</h1>
        <p className="text-body text-muted-foreground">
          Sem senha: você recebe um link de acesso no e-mail.
        </p>
      </div>

      {deleted === "1" ? (
        <p role="status" className="bg-surface-2 text-body rounded-2xl px-4 py-3">
          Sua conta foi excluída.
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="bg-surface-2 text-body text-danger-ink border-danger-ink/40 rounded-2xl border px-4 py-3"
        >
          {ERRORS[error] ?? DEFAULT_ERROR}
        </p>
      ) : null}

      {googleEnabled ? (
        <>
          <form action={signInWithGoogle}>
            <Button type="submit" variant="secondary" className="w-full">
              <GoogleIcon className="size-5" />
              Entrar com Google
            </Button>
          </form>
          <div className="text-micro text-muted-foreground flex items-center gap-3 uppercase">
            <span aria-hidden className="bg-border h-px flex-1" />
            ou com e-mail
            <span aria-hidden className="bg-border h-px flex-1" />
          </div>
        </>
      ) : null}

      <form action={signInWithEmail} className="space-y-3">
        <label htmlFor="email" className="text-caption block">
          E-mail
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="voce@exemplo.com"
          aria-invalid={error === "InvalidEmail" ? true : undefined}
        />
        <Button type="submit" size="lg" className="w-full">
          Enviar link de acesso
          <ArrowRight />
        </Button>
      </form>

      {reviewerLoginEnabled() ? (
        <details
          className="border-border rounded-2xl border px-4 py-3"
          open={error?.startsWith("Reviewer")}
        >
          <summary className="text-caption text-muted-foreground cursor-pointer select-none">
            Reviewer access (Meta App Review)
          </summary>
          <form action={signInAsReviewer} className="mt-3 space-y-3" lang="en">
            <p className="text-micro text-muted-foreground">
              Use the e-mail and password provided in the review notes.
            </p>
            <label htmlFor="reviewer-email" className="text-caption block">
              E-mail
            </label>
            <Input
              id="reviewer-email"
              name="email"
              type="email"
              required
              autoComplete="username"
              inputMode="email"
            />
            <label htmlFor="reviewer-password" className="text-caption block">
              Password
            </label>
            <Input
              id="reviewer-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
            <Button type="submit" variant="secondary" className="w-full">
              Sign in as reviewer
            </Button>
          </form>
        </details>
      ) : null}
    </AuthScreen>
  );
}
