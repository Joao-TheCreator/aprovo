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
    <PhoneFrame className="flex flex-col gap-5">
      <LiveUpdates profileId={id} />
      <div>
        <Link
          href={`/perfis/${id}`}
          className="text-roxo focus-visible:ring-ring/50 inline-flex min-h-11 items-center rounded text-sm font-semibold outline-none focus-visible:ring-[3px]"
        >
          ← @{feed.profile.igUsername}
        </Link>
        <h1 className="text-2xl leading-8 font-bold">Envios para aprovação</h1>
      </div>
      <ApprovalList requests={requests} feedHref={`/perfis/${id}`} />
    </PhoneFrame>
  );
}
