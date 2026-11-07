"use client";

import { Bookmark, Heart, MessageCircle, MoreHorizontal, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Logo } from "@/components/app/Logo";
import { ApprovalBar } from "@/components/approvals/ApprovalBar";
import { PublicFeedGrid } from "@/components/approvals/PublicFeedGrid";
import { PublicMedia } from "@/components/approvals/PublicMedia";
import { InstagramHeader } from "@/components/feed/InstagramHeader";
import { StatusPill } from "@/components/feed/StatusPill";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  APPROVAL_ERROR_MESSAGES,
  type DecideInput,
  type DecideResult,
  type DecisionRecord,
  type PublicApprovalView as PublicApprovalData,
} from "@/lib/approvals/contracts";
import { formatDateTimeBr } from "@/lib/approvals/ui-format";

const NAME_KEY = "aprovo_approver_name";

type Props = { token: string; data: PublicApprovalData };
type Item = PublicApprovalData["items"][number];

export function PublicApprovalView({ token, data }: Props) {
  const { request, profile, items, feedItems } = data;
  const [decisions, setDecisions] = useState<Record<string, DecisionRecord>>(() =>
    Object.fromEntries(items.flatMap((i) => (i.decision ? [[i.postId, i.decision]] : []))),
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = localStorage.getItem(NAME_KEY);
        if (stored) setName(stored);
      } catch {
        // storage unavailable
      }
    });
  }, []);

  function changeName(value: string) {
    setName(value);
    try {
      localStorage.setItem(NAME_KEY, value);
    } catch {
      // ignore
    }
  }

  const highlightIds = useMemo(() => new Set(items.map((i) => i.postId)), [items]);
  const isPending = useCallback(
    (i: Item) => !decisions[i.postId] && i.status === "pending_approval",
    [decisions],
  );
  const pendingItems = items.filter(isPending);

  const decide = useCallback(
    async (
      postId: string,
      decision: "approved" | "changes_requested",
      comment: string,
    ): Promise<boolean> => {
      setBusyId(postId);
      setErrors((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => k !== postId)));
      try {
        const body: DecideInput = {
          postId,
          decision,
          comment: comment || undefined,
          approverName: name.trim() || undefined,
        };
        const res = await fetch(`/api/approval/${token}/decide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as DecideResult;
        if (json.ok) {
          setDecisions((cur) => ({
            ...cur,
            [postId]: { ...json.data.decision, decidedAt: new Date(json.data.decision.decidedAt) },
          }));
          return true;
        }
        const message = APPROVAL_ERROR_MESSAGES[json.code] ?? json.message;
        setErrors((cur) => ({ ...cur, [postId]: message }));
        return false;
      } catch {
        setErrors((cur) => ({
          ...cur,
          [postId]: "Não foi possível enviar. Verifique sua conexão e tente de novo.",
        }));
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [name, token],
  );

  async function approveAll() {
    setConfirmAll(false);
    const targets = pendingItems;
    setProgress({ done: 0, total: targets.length });
    let done = 0;
    for (const item of targets) {
      const ok = await decide(item.postId, "approved", "");
      if (!ok) break;
      done += 1;
      setProgress({ done, total: targets.length });
    }
    setProgress(null);
  }

  function scrollTo(postId: string) {
    document
      .getElementById(`item-${postId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (!request || !profile) return null;

  const count = items.length;
  const igProfile = {
    id: "",
    workspaceId: "",
    igUsername: profile.igUsername,
    displayName: profile.displayName,
    biography: null,
    externalUrl: null,
    avatarUrl: profile.avatarUrl,
    postsCount: null,
    followersCount: null,
    followingCount: null,
    accountType: "unknown" as const,
    importSource: null,
    importStatus: "idle" as const,
    importError: null,
    lastImportedAt: null,
    gridRatio: profile.gridRatio,
    connectionId: null,
  };

  return (
    <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-5 px-4 py-5">
      <header className="flex flex-col gap-3">
        <Logo height={32} />
        <h1 className="text-xl leading-7 font-bold">
          {request.senderName} enviou {count} {count === 1 ? "publicação" : "publicações"} para sua
          aprovação
        </h1>
        {request.title ? <p className="text-muted-foreground text-sm">{request.title}</p> : null}
        {request.message ? (
          <p className="bg-lavanda rounded-2xl p-3 text-[15px] whitespace-pre-line">
            {request.message}
          </p>
        ) : null}
        {pendingItems.length > 1 ? (
          <div className="flex flex-col gap-1">
            <Button
              variant="success"
              size="lg"
              disabled={busyId !== null}
              onClick={() => setConfirmAll(true)}
            >
              Aprovar todos ({pendingItems.length})
            </Button>
            {progress ? (
              <p role="status" className="text-sm">
                Aprovando {Math.min(progress.done + 1, progress.total)} de {progress.total}…
              </p>
            ) : null}
          </div>
        ) : null}
      </header>

      <section
        aria-label="Feed do perfil"
        className="font-instagram border-border overflow-hidden rounded-2xl border bg-white text-black"
      >
        <InstagramHeader profile={igProfile} />
        <PublicFeedGrid
          items={feedItems}
          ratio={profile.gridRatio}
          highlightIds={highlightIds}
          onOpen={scrollTo}
        />
      </section>

      <section aria-label="Publicações para aprovar" className="flex flex-col gap-5">
        {items.map((item, idx) => {
          const decision = decisions[item.postId] ?? null;
          const lockedNote =
            !decision && item.status !== "pending_approval"
              ? "Esta publicação não está aguardando decisão neste momento."
              : null;
          return (
            <article
              key={item.postId}
              id={`item-${item.postId}`}
              className="font-instagram border-border scroll-mt-4 overflow-hidden rounded-2xl border bg-white pb-4 text-black"
            >
              <div className="flex h-14 items-center gap-3 px-3">
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatarUrl}
                    alt=""
                    className="size-8 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div aria-hidden className="size-8 shrink-0 rounded-full bg-neutral-300" />
                )}
                <span className="flex-1 truncate text-sm font-bold">{profile.igUsername}</span>
                <span className="text-xs text-neutral-500">
                  {idx + 1}/{count}
                </span>
                <MoreHorizontal aria-hidden className="size-5" />
              </div>

              <PublicMedia kind={item.kind} media={item.media} />

              <div aria-hidden className="flex items-center gap-4 px-3 py-3">
                <Heart className="size-6" strokeWidth={1.75} />
                <MessageCircle className="size-6" strokeWidth={1.75} />
                <Send className="size-6" strokeWidth={1.75} />
                <Bookmark className="ml-auto size-6" strokeWidth={1.75} />
              </div>

              <div className="flex flex-col gap-1 px-3 text-sm leading-[18px]">
                {item.caption ? (
                  <p className="whitespace-pre-line">
                    <span className="font-bold">@{profile.igUsername}</span> {item.caption}
                  </p>
                ) : null}
                {item.hashtags.length ? (
                  <p className="text-[#00376B]">{item.hashtags.map((t) => `#${t}`).join(" ")}</p>
                ) : null}
                {item.scheduledFor ? (
                  <p className="text-xs text-neutral-500" suppressHydrationWarning>
                    Data prevista: {formatDateTimeBr(item.scheduledFor)}
                  </p>
                ) : null}
              </div>

              <div className="mt-3 flex flex-col gap-3 border-t border-neutral-200 px-3 pt-3 font-sans">
                {!decision && item.status === "pending_approval" ? (
                  <StatusPill status="pending_approval" className="self-start" />
                ) : null}
                <ApprovalBar
                  decision={decision}
                  lockedNote={lockedNote}
                  approverName={name}
                  onApproverNameChange={changeName}
                  busy={busyId === item.postId}
                  error={errors[item.postId] ?? null}
                  onDecide={(d, c) => decide(item.postId, d, c)}
                />
              </div>
            </article>
          );
        })}
      </section>

      <Dialog open={confirmAll} onOpenChange={setConfirmAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar todas?</DialogTitle>
            <DialogDescription>
              As {pendingItems.length} publicações pendentes serão aprovadas
              {name.trim() ? ` em nome de ${name.trim()}` : ""}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAll(false)}>
              Voltar
            </Button>
            <Button variant="success" onClick={() => void approveAll()}>
              Aprovar todas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
