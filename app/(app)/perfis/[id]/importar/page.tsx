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
      <h1 className="text-2xl leading-8 font-bold">Importar manualmente @{p.igUsername}</h1>
      <p className="text-muted-foreground text-[15px]">
        Use prints ou os arquivos originais; eles só servem para simular o feed atual.
      </p>
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
