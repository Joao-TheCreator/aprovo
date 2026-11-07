"use client";

import { ChevronDown, Link2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ReopenSheet } from "@/components/approvals/ReopenSheet";
import { ShareLinkSheet } from "@/components/approvals/ShareLinkSheet";
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

const REQUEST_STATUS: Record<ApprovalRequestSummary["status"], { label: string; cls: string }> = {
  open: { label: "Aberto", cls: "bg-roxo-apoio text-white" },
  partially_decided: { label: "Parcial", cls: "bg-lavanda text-roxo" },
  decided: { label: "Decidido", cls: "bg-verde text-ink" },
  revoked: { label: "Cancelado", cls: "border border-border bg-white text-ink-2" },
};

function countsText(c: ApprovalRequestSummary["counts"]): string {
  const parts = [plural(c.items, "item", "itens")];
  if (c.approved) parts.push(plural(c.approved, "aprovada", "aprovadas"));
  if (c.changes) parts.push(plural(c.changes, "ajuste", "ajustes"));
  if (c.pending) parts.push(plural(c.pending, "aguardando", "aguardando"));
  return parts.join(" · ");
}

function linkState(l: ApprovalLinkSummary): { label: string; active: boolean } {
  if (l.revokedAt) return { label: "Cancelado", active: false };
  if (l.usedAt) {
    return {
      label:
        l.usedReason === "superseded"
          ? "Substituído por link novo"
          : `Usado em ${formatDateTimeBr(l.usedAt)}`,
      active: false,
    };
  }
  if (new Date(l.expiresAt).getTime() < Date.now()) return { label: "Expirado", active: false };
  const until = `válido até ${formatDateBr(l.expiresAt)}`;
  return {
    label: l.mode === "shared" ? `Link aberto · ${until}` : `Ativo · ${until}`,
    active: true,
  };
}

