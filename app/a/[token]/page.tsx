import type { Metadata } from "next";

import { InactiveLinkCard } from "@/components/approvals/InactiveLinkCard";
import { PublicApprovalView } from "@/components/approvals/PublicApprovalView";
import { getPublicApproval } from "@/lib/approvals/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await getPublicApproval(token);
  if (data.linkState !== "active" || !data.request || !data.profile) {
    return { title: "Aprovação de publicações", robots: { index: false, follow: false } };
  }
  const n = data.items.length;
  const title = `Aprovação de publicações · @${data.profile.igUsername}`;
  const description = `${data.request.senderName} enviou ${n} ${n === 1 ? "publicação" : "publicações"} para sua aprovação`;
  const image = data.items[0]?.media[0]?.previewUrl ?? data.items[0]?.media[0]?.thumbUrl ?? null;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, ...(image ? { images: [{ url: image }] } : {}) },
  };
}

export default async function ApprovalLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getPublicApproval(token, { recordOpen: true });
  if (data.linkState !== "active" || !data.request || !data.profile) return <InactiveLinkCard />;
  return <PublicApprovalView token={token} data={data} />;
}
