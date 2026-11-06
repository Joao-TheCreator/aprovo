"use client";

import { ChevronDown, Link2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

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
  issueApprovalLink,
  revokeApprovalLink,
} from "@/lib/approvals/actions";
import {
  APPROVAL_ERROR_MESSAGES,
  type ApprovalLinkSummary,
  type ApprovalRequestSummary,
} from "@/lib/approvals/contracts";
import {
  formatDateBr,
  formatDateTimeBr,
  formatDayMonth,
  plural,
  shortCaption,
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
  if (l.revokedAt) return { label: "Revogado", active: false };
  if (new Date(l.expiresAt).getTime() < Date.now()) return { label: "Expirado", active: false };
  return { label: `Válido até ${formatDateBr(l.expiresAt)}`, active: true };
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
  const [newLabel, setNewLabel] = useState("");
  const [issued, setIssued] = useState<string | null>(null);

  const status = REQUEST_STATUS[request.status];
  const title = request.title || `Envio de ${formatDayMonth(request.createdAt)}`;
  const closed = request.status === "revoked" || request.status === "decided";
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
      const res = await issueApprovalLink(request.id, newLabel.trim() || undefined);
      if (res.ok) {
        setNewLinkOpen(false);
        setNewLabel("");
        setIssued(res.data.url);
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
          <li key={it.postId} className="size-14 shrink-0 overflow-hidden rounded-lg bg-neutral-200">
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
                          <span className="truncate">{l.label || "Link sem nome"}</span>
                        </p>
                        <p className="text-muted-foreground text-xs" suppressHydrationWarning>
                          aberto {plural(l.openedCount, "vez", "vezes")}
                          {l.lastOpenedAt
                            ? ` · último acesso ${formatDateTimeBr(l.lastOpenedAt)}`
                            : ""}
                        </p>
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
              <Button variant="secondary" className="self-start" onClick={() => setNewLinkOpen(true)}>
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
                      <img src={it.thumbUrl} alt="" loading="lazy" className="size-full object-cover" />
                    ) : null}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                    <p className="truncate">{shortCaption(it.caption, 60)}</p>
                    {it.decision ? (
                      <>
                        <p
                          className="text-muted-foreground text-xs"
                          suppressHydrationWarning
                        >
                          <strong className="text-foreground">
                            {it.decision.decision === "approved" ? "Aprovou" : "Pediu ajustes"}
                          </strong>{" "}
                          · {it.decision.approverName || "Cliente"} ·{" "}
                          {formatDateTimeBr(it.decision.decidedAt)}
                          {it.decidedViaLink ? ` · ${it.decidedViaLink}` : ""}
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
              Quem tiver o link &ldquo;{revoking?.label || "sem nome"}&rdquo; não conseguirá mais
              abrir esta página.
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
                run(() => revokeApprovalLink(revoking.id), "Link revogado", () => setRevoking(null))
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
                run(() => cancelApprovalRequest(request.id), "Envio cancelado", () =>
                  setCancelling(false),
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
              Gere outro link para este envio, por exemplo para outro contato.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newLabel}
            maxLength={80}
            placeholder="WhatsApp do Carlos"
            aria-label="Nome do link"
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewLinkOpen(false)}>
              Voltar
            </Button>
            <Button disabled={pending} onClick={newLink}>
              {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
              Gerar link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {issued ? (
        <ShareLinkSheet
          open
          onOpenChange={(o) => !o && setIssued(null)}
          url={issued}
          message={request.message}
          profileId={request.profile.id}
        />
      ) : null}
    </article>
  );
}