function OpensList({ opens }: { opens: ApprovalLinkSummary["opens"] }) {
  const [shown, setShown] = useState(false);
  if (opens.length === 0) return null;
  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={shown}
        onClick={() => setShown((v) => !v)}
        className="text-roxo focus-visible:ring-ring/50 min-h-8 rounded text-xs font-semibold outline-none focus-visible:ring-[3px]"
      >
        {shown ? "Ocultar aberturas" : "Ver aberturas"}
      </button>
      {shown ? (
        <ul
          className="text-muted-foreground mt-1 flex flex-col gap-0.5 text-xs"
          suppressHydrationWarning
        >
          {opens.map((o, i) => (
            <li key={i}>
              {formatDayMonthTime(o.openedAt)} · {o.ip ?? "IP não informado"} ·{" "}
              {shortUserAgent(o.userAgent)}
            </li>
          ))}
        </ul>
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
  const detailsId = `req-${request.id}-details`;

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
    <article className="bg-card border-border flex flex-col gap-3 rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-base leading-6 font-semibold">
            <Link
              href={`/perfis/${request.profile.id}/aprovacoes/${request.id}`}
              className="focus-visible:ring-ring/50 rounded outline-none hover:underline focus-visible:ring-[3px]"
            >
              {title}
            </Link>
          </h2>
          {showProfile ? (
            <p className="text-muted-foreground text-sm">@{request.profile.igUsername}</p>
          ) : null}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs leading-4 font-semibold",
            status.cls,
          )}
        >
          {status.label}
        </span>
      </div>

      <p className="text-sm">{countsText(request.counts)}</p>

      <ul className="flex gap-1.5 overflow-x-auto" aria-label="Publicações do envio">
        {request.items.map((it) => (
          <li
            key={it.postId}
            className="size-14 shrink-0 overflow-hidden rounded-lg bg-neutral-200"
          >
            {it.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.thumbUrl} alt="" loading="lazy" className="size-full object-cover" />
            ) : null}
          </li>
        ))}
      </ul>

      <p className="text-muted-foreground text-xs" suppressHydrationWarning>
        Criado em {formatDateBr(request.createdAt)}
      </p>

      {roundLines.length > 1 ||
      (roundLines.length === 1 && request.rounds[0].decisions.length > 0) ? (
        <ol
          aria-label="Rodadas"
          className="text-muted-foreground flex flex-col gap-0.5 text-xs"
          suppressHydrationWarning
        >
          {roundLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((v) => !v)}
          className="text-roxo focus-visible:ring-ring/50 flex min-h-11 items-center gap-1 self-start rounded-full text-sm font-semibold outline-none focus-visible:ring-[3px]"
        >
          <ChevronDown
            aria-hidden
            className={cn("size-4 transition-transform", expanded && "rotate-180")}
          />
          Links e decisões
        </button>
        {canReopen ? (
          <Button variant="secondary" className="min-h-11" onClick={() => setReopenOpen(true)}>
            Reabrir
          </Button>
        ) : null}
      </div>

      {expanded ? (
        <div id={detailsId} className="flex flex-col gap-4">
          <section aria-label="Links" className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Links</h3>
            {request.links.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum link gerado.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {request.links.map((l) => {
                  const st = linkState(l);
                  return (
                    <li
                      key={l.id}
                      className="bg-background flex items-center justify-between gap-2 rounded-xl p-3"
                    >
                      <div className="min-w-0 text-sm">
                        <p className="flex items-center gap-1.5 font-semibold">
                          <Link2 aria-hidden className="size-4 shrink-0" />
                          <span className="truncate">
                            {l.recipientName || l.label || "Link sem nome"}
                          </span>
                        </p>
                        {l.recipientContact ? (
                          <p className="text-muted-foreground text-xs">{l.recipientContact}</p>
                        ) : null}
                        <p className="text-muted-foreground text-xs" suppressHydrationWarning>
                          abriu {l.openedCount}×
                          {l.lastOpenedAt ? ` · última ${formatDayMonthTime(l.lastOpenedAt)}` : ""}
                        </p>
                        <OpensList opens={l.opens} />
                        {decisionsText(l, request.counts.items) ? (
                          <p className="text-xs font-semibold">
                            {decisionsText(l, request.counts.items)}
                          </p>
                        ) : null}
                        <p className="text-muted-foreground text-xs" suppressHydrationWarning>
                          {st.label}
                        </p>
                      </div>
                      {st.active ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-11"
                          onClick={() => setRevoking(l)}
                        >
                          Revogar
                        </Button>
                      ) : null}
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
                Novo link
              </Button>
            ) : null}
          </section>

          <section aria-label="Decisões" className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Decisões</h3>
            <ul className="flex flex-col gap-2">
              {request.items.map((it) => (
                <li key={it.postId} className="bg-background flex gap-3 rounded-xl p-3">
                  <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-neutral-200">
                    {it.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.thumbUrl}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                    <p className="truncate">{shortCaption(it.caption, 60)}</p>
                    {it.decision ? (
                      <>
                        <p className="text-muted-foreground text-xs" suppressHydrationWarning>
                          <strong className="text-foreground">
                            {it.decision.decision === "approved" ? "Aprovou" : "Pediu ajustes"}
                          </strong>{" "}
                          · {it.decidedViaLink || it.decision.approverName || "Cliente"} ·{" "}
                          {formatDateTimeBr(it.decision.decidedAt)}
                        </p>
                        {it.decision.comment ? (
                          <p className="bg-lavanda rounded-lg p-2 whitespace-pre-line">
                            {it.decision.comment}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <div>
                        <StatusPill status={it.status} />
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {!closed ? (
            <Button variant="outline" className="self-start" onClick={() => setCancelling(true)}>
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
            <Button variant="outline" onClick={() => setRevoking(null)}>
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
            <Button variant="outline" onClick={() => setCancelling(false)}>
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
            <Button variant="outline" onClick={() => setNewLinkOpen(false)}>
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
