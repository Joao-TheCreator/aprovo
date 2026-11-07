"use client";

import { ChevronDown, Eye, Loader2, Plus, RotateCcw, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { DotPill, InitialsAvatar, ProgressMeter, type DotTone } from "@/components/approvals/bits";
import { ReopenSheet } from "@/components/approvals/ReopenSheet";
import { ShareLinkSheet } from "@/components/approvals/ShareLinkSheet";
import { StatusPill } from "@/components/feed/StatusPill";
import { Button } from "@/components/ui/button";
import { cardVariants } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  cancelApprovalRequest,
  issuePersonalLink,
  revokeApprovalLink,
} from "@/lib/approvals/actions";
import {
  APPROVAL_ERROR_MESSAGES,
  type ApprovalLinkSummary,
  type ApprovalRequestSummary,
  type IssuedLink,
} from "@/lib/approvals/contracts";
import {
  formatDateBr,
  formatDateTimeBr,
  formatDayMonth,
  formatDayMonthTime,
  plural,
  roundSummaries,
  shortCaption,
  shortUserAgent,
} from "@/lib/approvals/ui-format";
import { cn } from "@/lib/utils";

const REQUEST_STATUS: Record<
  ApprovalRequestSummary["status"],
  { label: string; tone: DotTone; live?: boolean }
> = {
  open: { label: "Aberto", tone: "pending", live: true },
  partially_decided: { label: "Parcial", tone: "changes" },
  decided: { label: "Decidido", tone: "approved" },
  revoked: { label: "Cancelado", tone: "draft" },
};

function linkState(l: ApprovalLinkSummary): {
  label: string;
  tone: DotTone;
  active: boolean;
} {
  if (l.revokedAt) return { label: "Cancelado", tone: "failed", active: false };
  if (l.usedAt) {
    return l.usedReason === "superseded"
      ? { label: "Substituído", tone: "draft", active: false }
      : { label: `Usado em ${formatDateTimeBr(l.usedAt)}`, tone: "approved", active: false };
  }
  if (new Date(l.expiresAt).getTime() < Date.now()) {
    return { label: "Expirado", tone: "changes", active: false };
  }
  const until = `válido até ${formatDateBr(l.expiresAt)}`;
  return l.mode === "shared"
    ? { label: `Link aberto · ${until}`, tone: "scheduled", active: true }
    : { label: `Ativo · ${until}`, tone: "pending", active: true };
}

