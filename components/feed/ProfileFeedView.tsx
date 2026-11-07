"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { PhoneFrame } from "@/components/app/PhoneFrame";
import { AddPostFab } from "@/components/feed/AddPostFab";
import { FeedGrid } from "@/components/feed/FeedGrid";
import { FeedToolbar } from "@/components/feed/FeedToolbar";
import { InstagramHeader } from "@/components/feed/InstagramHeader";
import { PostSheet } from "@/components/feed/PostSheet";
import { SelectionBar } from "@/components/feed/SelectionBar";
import { StatusFilter, type StatusFilterValue } from "@/components/feed/StatusFilter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { FeedItem, GridRatio, ProfileFeed } from "@/lib/profiles/contracts";
import { refreshProfile } from "@/lib/profiles/actions";
import { bulkArchivePosts, bulkDeletePosts, reorderPosts } from "@/lib/posts/actions";
import { applyOrder } from "@/lib/posts/reorder";

/** Message of the banner shown while the linked Instagram connection is not active (docs/12 section 7). */
function connectionBannerText(status: string, username: string): string {
  switch (status) {
    case "missing_scope":
      return "Reconecte e autorize 'Publicar conteúdo'.";
    case "not_professional":
      return `A conta @${username} deixou de ser profissional. Mude para Criador ou Empresa e reconecte.`;
    default:
      return `O Instagram @${username} desconectou. Reconecte para continuar publicando.`;
  }
}

export function ProfileFeedView({ feed }: { feed: ProfileFeed }) {
  const { profile, items: serverItems, canRefresh } = feed;
  const router = useRouter();
  const [ratio, setRatio] = useState<GridRatio>(profile.gridRatio);
  const [clientMode, setClientMode] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [selected, setSelected] = useState<FeedItem | null>(null);
  const [retrying, startRetry] = useTransition();
  const [saving, startSaving] = useTransition();
  const [filter, setFilter] = useState<StatusFilterValue>("all");
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Optimistic order of planned ids; dropped whenever fresh server data arrives.
  const [order, setOrder] = useState<string[] | null>(null);
  const [seenItems, setSeenItems] = useState(serverItems);
  if (seenItems !== serverItems) {
    setSeenItems(serverItems);
    setOrder(null);
    setSelectedIds((prev) => {
      const alive = new Set(serverItems.map((i) => i.id));
      return new Set([...prev].filter((id) => alive.has(id)));
    });
  }
  const items = useMemo(() => {
    if (!order) return serverItems;
    const planned = serverItems.filter((i) => i.kind === "planned");
    const rest = serverItems.filter((i) => i.kind !== "planned");
    return [...applyOrder(planned, order), ...rest];
  }, [serverItems, order]);

  const counts = useMemo(() => {
    const c: Record<StatusFilterValue, number> = {
      all: 0,
      draft: 0,
      pending_approval: 0,
      approved: 0,
      changes_requested: 0,
      scheduled: 0,
      published: 0,
      publish_failed: 0,
    };
    for (const i of items) {
      if (i.kind !== "planned") continue;
      c.all++;
      c[i.status]++;
    }
    return c;
  }, [items]);

  const hasHidden = items.some((i) => i.kind === "imported" && i.isHidden);
  const visible = useMemo(
    () =>
      items.filter((i) => {
        if (i.kind === "imported") return !i.isHidden || (showHidden && !clientMode);
        return clientMode || filter === "all" || i.status === filter;
      }),
    [items, showHidden, clientMode, filter],
  );

  const selectionActive = selecting && !clientMode;

  function setSelectingMode(v: boolean) {
    setSelecting(v);
    if (!v) setSelectedIds(new Set());
  }

  function handleOpen(item: FeedItem) {
    if (selectionActive && item.kind === "planned") {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
      return;
    }
    setSelected(item);
  }

  function persistOrder(next: string[], prev: string[]) {
    setOrder(next);
    startSaving(async () => {
      const res = await reorderPosts(profile.id, next);
      if (!res.ok) {
        setOrder(prev);
        toast.error(res.message);
        if (res.code === "stale_order") router.refresh();
        return;
      }
      toast.success("Ordem salva", {
        duration: 5000,
        action: {
          label: "Desfazer",
          onClick: () => {
            setOrder(prev);
            void reorderPosts(profile.id, prev).then((r) => {
              if (!r.ok) {
                setOrder(next);
                toast.error(r.message);
              } else router.refresh();
            });
          },
        },
      });
      router.refresh();
    });
  }

  function bulk(kind: "archive" | "delete") {
    const ids = [...selectedIds];
    startSaving(async () => {
      const res =
        kind === "archive" ? await bulkArchivePosts(ids, true) : await bulkDeletePosts(ids);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(kind === "archive" ? "Publicações arquivadas" : "Publicações excluídas");
      setSelectingMode(false);
      router.refresh();
    });
  }

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
        selecting={selectionActive}
        onSelectingChange={setSelectingMode}
      />
      {!clientMode && counts.all > 0 ? (
        <StatusFilter value={filter} onChange={setFilter} counts={counts} />
      ) : null}

      {profile.importSource === "graph_api" && !profile.connectionId && !canRefresh ? (
        <PhoneFrame>
          <p role="status" className="bg-lavanda rounded-2xl px-4 py-3 text-sm">
            Conta do Instagram desconectada. Reconecte em{" "}
            <Link href="/configuracoes" className="font-semibold underline">
              Configurações
            </Link>
            .
          </p>
        </PhoneFrame>
      ) : null}

      {profile.connectionStatus && profile.connectionStatus !== "active" ? (
        <PhoneFrame>
          <p role="status" className="bg-lavanda rounded-2xl px-4 py-3 text-sm">
            {connectionBannerText(profile.connectionStatus, profile.igUsername)}{" "}
            <Link href="/configuracoes" className="font-semibold underline">
              Abrir Configurações
            </Link>
          </p>
        </PhoneFrame>
      ) : null}

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
          <FeedGrid
            items={visible}
            ratio={ratio}
            showStatus={!clientMode}
            onOpen={handleOpen}
            dragDisabled={clientMode || filter !== "all" || saving}
            selecting={selectionActive}
            selectedIds={selectedIds}
            onReorder={persistOrder}
          />
        )}
      </PhoneFrame>

      <PostSheet item={selected} profileId={profile.id} onClose={() => setSelected(null)} />
      {selectionActive ? (
        <SelectionBar
          profileId={profile.id}
          selectedIds={[...selectedIds]}
          pending={saving}
          onArchive={() => bulk("archive")}
          onDelete={() => bulk("delete")}
          onCancel={() => setSelectingMode(false)}
        />
      ) : (
        <AddPostFab profileId={profile.id} />
      )}
    </div>
  );
}
