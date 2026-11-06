"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { PhoneFrame } from "@/components/app/PhoneFrame";
import { FeedGrid } from "@/components/feed/FeedGrid";
import { FeedToolbar } from "@/components/feed/FeedToolbar";
import { InstagramHeader } from "@/components/feed/InstagramHeader";
import { PostSheet } from "@/components/feed/PostSheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { FeedItem, GridRatio, ProfileFeed } from "@/lib/profiles/contracts";
import { refreshProfile } from "@/lib/profiles/actions";

export function ProfileFeedView({ feed }: { feed: ProfileFeed }) {
  const { profile, items, canRefresh } = feed;
  const router = useRouter();
  const [ratio, setRatio] = useState<GridRatio>(profile.gridRatio);
  const [clientMode, setClientMode] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [selected, setSelected] = useState<FeedItem | null>(null);
  const [retrying, startRetry] = useTransition();

  const hasHidden = items.some((i) => i.kind === "imported" && i.isHidden);
  const visible = useMemo(
    () =>
      items.filter((i) => !(i.kind === "imported" && i.isHidden) || (showHidden && !clientMode)),
    [items, showHidden, clientMode],
  );

  function retry() {
    startRetry(async () => {
      const res = await refreshProfile(profile.id, { force: true });
      if (res.ok) toast.success("Feed atualizado");
      else toast.error(res.message);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <FeedToolbar
        profileId={profile.id}
        ratio={ratio}
        onRatioChange={setRatio}
        canRefresh={canRefresh}
        clientMode={clientMode}
        onClientModeChange={setClientMode}
        hasHidden={hasHidden}
        showHidden={showHidden}
        onShowHiddenChange={setShowHidden}
      />

      {profile.importStatus === "failed" ? (
        <PhoneFrame>
          <div role="alert" className="bg-lavanda flex flex-col gap-3 rounded-2xl p-4">
            <p className="text-[15px]">
              {profile.importError ?? "Não conseguimos importar o feed."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={retry} disabled={retrying}>
                Tentar de novo
              </Button>
              <Button asChild variant="outline">
                <Link href={`/perfis/${profile.id}/importar`}>Importar manualmente</Link>
              </Button>
            </div>
          </div>
        </PhoneFrame>
      ) : null}

      <PhoneFrame className="font-instagram border-border overflow-hidden bg-white text-black md:rounded-2xl md:border">
        <InstagramHeader profile={profile} />
        {profile.importStatus === "importing" ? (
          <div className="grid grid-cols-3 gap-0.5" role="status" aria-label="Importando o feed">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton
                key={i}
                className={`rounded-none ${ratio === "3:4" ? "aspect-[3/4]" : "aspect-square"}`}
              />
            ))}
          </div>
        ) : (
          <FeedGrid items={visible} ratio={ratio} showStatus={!clientMode} onOpen={setSelected} />
        )}
      </PhoneFrame>

      <PostSheet item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
