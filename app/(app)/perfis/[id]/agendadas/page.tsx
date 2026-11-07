import Link from "next/link";
import { notFound } from "next/navigation";

import { PhoneFrame } from "@/components/app/PhoneFrame";
import { LiveUpdates } from "@/components/feed/LiveUpdates";
import { ScheduledList } from "@/components/publishing/ScheduledList";
import { getProfileFeed } from "@/lib/profiles/queries";
import { listPublications } from "@/lib/publishing/queries";

export const metadata = { title: "Agendadas" };

export default async function PerfilAgendadasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const feed = await getProfileFeed(id);
  if (!feed) notFound();
  const lists = await listPublications(id);

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
        <h1 className="text-2xl leading-8 font-bold">Agendadas</h1>
      </div>
      <ScheduledList profileId={id} lists={lists} />
    </PhoneFrame>
  );
}
