import { EmptyState } from "@/components/app/EmptyState";
import { PhoneFrame } from "@/components/app/PhoneFrame";

export default function AprovacoesPage() {
  return (
    <PhoneFrame className="flex flex-col gap-6">
      <h1 className="text-2xl leading-8 font-bold">Aprovações</h1>
      <EmptyState
        title="Nenhum envio ainda"
        description="Quando você enviar publicações para o cliente aprovar, elas aparecem aqui."
      />
    </PhoneFrame>
  );
}
