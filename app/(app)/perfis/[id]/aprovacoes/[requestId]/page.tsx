import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PhoneFrame } from "@/components/app/PhoneFrame";
import { ApprovalRequestCard } from "@/components/approvals/ApprovalRequestCard";
import { LiveUpdates } from "@/components/feed/LiveUpdates";
import { getApprovalRequest } from "@/lib/approvals/queries";

export const metadata = { title: "Envio" };

export default async function EnvioPage({
  params,
}: {
  params: Promise<{ id: string; requestId: string }>;
}) {
  const { id, requestId } = await params;
  const request = await getApprovalRequest(requestId);
  if (!request || request.profile.id !== id) notFound();

  return (
    <PhoneFrame className="flex flex-col gap-4 pb-8">
      <LiveUpdates profileId={id} />
      <Link
        href={`/perfis/${id}/aprovacoes`}
        className="text-brand-ink focus-visible:ring-ring -ml-1 inline-flex min-h-11 items-center gap-1 self-start rounded-full px-1 text-sm font-bold outline-none focus-visible:ring-2"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Envios
      </Link>
      <ApprovalRequestCard request={request} showProfile defaultExpanded />
    </PhoneFrame>
  );
}
