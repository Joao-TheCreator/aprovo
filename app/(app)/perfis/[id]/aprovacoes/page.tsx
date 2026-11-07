import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PhoneFrame } from "@/components/app/PhoneFrame";
import { ApprovalList } from "@/components/approvals/ApprovalList";
import { LiveUpdates } from "@/components/feed/LiveUpdates";
import { listApprovalRequests } from "@/lib/approvals/queries";
import { getProfileFeed } from "@/lib/profiles/queries";

export const metadata = { title: "Envios para aprovação" };

export default async function PerfilAprovacoesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const feed = await getProfileFeed(id);
  if (!feed) notFound();
  const requests = await listApprovalRequests(id);

  return (
    <PhoneFrame className="flex flex-col gap-6 pb-8">
      <LiveUpdates profileId={id} />
      <div className="flex flex-col gap-2">
        <Link
          href={`/perfis/${id}`}
          className="text-brand-ink focus-visible:ring-ring -ml-1 inline-flex min-h-11 items-center gap-1 self-start rounded-full px-1 text-sm font-bold outline-none focus-visible:ring-2"
        >
          <ArrowLeft aria-hidden className="size-4" />@{feed.profile.igUsername}
        </Link>
        <h1 className="font-display text-h1 text-balance">Envios</h1>
        <p className="text-body text-muted-foreground">Quem abriu, quem decidiu e o que falta.</p>
      </div>
      <ApprovalList requests={requests} feedHref={`/perfis/${id}`} />
    </PhoneFrame>
  );
}
