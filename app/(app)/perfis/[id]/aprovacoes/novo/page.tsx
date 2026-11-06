import { notFound } from "next/navigation";

import { SendForApprovalForm, type CandidatePost } from "@/components/approvals/SendForApprovalForm";
import { getProfileFeed } from "@/lib/profiles/queries";

export const metadata = { title: "Enviar para aprovação" };

export default async function NovoEnvioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ posts?: string }>;
}) {
  const { id } = await params;
  const { posts } = await searchParams;
  const feed = await getProfileFeed(id);
  if (!feed) notFound();

  const candidates: CandidatePost[] = feed.items.flatMap((item) =>
    item.kind === "planned" && (item.status === "draft" || item.status === "changes_requested")
      ? [
          {
            id: item.id,
            thumbUrl: item.thumbUrl,
            caption: item.caption,
            status: item.status,
            gridCrop: item.gridCrop,
          },
        ]
      : [],
  );
  const wanted = new Set((posts ?? "").split(",").filter(Boolean));
  const preselected = candidates.filter((c) => wanted.has(c.id)).map((c) => c.id);

  return (
    <SendForApprovalForm
      profileId={id}
      igUsername={feed.profile.igUsername}
      ratio={feed.profile.gridRatio}
      candidates={candidates}
      preselected={preselected}
    />
  );
}
