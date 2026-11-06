import Link from "next/link";

import { EmptyState } from "@/components/app/EmptyState";
import { PhoneFrame } from "@/components/app/PhoneFrame";
import { Button } from "@/components/ui/button";

export default function PerfisPage() {
  return (
    <PhoneFrame className="flex flex-col gap-6">
      <h1 className="text-2xl leading-8 font-bold">Perfis</h1>
      <EmptyState
        title="Conecte o primeiro perfil"
        description="Digite o @ do Instagram do seu cliente para carregar o feed. Apenas contas públicas."
      >
        <Button asChild>
          <Link href="/perfis/novo">Conectar perfil</Link>
        </Button>
      </EmptyState>
    </PhoneFrame>
  );
}
