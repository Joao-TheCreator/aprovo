import { notFound } from "next/navigation";

import { LiveUpdates } from "@/components/feed/LiveUpdates";
import { ProfileFeedView } from "@/components/feed/ProfileFeedView";
import { RememberProfile } from "@/components/feed/RememberProfile";
import { getProfileFeed } from "@/lib/profiles/queries";

export default async function PerfilPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const feed = await getProfileFeed(id);
  if (!feed) notFound();

  const captions: Record<string, string | null> = {};
  for (const item of feed.items) if (item.kind === "planned") captions[item.id] = item.caption;

  return (
    <>
      <LiveUpdates profileId={id} captions={captions} />
      <RememberProfile id={id} />
      <ProfileFeedView feed={feed} />
    </>
  );
}