function OpensList({ opens }: { opens: ApprovalLinkSummary["opens"] }) {
  const [shown, setShown] = useState(false);
  if (opens.length === 0) return null;
  return (
    <div>
      <button
        type="button"
        aria-expanded={shown}
        onClick={() => setShown((v) => !v)}
        className="text-brand-ink focus-visible:ring-ring -ml-1 flex min-h-11 items-center gap-1 rounded-full px-1 text-sm font-bold outline-none focus-visible:ring-2"
      >
        <ChevronDown
          aria-hidden
          className={cn(
            "ease-spring size-4 transition-transform duration-(--ap-dur-fast)",
            shown && "rotate-180",
          )}
        />
        {shown ? "Ocultar aberturas" : `Ver aberturas (${opens.length})`}
      </button>
      {shown ? (
        <ol
          className="animate-rise before:bg-outline relative mt-1 flex flex-col gap-2 pl-5 before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-0.5 before:content-['']"
          suppressHydrationWarning
        >
          {opens.map((o, i) => (
            <li key={i} className="text-caption text-muted-foreground relative font-normal">
              <span
                aria-hidden
                className={cn(
                  "absolute top-1 -left-5 size-3 rounded-full border-2",
                  i === 0 ? "bg-brand-ink border-brand-ink" : "bg-surface border-outline-strong",
                )}
              />
              <span className="text-foreground font-semibold">
                {formatDayMonthTime(o.openedAt)}
              </span>{" "}
              · {o.ip ?? "IP não informado"} · {shortUserAgent(o.userAgent)}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function decisionsText(l: ApprovalLinkSummary, total: number): string | null {
  if (l.decisions.length === 0) return null;
  const approved = l.decisions.filter((d) => d.decision === "approved").length;
  const changes = l.decisions.length - approved;
  const parts = [`decidiu ${l.decisions.length} de ${total}`];
  if (approved) parts.push(plural(approved, "aprovada", "aprovadas"));
  if (changes) parts.push(plural(changes, "com ajustes", "com ajustes"));
  return parts.join(" · ");
}

function Thumb({ src, className }: { src: string | null; className?: string }) {
  return (
    <span className={cn("bg-surface-2 block shrink-0 overflow-hidden rounded-sm", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      ) : null}
    </span>
  );
}

export function ApprovalRequestCard({
  request,
  showProfile,
  defaultExpanded = false,
}: {
  request: ApprovalRequestSummary;
  showProfile?: boolean;
  defaultExpanded?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [revoking, setRevoking] = useState<ApprovalLinkSummary | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [newLinkOpen, setNewLinkOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContact, setNewContact] = useState("");
  const [issued, setIssued] = useState<IssuedLink[] | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);

  const status = REQUEST_STATUS[request.status];
  const title = request.title || `Envio de ${formatDayMonth(request.createdAt)}`;
  const closed = request.status === "revoked" || request.status === "decided";
  const canReopen =
    request.status !== "revoked" && request.rounds.some((r) => r.decisions.length > 0);
  const roundLines = roundSummaries(request.rounds);
  const showRounds =
    roundLines.length > 1 || (roundLines.length === 1 && request.rounds[0].decisions.length > 0);
  const detailsId = `req-${request.id}-details`;
  const { counts } = request;
  const decided = counts.approved + counts.changes;
  const people = [
    ...new Map(
      request.links
        .filter((l) => !l.revokedAt && (l.recipientName || l.label))
        .map((l) => [(l.recipientName || l.label || "").trim().toLowerCase(), l]),
    ).values(),
  ];

  function run(
    action: () => Promise<{ ok: true } | { ok: false; code: string; message: string }>,
    success: string,
    done: () => void,
  ) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(success);
        router.refresh();
      } else toast.error(APPROVAL_ERROR_MESSAGES[res.code] ?? res.message);
      done();
    });
  }

  function newLink() {
    startTransition(async () => {
      const res = await issuePersonalLink(request.id, {
        name: newName.trim(),
        contact: newContact.trim() || undefined,
      });
      if (res.ok) {
        setNewLinkOpen(false);
        setNewName("");
        setNewContact("");
        setIssued(res.data.links);
        router.refresh();
      } else toast.error(APPROVAL_ERROR_MESSAGES[res.code] ?? res.message);
    });
  }

  return (
    <article className={cn(cardVariants(), "gap-4")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-title truncate">
            <Link
              href={`/perfis/${request.profile.id}/aprovacoes/${request.id}`}
              className="focus-visible:ring-ring rounded-md outline-none hover:underline focus-visible:ring-2"
            >
              {title}
            </Link>
          </h2>
          <p className="text-caption text-muted-foreground font-normal" suppressHydrationWarning>
            {showProfile ? `@${request.profile.igUsername} · ` : ""}criado em{" "}
            {formatDateBr(request.createdAt)}
          </p>
        </div>
        <DotPill tone={status.tone} live={status.live} className="shrink-0">
          {status.label}
        </DotPill>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-caption mr-1">{plural(counts.items, "item", "itens")}</span>
          {counts.approved ? (
            <DotPill tone="approved">{plural(counts.approved, "aprovada", "aprovadas")}</DotPill>
          ) : null}
          {counts.changes ? (
            <DotPill tone="changes">{plural(counts.changes, "ajuste", "ajustes")}</DotPill>
          ) : null}
          {counts.pending ? (
            <DotPill tone="pending" live>
              {counts.pending} aguardando
            </DotPill>
          ) : null}
        </div>
        <ProgressMeter value={decided} max={counts.items} label="Publicações decididas" />
      </div>

      <ul className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Publicações do envio">
        {request.items.map((it) => (
          <li key={it.postId}>
            <Thumb src={it.thumbUrl} className="size-14" />
          </li>
        ))}
      </ul>

      {people.length > 0 ? (
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {people.slice(0, 4).map((l) =>
              l.mode === "shared" ? (
                <span
                  key={l.id}
                  aria-hidden
                  className="bg-brand-soft text-brand-ink ring-card flex size-8 items-center justify-center rounded-full ring-2"
                >
                  <Users className="size-4" />
                </span>
              ) : (
                <InitialsAvatar
                  key={l.id}
                  name={l.recipientName}
                  className="ring-card size-8 text-[0.625rem] ring-2"
                />
              ),
            )}
          </div>
          <p className="text-caption text-muted-foreground min-w-0 truncate font-normal">
            {people.map((l) => l.recipientName || l.label).join(", ")}
          </p>
        </div>
      ) : null}

      {showRounds ? (
        <ol
          aria-label="Rodadas"
          className="before:bg-outline relative flex flex-col gap-2 pl-5 before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-0.5 before:content-['']"
          suppressHydrationWarning
        >
          {roundLines.map((line, i) => (
            <li key={line} className="text-caption text-muted-foreground relative font-normal">
              <span
                aria-hidden
                className={cn(
                  "absolute top-1 -left-5 size-3 rounded-full border-2",
                  i === roundLines.length - 1
                    ? "bg-gradient-brand border-transparent"
                    : "bg-surface border-outline-strong",
                )}
              />
              {line}
            </li>
          ))}
        </ol>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {canReopen ? (
          <Button onClick={() => setReopenOpen(true)}>
            <RotateCcw aria-hidden />
            Reabrir
          </Button>
        ) : null}
        <Button
          variant="ghost"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((v) => !v)}
          className="px-4"
        >
          <ChevronDown
            aria-hidden
            className={cn(
              "ease-spring transition-transform duration-(--ap-dur-fast)",
              expanded && "rotate-180",
            )}
          />
          Links e decisões
        </Button>
      </div>

      {expanded ? (
        <div id={detailsId} className="animate-rise flex flex-col gap-5">
          <section aria-label="Links" className="flex flex-col gap-3">
            <h3 className="text-micro text-muted-foreground uppercase">Links</h3>
            {request.links.length === 0 ? (
              <p className="text-body text-muted-foreground">Nenhum link gerado.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {request.links.map((l) => {
                  const st = linkState(l);
                  const name = l.recipientName || l.label || "Link sem nome";
                  const decidedLine = decisionsText(l, counts.items);
                  return (
                    <li
                      key={l.id}
                      className={cn(
                        "bg-surface-2/60 flex flex-col gap-2 rounded-3xl p-3",
                        !st.active && "opacity-90",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {l.mode === "shared" ? (
                          <span
                            aria-hidden
                            className="bg-brand-soft text-brand-ink flex size-9 shrink-0 items-center justify-center rounded-full"
                          >
                            <Users className="size-4" />
                          </span>
                        ) : (
                          <InitialsAvatar name={l.recipientName} ring={st.active} />
                        )}
                        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                          <p className="text-body w-full truncate font-semibold">{name}</p>
                          {l.recipientContact ? (
                            <p className="text-caption text-muted-foreground font-normal">
                              {l.recipientContact}
                            </p>
                          ) : null}
                          <DotPill
                            tone={st.tone}
                            live={st.active && l.mode === "personal"}
                            className="bg-surface"
                          >
                            <span suppressHydrationWarning>{st.label}</span>
                          </DotPill>
                        </div>
                        {st.active ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => setRevoking(l)}
                          >
                            Revogar
                          </Button>
                        ) : null}
                      </div>
                      <p
                        className="text-caption text-muted-foreground flex items-center gap-1.5 font-normal"
                        suppressHydrationWarning
                      >
                        <Eye aria-hidden className="size-3.5" />
                        abriu {l.openedCount}×
                        {l.lastOpenedAt ? ` · última ${formatDayMonthTime(l.lastOpenedAt)}` : ""}
                      </p>
                      {decidedLine ? <p className="text-caption">{decidedLine}</p> : null}
                      <OpensList opens={l.opens} />
                    </li>
                  );
                })}
              </ul>
            )}
            {!closed ? (
              <Button
                variant="secondary"
                className="self-start"
                onClick={() => setNewLinkOpen(true)}
              >
                <Plus aria-hidden />
                Novo link
              </Button>
            ) : null}
          </section>

          <section aria-label="Decisões" className="flex flex-col gap-3">
            <h3 className="text-micro text-muted-foreground uppercase">Decisões</h3>
            <ul className="flex flex-col gap-2">
              {request.items.map((it) => (
                <li key={it.postId} className="bg-surface-2/60 flex gap-3 rounded-3xl p-3">
                  <Thumb src={it.thumbUrl} className="size-12" />
                  <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                    <p className="text-body w-full truncate">{shortCaption(it.caption, 60)}</p>
                    {it.decision ? (
                      <>
                        <p
                          className="text-caption text-muted-foreground font-normal"
                          suppressHydrationWarning
                        >
                          <strong
                            className={
                              it.decision.decision === "approved"
                                ? "text-success-ink"
                                : "text-warning-ink"
                            }
                          >
                            {it.decision.decision === "approved" ? "Aprovou" : "Pediu ajustes"}
                          </strong>{" "}
                          · {it.decidedViaLink || it.decision.approverName || "Cliente"} ·{" "}
                          {formatDateTimeBr(it.decision.decidedAt)}
                        </p>
                        {it.decision.comment ? (
                          <p className="bg-brand-soft text-body w-full rounded-2xl rounded-tl-md px-3 py-2 whitespace-pre-line">
                            {it.decision.comment}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <StatusPill status={it.status} className="bg-surface" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {!closed ? (
            <Button
              variant="ghost"
              className="text-danger-ink self-start px-4"
              onClick={() => setCancelling(true)}
            >
              Cancelar envio
            </Button>
          ) : null}
        </div>
      ) : null}

      <Dialog open={revoking !== null} onOpenChange={(o) => !o && setRevoking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revogar link?</DialogTitle>
            <DialogDescription>
              Quem tiver o link &ldquo;{revoking?.recipientName || revoking?.label || "sem nome"}
              &rdquo; não conseguirá mais abrir esta página.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevoking(null)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                revoking &&
                run(
                  () => revokeApprovalLink(revoking.id),
                  "Link revogado",
                  () => setRevoking(null),
                )
              }
            >
              Revogar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelling} onOpenChange={setCancelling}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar envio?</DialogTitle>
            <DialogDescription>
              Os links deixam de funcionar e as publicações ainda pendentes voltam para rascunho.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelling(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(
                  () => cancelApprovalRequest(request.id),
                  "Envio cancelado",
                  () => setCancelling(false),
                )
              }
            >
              Cancelar envio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newLinkOpen} onOpenChange={setNewLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo link</DialogTitle>
            <DialogDescription>
              Gere um link para mais uma pessoa. Cada link vale para uma pessoa.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newName}
            maxLength={80}
            placeholder="Nome (ex.: Carlos)"
            aria-label="Nome de quem vai aprovar"
            onChange={(e) => setNewName(e.target.value)}
          />
          <Input
            value={newContact}
            maxLength={120}
            placeholder="Contato (opcional)"
            aria-label="Contato (opcional)"
            onChange={(e) => setNewContact(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewLinkOpen(false)}>
              Voltar
            </Button>
            <Button disabled={pending || !newName.trim()} onClick={newLink}>
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
              Gerar link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {reopenOpen ? (
        <ReopenSheet
          request={request}
          open
          onOpenChange={setReopenOpen}
          onIssued={(links) => {
            setIssued(links);
            router.refresh();
          }}
        />
      ) : null}

      {issued ? (
        <ShareLinkSheet
          open
          onOpenChange={(o) => !o && setIssued(null)}
          links={issued}
          message={request.message}
          profileId={request.profile.id}
        />
      ) : null}
    </article>
  );
}
