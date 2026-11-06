import Link from "next/link";

import { EmptyState } from "@/components/app/EmptyState";
import { ApprovalRequestCard } from "@/components/approvals/ApprovalRequestCard";
import { Button } from "@/components/ui/button";
import type { ApprovalRequestSummary } from "@/lib/approvals/contracts";

export function ApprovalList({
  requests,
  showProfile,
  feedHref,
}: {
  requests: ApprovalRequestSummary[];
  showProfile?: boolean;
  feedHref: string;
}) {
  if (requests.length === 0) {
    return (
      <EmptyState
        title="Nenhum envio ainda"
        description="Quando você enviar publicações para o cliente aprovar, elas aparecem aqui."
      >
        <Button asChild>
          <Link href={feedHref}>Ir para o feed</Link>
        </Button>
      </EmptyState>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {requests.map((r) => (
        <li key={r.id}>
          <ApprovalRequestCard request={r} showProfile={showProfile} />
        </li>
      ))}
    </ul>
  );
}
