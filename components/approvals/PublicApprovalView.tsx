"use client";

import {
  Bookmark,
  Check,
  Heart,
  MessageCircle,
  MessageSquareQuote,
  MoreHorizontal,
  Send,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Logo } from "@/components/app/Logo";
import { ApprovalBar } from "@/components/approvals/ApprovalBar";
import { ProgressMeter } from "@/components/approvals/bits";
import { PublicFeedGrid, type PublicItemState } from "@/components/approvals/PublicFeedGrid";
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
import { Glow } from "@/components/ui/glow";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SuccessBurst } from "@/components/ui/success-burst";
import {
  APPROVAL_ERROR_MESSAGES,
  type DecideInput,
  type DecideManyInput,
  type DecideManyResult,
  type DecideResult,
  type DecisionRecord,
  type PublicApprovalView as PublicApprovalData,
} from "@/lib/approvals/contracts";
import { formatDateTimeBr, formatDecisionStamp } from "@/lib/approvals/ui-format";
import { haptic } from "@/lib/ui/haptics";
import { cn } from "@/lib/utils";

/** Codes of the 410 family: the link stopped accepting decisions while the page was open. */
const GONE_CODES = new Set(["link_used", "link_expired", "link_revoked"]);

const NAME_KEY = "aprovo_approver_name";
const NETWORK_ERROR = "Não rolou enviar. Confere a internet e tenta de novo.";

type Props = { token: string; data: PublicApprovalData };
type Item = PublicApprovalData["items"][number];
type Profile = NonNullable<PublicApprovalData["profile"]>;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}

function firstName(name: string | null | undefined): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || null;
}

function thumbOf(item: Item): string | null {
  const m = item.media[0];
  return m ? (m.thumbUrl ?? m.previewUrl ?? m.posterUrl) : null;
}

