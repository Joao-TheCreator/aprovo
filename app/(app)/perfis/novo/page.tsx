import Link from "next/link";

import { PhoneFrame } from "@/components/app/PhoneFrame";
import { Button } from "@/components/ui/button";
import { isOAuthConfigured } from "@/lib/instagram/oauth";

import { ConnectProfileForm } from "./ConnectProfileForm";

export const metadata = { title: "Conectar conta do Instagram" };

export default async function NovoPerfilPage({
  searchParams,
}: {
  searchParams: Promise<{ manual?: string }>;
}) {
  const { manual } = await searchParams;
  const oauth = isOAuthConfigured();
  const showManual = !oauth || manual === "1";

  return (
    <PhoneFrame className="flex flex-col gap-6">
      <h1 className="text-2xl leading-8 font-bold">Conectar conta do Instagram</h1>
      {oauth ? (
        <section className="flex flex-col gap-3">
          <Button asChild className="self-start">
            {/* API route (redirect to Instagram), not a page: plain anchor is intended. */}
            <a href="/api/instagram/connect">Conectar conta do Instagram</a>
          </Button>
          <p className="text-muted-foreground text-sm">
            A conta precisa ser profissional (Empresa ou Criador). Você autoriza o APROVO uma vez
            por conta.
          </p>
          {showManual ? null : (
            <Link href="/perfis/novo?manual=1" className="text-muted-foreground text-sm underline">
              Importar manualmente
            </Link>
          )}
        </section>
      ) : (
        <p className="text-muted-foreground text-sm">
          A conexão com o Instagram não está configurada neste servidor. Importe o perfil
          manualmente.
        </p>
      )}
      {showManual ? (
        <section className="flex flex-col gap-4">
          {oauth ? <h2 className="text-lg leading-6 font-semibold">Importar manualmente</h2> : null}
          <ConnectProfileForm />
        </section>
      ) : null}
    </PhoneFrame>
  );
}
