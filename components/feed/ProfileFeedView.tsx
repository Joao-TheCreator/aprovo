"use client";

import { AlertTriangle, RefreshCw, Sparkles, Unplug, type LucideIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";

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

/** v2 banner around the feed (chrome, not part of the Instagram simulation). */
function Banner({
  tone,
  icon: Icon,
  role = "status",
  children,
}: {
  tone: "warning" | "danger";
  icon: LucideIcon;
  role?: "status" | "alert";
  children: React.ReactNode;
}) {
  return (
    <div
      role={role}
      className={cn(
        "text-body animate-rise flex items-start gap-3 rounded-3xl border p-4",
        tone === "warning"
          ? "border-warning/40 bg-warning/10"
          : "border-danger-ink/40 bg-danger/10",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-2xl",
          tone === "warning" ? "bg-warning text-ink" : "bg-danger text-destructive-foreground",
        )}
      >
        <Icon className="size-5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1 pt-2">{children}</div>
    </div>
  );
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
          <Banner tone="warning" icon={Unplug}>
            Conta do Instagram desconectada. Reconecte em{" "}
            <Link
              href="/configuracoes"
              className="text-brand-ink font-bold underline-offset-4 hover:underline"
            >
              Configurações
            </Link>
            .
          </Banner>
        </PhoneFrame>
      ) : null}

      {profile.connectionStatus && profile.connectionStatus !== "active" ? (
        <PhoneFrame>
          <Banner tone="warning" icon={Unplug}>
            {connectionBannerText(profile.connectionStatus, profile.igUsername)}{" "}
            <Link
              href="/configuracoes"
              className="text-brand-ink font-bold underline-offset-4 hover:underline"
            >
              Abrir Configurações
            </Link>
          </Banner>
        </PhoneFrame>
      ) : null}

      {profile.importStatus === "failed" ? (
        <PhoneFrame>
          <Banner tone="danger" icon={AlertTriangle} role="alert">
            <span className="flex flex-col gap-3">
              <span>{profile.importError ?? "Não conseguimos importar o feed."}</span>
              <span className="flex flex-wrap gap-2">
                <Button size="sm" onClick={retry} disabled={retrying}>
                  <RefreshCw aria-hidden className={retrying ? "motion-safe:animate-spin" : ""} />
                  Tentar de novo
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/perfis/${profile.id}/importar`}>Importar manualmente</Link>
                </Button>
              </span>
            </span>
          </Banner>
        </PhoneFrame>
      ) : null}

      {!clientMode &&
      counts.all === 0 &&
      items.length > 0 &&
      profile.importStatus !== "importing" ? (
        <PhoneFrame>
          <div className="bg-card border-border relative isolate flex items-center gap-4 overflow-hidden rounded-3xl border border-dashed p-4">
            <span
              aria-hidden
              className="bg-glow pointer-events-none absolute -top-16 -left-10 -z-10 size-40 rounded-full opacity-50 blur-3xl"
            />
            <span
              aria-hidden
              className="bg-gradient-brand text-on-brand shadow-glow flex size-12 shrink-0 items-center justify-center rounded-2xl"
            >
              <Sparkles className="size-6" strokeWidth={2} />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-display text-title">Grade em branco, ideia nova.</span>
              <span className="text-muted-foreground text-caption font-medium">
                Toque no + pra adicionar o primeiro post.
              </span>
            </span>
          </div>
        </PhoneFrame>
      ) : null}

      {/* Instagram simulation: light theme island, system font, faithful to the app. */}
      <PhoneFrame
        data-theme="light"
        className="font-instagram md:shadow-card overflow-hidden bg-white text-black md:rounded-[2rem] md:border md:border-neutral-200"
      >
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
            emptyText={
              !clientMode && filter !== "all"
                ? "Nada com esse status."
                : "Grade em branco, ideia nova."
            }
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
