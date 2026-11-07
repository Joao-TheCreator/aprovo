import { ArrowLeft, AtSign, ChevronRight, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";

import { PhoneFrame } from "@/components/app/PhoneFrame";
import { Button } from "@/components/ui/button";
import { Card, cardVariants } from "@/components/ui/card";
import { Press } from "@/components/ui/press";
import { isOAuthConfigured } from "@/lib/instagram/oauth";
import { cn } from "@/lib/utils";

import { ConnectProfileForm } from "./ConnectProfileForm";

export const metadata = { title: "Conectar conta do Instagram" };

const OAUTH_STEPS = [
  "Toque em conectar",
  "Autorize no Instagram, uma vez por conta",
  "O feed chega sozinho",
];

function IconTile({ icon: Icon, tone }: { icon: typeof Zap; tone: "brand" | "soft" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-2xl",
        tone === "brand"
          ? "bg-gradient-brand text-on-brand shadow-glow"
          : "bg-brand-soft text-brand-ink",
      )}
    >
      <Icon className="size-6" strokeWidth={2} />
    </span>
  );
}

export default async function NovoPerfilPage({
  searchParams,
}: {
  searchParams: Promise<{ manual?: string }>;
}) {
  const { manual } = await searchParams;
  const oauth = isOAuthConfigured();
  const showManual = !oauth || manual === "1";

  return (
    <PhoneFrame className="flex flex-col gap-8">
      <header className="animate-rise flex flex-col gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-3 self-start">
          <Link href="/perfis">
            <ArrowLeft aria-hidden />
            Perfis
          </Link>
        </Button>
        <p className="text-micro text-brand-ink uppercase">Novo perfil</p>
        <h1 className="font-display text-h1 text-balance">
          Conectar conta do <span className="text-gradient-brand">Instagram</span>
        </h1>
        <p className="text-body text-muted-foreground max-w-[40ch]">
          Escolha o caminho. Em menos de um minuto o feed do cliente está na sua mão.
        </p>
      </header>

      {oauth ? (
        <Card variant="glow" className="animate-rise gap-5 [animation-delay:40ms]">
          <div className="flex items-center gap-3">
            <IconTile icon={Zap} tone="brand" />
            <div className="flex min-w-0 flex-col">
              <h2 className="font-display text-h2">Pela API oficial</h2>
              <p className="text-caption text-muted-foreground">
                Recomendado. Feed, publicação e tudo sincronizado.
              </p>
            </div>
          </div>
          <ol className="flex flex-col gap-3">
            {OAUTH_STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="font-display bg-surface-2 text-brand-ink flex size-9 shrink-0 items-center justify-center rounded-full text-sm"
                >
                  {i + 1}
                </span>
                <span className="text-body font-medium">{step}</span>
              </li>
            ))}
          </ol>
          <Button asChild size="lg" className="w-full">
            {/* API route (redirect to Instagram), not a page: plain anchor is intended. */}
            <a href="/api/instagram/connect">Conectar conta do Instagram</a>
          </Button>
          <p className="text-caption text-muted-foreground flex items-start gap-2 font-medium">
            <ShieldCheck aria-hidden className="text-success-ink mt-px size-4 shrink-0" />A conta
            precisa ser profissional (Empresa ou Criador). Você autoriza o APROVO uma vez por conta.
          </p>
        </Card>
      ) : (
        <Card variant="flat" className="animate-rise gap-2">
          <p className="text-title">Conexão pela API desligada</p>
          <p className="text-body text-muted-foreground">
            A conexão com o Instagram não está configurada neste servidor. Importe o perfil
            manualmente.
          </p>
        </Card>
      )}

      {showManual ? (
        <Card className="animate-rise gap-5 [animation-delay:80ms]">
          <div className="flex items-center gap-3">
            <IconTile icon={AtSign} tone="soft" />
            <div className="flex min-w-0 flex-col">
              <h2 className="font-display text-h2">Importar manualmente</h2>
              <p className="text-caption text-muted-foreground">
                Só o @ de uma conta pública. Sem senha.
              </p>
            </div>
          </div>
          <ConnectProfileForm />
        </Card>
      ) : (
        <Press asChild scale="sm">
          <Link
            href="/perfis/novo?manual=1"
            className={cn(
              cardVariants({ variant: "default" }),
              "animate-rise hover:border-outline-strong focus-visible:ring-ring focus-visible:ring-offset-background flex-row items-center gap-3 transition-[transform,border-color] outline-none [animation-delay:80ms] focus-visible:ring-2 focus-visible:ring-offset-2",
            )}
          >
            <IconTile icon={AtSign} tone="soft" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-title">Importar manualmente</span>
              <span className="text-caption text-muted-foreground">
                Só o @ de uma conta pública. Sem senha.
              </span>
            </span>
            <ChevronRight aria-hidden className="text-muted-foreground size-5 shrink-0" />
          </Link>
        </Press>
      )}
    </PhoneFrame>
  );
}
