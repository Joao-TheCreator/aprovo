import { notFound } from "next/navigation";

import { PhoneFrame } from "@/components/app/PhoneFrame";
import { getProfileFeed } from "@/lib/profiles/queries";

import { ManualImportForm } from "./ManualImportForm";

export default async function ImportarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const feed = await getProfileFeed(id);
  if (!feed) notFound();
  const p = feed.profile;

  return (
    <PhoneFrame className="flex flex-col gap-6">
      <header className="animate-rise flex flex-col gap-2">
        <p className="text-micro text-brand-ink uppercase">@{p.igUsername}</p>
        <h1 className="font-display text-h1 text-balance">Importar manualmente</h1>
        <p className="text-body text-muted-foreground max-w-[40ch]">
          Suba prints ou as fotos originais do perfil. Elas só servem para simular o feed atual do
          cliente.
        </p>
      </header>
      <ManualImportForm
        profileId={id}
        defaults={{
          displayName: p.displayName ?? "",
          biography: p.biography ?? "",
          externalUrl: p.externalUrl ?? "",
          postsCount: p.postsCount,
          followersCount: p.followersCount,
          followingCount: p.followingCount,
        }}
      />
    </PhoneFrame>
  );
}