/** Profile photo with the gradient ring (the "stories" look). */
function ProfileAvatar({ profile, size = "size-14" }: { profile: Profile; size?: string }) {
  return (
    <span aria-hidden className="bg-gradient-brand shadow-glow flex shrink-0 rounded-full p-[3px]">
      <span className="bg-background flex rounded-full p-0.5">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" className={cn(size, "rounded-full object-cover")} />
        ) : (
          <span
            className={cn(
              size,
              "bg-brand-soft text-brand-ink font-display flex items-center justify-center rounded-full text-base font-bold",
            )}
          >
            {profile.igUsername.slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>
    </span>
  );
}

/** Aurora backdrop + centered 430 px column shared by the decision page and the receipt. */
function PublicShell({ children, padBottom }: { children: React.ReactNode; padBottom: boolean }) {
  return (
    <div className="bg-background relative isolate flex flex-1 flex-col">
      <div aria-hidden className="bg-aurora pointer-events-none fixed inset-0 -z-10 opacity-90" />
      <main
        className={cn(
          "mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-6 px-4 pt-[calc(1rem+env(safe-area-inset-top))]",
          padBottom
            ? "pb-[calc(15rem+env(safe-area-inset-bottom))]"
            : "pb-[calc(2.5rem+env(safe-area-inset-bottom))]",
        )}
      >
        {children}
      </main>
    </div>
  );
}

/** Celebratory card shown once everything is decided. "Tudo decidido" is frozen (e2e). */
function AllDoneCard({ closedLink, senderName }: { closedLink: boolean; senderName: string }) {
  return (
    <Glow tone="success" intensity="strong" pulse className="animate-rise rounded-4xl">
      <div
        role="status"
        className="bg-card border-border relative flex flex-col items-center gap-3 overflow-hidden rounded-4xl border px-6 py-8 text-center"
      >
        <span className="bg-gradient-success text-ink shadow-glow-success animate-success-pop relative flex size-20 items-center justify-center rounded-full">
          <Check aria-hidden className="size-10" strokeWidth={3} />
          <SuccessBurst distance={84} />
        </span>
        <h2 className="font-display text-h1 text-balance">Tudo decidido.</h2>
        <p className="text-body text-muted-foreground max-w-[30ch] text-pretty">
          {closedLink
            ? `Este link foi encerrado. ${senderName} já recebeu suas respostas.`
            : `Suas respostas já chegaram para ${senderName}. Pode fechar esta página.`}
        </p>
      </div>
    </Glow>
  );
}

export function PublicApprovalView({ token, data }: Props) {
  const { request, profile, items, feedItems } = data;
  const router = useRouter();
  const personal = data.mode === "personal";
  const [closed, setClosed] = useState(false);
  const readOnly = data.readOnly || closed;
  const [decisions, setDecisions] = useState<Record<string, DecisionRecord>>(() =>
    Object.fromEntries(items.flatMap((i) => (i.decision ? [[i.postId, i.decision]] : []))),
  );
  const [justDecided, setJustDecided] = useState<Set<string>>(() => new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [confirmAll, setConfirmAll] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // A personal link decides each item on its own, even when another recipient already moved the post.
  const canDecide = useCallback(
    (i: Item) =>
      personal
        ? ["pending_approval", "approved", "changes_requested"].includes(i.status)
        : i.status === "pending_approval",
    [personal],
  );
  const isPending = useCallback(
    (i: Item) => !decisions[i.postId] && canDecide(i),
    [decisions, canDecide],
  );
  const pendingItems = items.filter(isPending);

  const [activeId, setActiveId] = useState<string | null>(
    () => items.find((i) => !i.decision && canDecide(i))?.postId ?? items[0]?.postId ?? null,
  );
  const activeRef = useRef(activeId);
  const composingRef = useRef(false);
  const suppressUntil = useRef(0);

  useEffect(() => {
    activeRef.current = activeId;
  }, [activeId]);

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

  // The item most visible above the bar becomes the one the bar decides.
  useEffect(() => {
    if (readOnly || typeof IntersectionObserver === "undefined") return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.postId;
          if (id) visible.set(id, e.isIntersecting ? e.intersectionRect.height : 0);
        }
        if (composingRef.current || Date.now() < suppressUntil.current) return;
        let best: string | null = null;
        let bestHeight = 0;
        for (const [id, h] of visible) {
          if (h > bestHeight) {
            best = id;
            bestHeight = h;
          }
        }
        if (best && bestHeight > 48) setActiveId(best);
      },
      {
        rootMargin: "-10% 0px -40% 0px",
        threshold: Array.from({ length: 11 }, (_, i) => i / 10),
      },
    );
    document
      .querySelectorAll<HTMLElement>("[data-approval-item]")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [readOnly, items]);

  function changeName(value: string) {
    setName(value);
    try {
      localStorage.setItem(NAME_KEY, value);
    } catch {
      // ignore
    }
  }

  const goTo = useCallback((postId: string, anchor: "item" | "row" = "item") => {
    setActiveId(postId);
    suppressUntil.current = Date.now() + 900;
    document
      .getElementById(`${anchor}-${postId}`)
      ?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  }, []);

  const scrollTop = useCallback(() => {
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: scrollBehavior() }));
  }, []);

  /** Next undecided item after `postId` (wrapping), given an up-to-date decisions map. */
  const nextPendingAfter = useCallback(
    (postId: string, map: Record<string, DecisionRecord>): string | null => {
      const idx = items.findIndex((i) => i.postId === postId);
      const ordered = [...items.slice(idx + 1), ...items.slice(0, Math.max(idx, 0))];
      return ordered.find((i) => !map[i.postId] && canDecide(i))?.postId ?? null;
    },
    [items, canDecide],
  );

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
          approverName: personal ? undefined : name.trim() || undefined,
        };
        const res = await fetch(`/api/approval/${token}/decide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as DecideResult;
        if (json.ok) {
          const record = {
            ...json.data.decision,
            decidedAt: new Date(json.data.decision.decidedAt),
          };
          const nextMap = { ...decisions, [postId]: record };
          setDecisions((cur) => ({ ...cur, [postId]: record }));
          setJustDecided((cur) => new Set(cur).add(postId));
          if (json.data.linkUsed) {
            setClosed(true);
            scrollTop();
          } else {
            const next = nextPendingAfter(postId, nextMap);
            if (next) {
              // Let the confetti land, then move on to the next one.
              window.setTimeout(() => {
                if (activeRef.current === postId) goTo(next);
              }, 1100);
            } else scrollTop();
          }
          return true;
        }
        if (GONE_CODES.has(json.code)) {
          // Show the receipt (or the inactive card) without a manual reload.
          if (json.code === "link_used") setClosed(true);
          router.refresh();
          return false;
        }
        const message = APPROVAL_ERROR_MESSAGES[json.code] ?? json.message;
        setErrors((cur) => ({ ...cur, [postId]: message }));
        return false;
      } catch {
        setErrors((cur) => ({ ...cur, [postId]: NETWORK_ERROR }));
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [name, token, personal, router, decisions, nextPendingAfter, goTo, scrollTop],
  );

  async function approveAll() {
    setConfirmAll(false);
    const targets = pendingItems;
    setBulkError(null);
    setProgress({ done: 0, total: targets.length });
    setBusyId("all");
    try {
      const body: DecideManyInput = {
        decisions: targets.map((t) => ({ postId: t.postId, decision: "approved" as const })),
        approverName: personal ? undefined : name.trim() || undefined,
      };
      const res = await fetch(`/api/approval/${token}/decide-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as DecideManyResult;
      if (json.ok) {
        setDecisions((cur) => ({
          ...cur,
          ...Object.fromEntries(
            json.data.results.map((r) => [
              r.postId,
              { ...r.decision, decidedAt: new Date(r.decision.decidedAt) },
            ]),
          ),
        }));
        setJustDecided((cur) => {
          const next = new Set(cur);
          for (const r of json.data.results) next.add(r.postId);
          return next;
        });
        haptic("success");
        if (json.data.linkUsed) setClosed(true);
        scrollTop();
      } else if (GONE_CODES.has(json.code)) {
        if (json.code === "link_used") setClosed(true);
        router.refresh();
      } else {
        haptic("error");
        setBulkError(APPROVAL_ERROR_MESSAGES[json.code] ?? json.message);
      }
    } catch {
      haptic("error");
      setBulkError(NETWORK_ERROR);
    } finally {
      setBusyId(null);
      setProgress(null);
    }
  }

  const highlightIds = useMemo(() => new Set(items.map((i) => i.postId)), [items]);
  const states = useMemo(() => {
    const out: Record<string, PublicItemState> = {};
    for (const i of items) {
      const d = decisions[i.postId];
      out[i.postId] = d
        ? d.decision === "approved"
          ? "approved"
          : "changes"
        : canDecide(i)
          ? "pending"
          : "locked";
    }
    return out;
  }, [items, decisions, canDecide]);

  if (!request || !profile) return null;

  const count = items.length;
  const decidedCount = items.filter((i) => decisions[i.postId]).length;
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

  const feedIsland = (
    <section aria-label="Feed do perfil" className="flex flex-col gap-2">
      <p className="text-micro text-muted-foreground px-1 uppercase">Como fica no feed</p>
      <div
        data-theme="light"
        className="font-instagram shadow-card overflow-hidden rounded-3xl bg-white text-black"
      >
        <InstagramHeader profile={igProfile} />
        <PublicFeedGrid
          items={feedItems}
          ratio={profile.gridRatio}
          highlightIds={highlightIds}
          states={states}
          activeId={readOnly ? null : activeId}
          onOpen={(postId) => goTo(postId, readOnly ? "row" : "item")}
        />
      </div>
    </section>
  );

  const messageBubble = request.message ? (
    <div className="flex items-end gap-2">
      <span
        aria-hidden
        className="bg-gradient-brand text-on-brand flex size-8 shrink-0 items-center justify-center rounded-full"
      >
        <MessageSquareQuote className="size-4" />
      </span>
      <p className="bg-brand-soft text-body rounded-3xl rounded-bl-md px-4 py-3 whitespace-pre-line">
        <span className="sr-only">Recado de {request.senderName}: </span>
        {request.message}
      </p>
    </div>
  ) : null;

  // ---------- Receipt (used link, or the link just closed) ----------
  if (readOnly) {
    const who = firstName(data.recipientName);
    return (
      <PublicShell padBottom={false}>
        <header className="glass shadow-card animate-rise flex flex-col gap-4 rounded-4xl border border-white/10 p-5">
          <Logo height={24} />
          <div className="flex items-center gap-3">
            <ProfileAvatar profile={profile} />
            <div className="min-w-0">
              <p className="text-caption text-muted-foreground truncate">@{profile.igUsername}</p>
              <h1 className="font-display text-h2">Aprovação registrada</h1>
            </div>
          </div>
          <p className="text-body text-muted-foreground">
            {who ? `${who}, este é o seu recibo` : "Este é o recibo"} das decisões sobre{" "}
            {count === 1 ? "a publicação enviada" : `as ${count} publicações enviadas`} por{" "}
            {request.senderName}.
          </p>
          {request.title ? <p className="text-title">{request.title}</p> : null}
        </header>

        {closed && !data.readOnly ? (
          <AllDoneCard closedLink senderName={request.senderName} />
        ) : null}

        <section
          aria-labelledby="receipt-timeline"
          className="bg-card border-border shadow-card flex flex-col gap-4 rounded-3xl border p-5"
        >
          <h2 id="receipt-timeline" className="text-title">
            Suas decisões
          </h2>
          <ol className="before:bg-outline relative flex flex-col gap-5 before:absolute before:top-3 before:bottom-3 before:left-[11px] before:w-0.5 before:content-['']">
            {items.map((item, idx) => {
              const d = decisions[item.postId] ?? null;
              const thumb = thumbOf(item);
              return (
                <li
                  key={item.postId}
                  id={`row-${item.postId}`}
                  className="animate-rise relative flex scroll-mt-6 gap-3"
                  style={{ animationDelay: `${Math.min(idx, 8) * 35}ms` }}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "text-ink relative z-10 mt-1 flex size-6 shrink-0 items-center justify-center rounded-full",
                      !d
                        ? "bg-surface-2 text-muted-foreground"
                        : d.decision === "approved"
                          ? "bg-gradient-success"
                          : "bg-warning",
                    )}
                  >
                    {!d ? (
                      <span className="size-2 rounded-full bg-current" />
                    ) : d.decision === "approved" ? (
                      <Check className="size-3.5" strokeWidth={3} />
                    ) : (
                      <MessageCircle className="size-3.5" strokeWidth={2.5} />
                    )}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <span className="bg-surface-2 size-14 shrink-0 overflow-hidden rounded-sm">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        ) : null}
                      </span>
                      <div className="min-w-0">
                        <p className="text-caption text-muted-foreground">
                          Publicação {idx + 1} de {count}
                        </p>
                        <p className="text-body font-semibold">
                          {!d
                            ? "Sem decisão"
                            : d.decision === "approved"
                              ? "Aprovado"
                              : "Ajustes pedidos"}
                        </p>
                        {d ? (
                          <p
                            className="text-caption text-muted-foreground"
                            suppressHydrationWarning
                          >
                            {formatDecisionStamp(d.decidedAt)}
                            {d.approverName ? ` · por ${d.approverName}` : ""}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {d?.comment ? (
                      <blockquote className="bg-surface-2 text-body rounded-2xl rounded-tl-md px-4 py-3 whitespace-pre-line">
                        {d.comment}
                      </blockquote>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {messageBubble}

        {feedIsland}

        <footer className="text-caption text-muted-foreground text-center text-balance">
          Precisa mudar algo? Peça um link novo para {request.senderName}.
        </footer>
      </PublicShell>
    );
  }

  // ---------- Decision page ----------
  const greetingName = personal ? firstName(data.recipientName) : firstName(name);
  const allDone = pendingItems.length === 0 && decidedCount > 0;
  const activeIndex = Math.max(
    0,
    items.findIndex((i) => i.postId === activeId),
  );
  const active = items[activeIndex] ?? null;
  const activeDecision = active ? (decisions[active.postId] ?? null) : null;
  const activeLockedNote =
    active && !activeDecision && !canDecide(active)
      ? "Esta publicação não está esperando decisão agora."
      : null;
  const nextForBar = active ? nextPendingAfter(active.postId, decisions) : null;

  return (
    <PublicShell padBottom={!allDone}>
      <header className="glass shadow-card animate-rise flex flex-col gap-4 rounded-4xl border border-white/10 p-5">
        <div className="flex items-center justify-between gap-2">
          <Logo height={24} />
          <span className="text-micro text-muted-foreground uppercase">Aprovação</span>
        </div>
        <div className="flex items-center gap-3">
          <ProfileAvatar profile={profile} />
          <div className="min-w-0">
            <p className="text-caption text-muted-foreground truncate">@{profile.igUsername}</p>
            <p className="text-title">
              {greetingName ? `Oi, ${greetingName}. Bora decidir?` : "Bora decidir?"}
            </p>
          </div>
        </div>
        <h1 className="font-display text-h2 text-balance">
          {request.senderName} te mandou{" "}
          <span className="text-gradient-brand">
            {count} {count === 1 ? "publicação" : "publicações"}
          </span>
        </h1>
        {request.title ? <p className="text-body font-semibold">{request.title}</p> : null}
        <div className="flex flex-col gap-2">
          <div className="text-caption flex items-center justify-between">
            <span>
              {decidedCount} de {count} {count === 1 ? "decidida" : "decididas"}
            </span>
            {pendingItems.length > 0 ? (
              <span className="text-muted-foreground">
                {pendingItems.length === 1 ? "falta 1" : `faltam ${pendingItems.length}`}
              </span>
            ) : null}
          </div>
          <ProgressMeter value={decidedCount} max={count} label="Publicações decididas" />
        </div>
        {!personal ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ap-approver-name">Seu nome (opcional)</Label>
            <Input
              id="ap-approver-name"
              value={name}
              maxLength={80}
              autoComplete="name"
              placeholder="Pra saberem quem decidiu"
              onChange={(e) => changeName(e.target.value)}
            />
          </div>
        ) : null}
      </header>

      {allDone ? <AllDoneCard closedLink={false} senderName={request.senderName} /> : null}

      {messageBubble}

      {feedIsland}

      <section aria-labelledby="ap-items-title" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h2 id="ap-items-title" className="font-display text-h2">
            Uma por uma
          </h2>
          <span className="text-caption text-muted-foreground">Role e decida</span>
        </div>
        {items.map((item, idx) => {
          const decision = decisions[item.postId] ?? null;
          const isActive = item.postId === activeId;
          const burst = justDecided.has(item.postId);
          return (
            <div
              key={item.postId}
              id={`item-${item.postId}`}
              data-approval-item
              data-post-id={item.postId}
              onClick={() => setActiveId(item.postId)}
              onFocusCapture={() => setActiveId(item.postId)}
              className={cn(
                "scroll-mt-4 rounded-[calc(1.5rem+3px)] p-[3px] transition-[box-shadow,background-color] duration-(--ap-dur-base)",
                isActive ? "bg-gradient-brand shadow-glow" : "bg-transparent",
              )}
            >
              <article
                aria-label={`Publicação ${idx + 1} de ${count}`}
                data-theme="light"
                className="font-instagram overflow-hidden rounded-3xl bg-white pb-4 text-black"
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

                <div className="mt-3 flex flex-col gap-2 px-3 font-sans">
                  {decision ? (
                    <>
                      <span
                        className={cn(
                          "text-ink relative inline-flex min-h-9 items-center gap-1.5 self-start rounded-full px-3 text-sm font-bold",
                          decision.decision === "approved" ? "bg-gradient-success" : "bg-warning",
                        )}
                        suppressHydrationWarning
                      >
                        {burst && decision.decision === "approved" ? (
                          <SuccessBurst distance={48} />
                        ) : null}
                        {decision.decision === "approved" ? (
                          <Check
                            aria-hidden
                            className={cn("size-4", burst && "animate-success-pop")}
                            strokeWidth={3}
                          />
                        ) : (
                          <MessageCircle aria-hidden className="size-4" strokeWidth={2.5} />
                        )}
                        {decision.decision === "approved" ? "Aprovado" : "Ajustes pedidos"} em{" "}
                        {formatDecisionStamp(decision.decidedAt)}
                      </span>
                      {decision.approverName && !personal ? (
                        <p className="text-caption text-muted-foreground">
                          por {decision.approverName}
                        </p>
                      ) : null}
                      {decision.comment ? (
                        <p className="bg-surface-2 text-body text-foreground rounded-2xl rounded-tl-md px-3 py-2 whitespace-pre-line">
                          {decision.comment}
                        </p>
                      ) : null}
                    </>
                  ) : canDecide(item) ? (
                    <StatusPill status="pending_approval" className="self-start" />
                  ) : (
                    <p className="text-caption text-muted-foreground">
                      Esta publicação não está esperando decisão agora.
                    </p>
                  )}
                  {errors[item.postId] && !isActive ? (
                    <p role="alert" className="text-danger-ink text-caption">
                      {errors[item.postId]}
                    </p>
                  ) : null}
                </div>
              </article>
            </div>
          );
        })}
      </section>

      {!allDone && active ? (
        <ApprovalBar
          itemId={active.postId}
          position={{ index: activeIndex + 1, total: count }}
          decision={activeDecision}
          justDecided={justDecided.has(active.postId)}
          lockedNote={activeLockedNote}
          mode={data.mode}
          recipientName={data.recipientName}
          approverName={name}
          busy={busyId === active.postId || busyId === "all"}
          error={errors[active.postId] ?? null}
          onDecide={(d, c) => decide(active.postId, d, c)}
          onNext={nextForBar && nextForBar !== active.postId ? () => goTo(nextForBar) : null}
          onComposingChange={(v) => {
            composingRef.current = v;
          }}
          approveAll={
            pendingItems.length > 1
              ? {
                  count: pendingItems.length,
                  busy: busyId === "all",
                  onClick: () => setConfirmAll(true),
                }
              : null
          }
          bulkStatus={
            progress
              ? { tone: "info", text: `Aprovando ${progress.total} publicações…` }
              : bulkError
                ? { tone: "error", text: bulkError }
                : null
          }
        />
      ) : null}

      <Dialog open={confirmAll} onOpenChange={setConfirmAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar todas?</DialogTitle>
            <DialogDescription>
              As {pendingItems.length} publicações pendentes serão aprovadas
              {personal && data.recipientName
                ? ` em nome de ${data.recipientName}`
                : name.trim()
                  ? ` em nome de ${name.trim()}`
                  : ""}
              .
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmAll(false)}>
              Voltar
            </Button>
            <Button variant="success" onClick={() => void approveAll()}>
              Aprovar todas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PublicShell>
  );
}
