import { ArrowLeft, MailCheck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { AuthScreen } from "../_components/AuthScreen";

export const metadata = { title: "Olha seu e-mail · APROVO" };

export default function VerificarPage() {
  return (
    <AuthScreen>
      <span
        aria-hidden
        className="bg-gradient-brand text-on-brand shadow-glow animate-success-pop flex size-14 items-center justify-center rounded-2xl"
      >
        <MailCheck className="size-7" strokeWidth={2} />
      </span>
      <div className="space-y-2">
        <h1 className="font-display text-h2">Olha seu e-mail</h1>
        <p className="text-body text-muted-foreground">
          Mandamos um link de acesso. Toque nele para entrar. Ele vale por 24 horas.
        </p>
        <p className="text-body text-muted-foreground">
          Não chegou em alguns minutos? Confere o spam ou peça outro.
        </p>
      </div>
      <Button asChild variant="secondary" className="w-full">
        <Link href="/entrar">
          <ArrowLeft />
          Usar outro e-mail
        </Link>
      </Button>
    </AuthScreen>
  );
}
