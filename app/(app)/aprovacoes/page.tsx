import { PhoneFrame } from "@/components/app/PhoneFrame";
import { ApprovalList } from "@/components/approvals/ApprovalList";
import { listApprovalRequests } from "@/lib/approvals/queries";

export const metadata = { title: "Aprovações" };

export default async function AprovacoesPage() {
  const requests = await listApprovalRequests();
  return (
    <PhoneFrame className="flex flex-col gap-6 pb-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-h1">Aprovações</h1>
        <p className="text-body text-muted-foreground">
          Tudo que você mandou para os clientes decidirem.
        </p>
      </div>
      <ApprovalList requests={requests} showProfile feedHref="/perfis" />
    </PhoneFrame>
  );
}
