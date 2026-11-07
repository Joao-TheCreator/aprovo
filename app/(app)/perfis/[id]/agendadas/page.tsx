import { ArrowLeft } from "lucide-react";
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
    <PhoneFrame className="flex flex-col gap-8">
      <LiveUpdates profileId={id} />
      <div className="flex flex-col gap-2">
        <Link
          href={`/perfis/${id}`}
          className="press text-brand-ink text-caption focus-visible:ring-ring -ml-1 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-full px-1 outline-none focus-visible:ring-2"
        >
          <ArrowLeft aria-hidden className="size-4" />@{feed.profile.igUsername}
        </Link>
        <h1 className="font-display text-h1">Agendadas</h1>
        <p className="text-body text-muted-foreground">
          O que vai sair, o que já saiu e o que travou no caminho.
        </p>
      </div>
      <ScheduledList profileId={id} lists={lists} />
    </PhoneFrame>
  );
}
