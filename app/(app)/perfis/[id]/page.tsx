import { notFound } from "next/navigation";

import { ProfileFeedView } from "@/components/feed/ProfileFeedView";
import { RememberProfile } from "@/components/feed/RememberProfile";
import { getProfileFeed } from "@/lib/profiles/queries";

export default async function PerfilPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const feed = await getProfileFeed(id);
  if (!feed) notFound();

  return (
    <>
      <RememberProfile id={id} />
      <ProfileFeedView feed={feed} />
    </>
  );
}
