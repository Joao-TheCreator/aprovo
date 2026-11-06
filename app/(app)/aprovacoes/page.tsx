import { PhoneFrame } from "@/components/app/PhoneFrame";
import { ApprovalList } from "@/components/approvals/ApprovalList";
import { listApprovalRequests } from "@/lib/approvals/queries";

export const metadata = { title: "Aprovações" };

export default async function AprovacoesPage() {
  const requests = await listApprovalRequests();
  return (
    <PhoneFrame className="flex flex-col gap-6">
      <h1 className="text-2xl leading-8 font-bold">Aprovações</h1>
      <ApprovalList requests={requests} showProfile feedHref="/perfis" />
    </PhoneFrame>
  );
}
