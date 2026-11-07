import { Compass, House } from "lucide-react";
import Link from "next/link";

import { Logo } from "@/components/app/Logo";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Página não encontrada" };

export default function NotFound() {
  return (
    <main className="bg-aurora flex min-h-dvh flex-1 flex-col items-center justify-center gap-8 px-4 py-10">
      <Link
        href="/"
        aria-label="APROVO, ir para o início"
        className="focus-visible:ring-ring focus-visible:ring-offset-background flex h-11 items-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <Logo height={32} />
      </Link>
      <div className="bg-card border-border animate-rise relative isolate flex w-full max-w-md flex-col items-center gap-3 overflow-hidden rounded-4xl border px-6 py-10 text-center">
        <div
          aria-hidden
          className="bg-glow pointer-events-none absolute -top-24 left-1/2 -z-10 size-56 -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        />
        <p aria-hidden className="font-display text-display text-gradient-brand">
          404
        </p>
        <h1 className="font-display text-h2 max-w-[18ch] text-balance">
          Esse caminho não leva a nada.
        </h1>
        <p className="text-body text-muted-foreground max-w-[34ch] text-pretty">
          O link pode ter mudado ou expirado. Bora voltar pro começo.
        </p>
        <div className="mt-3 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button asChild>
            <Link href="/">
              <House aria-hidden />
              Ir para o início
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/perfis">
              <Compass aria-hidden />
              Ver perfis
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
