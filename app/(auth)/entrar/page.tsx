import { googleEnabled } from "@/lib/auth/config";
import { signInWithEmail, signInWithGoogle } from "./actions";

const ERRORS: Record<string, string> = {
  InvalidEmail: "Informe um e-mail válido.",
  EmailSignin: "Não foi possível enviar o link. Tente novamente em instantes.",
  Verification: "O link expirou ou já foi usado. Peça um novo link de acesso.",
  AccessDenied: "Acesso negado.",
  Configuration: "Erro de configuração do login. Fale com o suporte.",
  OAuthAccountNotLinked: "Este e-mail já usa outra forma de entrada. Entre com o método original.",
};
const DEFAULT_ERROR = "Não foi possível entrar. Tente novamente.";

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; deleted?: string }>;
}) {
  const { error, deleted } = await searchParams;
  const buttonBase =
    "h-12 w-full rounded-full px-6 text-base font-medium transition-opacity hover:opacity-90";

  return (
    <div className="space-y-4">
      <h1 className="text-center text-xl font-semibold">Entrar</h1>
      {deleted === "1" ? (
        <p role="status" className="bg-secondary rounded-2xl px-4 py-3 text-sm">
          Sua conta foi excluída.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="bg-secondary rounded-2xl px-4 py-3 text-sm">
          {ERRORS[error] ?? DEFAULT_ERROR}
        </p>
      ) : null}
      <form action={signInWithEmail} className="space-y-3">
        <label htmlFor="email" className="block text-sm font-medium">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="voce@exemplo.com"
          className="border-border bg-background h-12 w-full rounded-full border px-4 text-base"
        />
        <button type="submit" className={`${buttonBase} bg-primary text-primary-foreground`}>
          Enviar link de acesso
        </button>
      </form>
      {googleEnabled ? (
        <form action={signInWithGoogle}>
          <button type="submit" className={`${buttonBase} bg-secondary border-border border`}>
            Entrar com Google
          </button>
        </form>
      ) : null}
    </div>
  );
}
