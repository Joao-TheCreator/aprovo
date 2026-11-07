import { isIP } from "node:net";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

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
  const noindex = { index: false, follow: false };
  if (
    (data.linkState !== "active" && data.linkState !== "used") ||
    !data.request ||
    !data.profile
  ) {
    return { title: "Aprovação de publicações", robots: noindex };
  }
  if (data.linkState === "used") {
    return { title: `Aprovação registrada · @${data.profile.igUsername}`, robots: noindex };
  }
  const n = data.items.length;
  const title = `Aprovação de publicações · @${data.profile.igUsername}`;
  const description = `${data.request.senderName} enviou ${n} ${n === 1 ? "publicação" : "publicações"} para sua aprovação`;
  const image = data.items[0]?.media[0]?.previewUrl ?? data.items[0]?.media[0]?.thumbUrl ?? null;
  return {
    title,
    description,
    robots: noindex,
    openGraph: { title, description, ...(image ? { images: [{ url: image }] } : {}) },
  };
}

export default async function ApprovalLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const rawIp = h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const data = await getPublicApproval(token, {
    recordOpen: true,
    ip: rawIp && isIP(rawIp) ? rawIp : null,
    userAgent: h.get("user-agent"),
  });
  if (data.linkState === "not_found") notFound();
  if (data.linkState === "expired") return <InactiveLinkCard reason="expired" />;
  if (data.linkState === "revoked") return <InactiveLinkCard reason="revoked" />;
  if (!data.request || !data.profile) return <InactiveLinkCard reason="inactive" />;
  // The key remounts the view when a refresh turns an active link into a used one.
  return <PublicApprovalView key={data.linkState} token={token} data={data} />;
}
