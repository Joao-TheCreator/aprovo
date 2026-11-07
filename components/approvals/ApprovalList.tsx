import { Inbox } from "lucide-react";
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
        icon={Inbox}
        eyebrow="Aprovações"
        title="Ninguém te devendo resposta."
        description="Quando você enviar um link, ele aparece aqui."
      >
        <Button asChild>
          <Link href={feedHref}>Ir para o feed</Link>
        </Button>
      </EmptyState>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {requests.map((r, i) => (
        <li
          key={r.id}
          className="animate-rise"
          style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
        >
          <ApprovalRequestCard request={r} showProfile={showProfile} />
        </li>
      ))}
    </ul>
  );
}
