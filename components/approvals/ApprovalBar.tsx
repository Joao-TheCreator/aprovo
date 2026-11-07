"use client";

import { ArrowDown, Check, CheckCheck, Loader2, MessageCircle } from "lucide-react";
import { useId, useState } from "react";

import { InitialsAvatar } from "@/components/approvals/bits";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SuccessBurst } from "@/components/ui/success-burst";
import { Textarea } from "@/components/ui/textarea";
import type { DecisionRecord } from "@/lib/approvals/contracts";
import { formatDecisionStamp } from "@/lib/approvals/ui-format";
import { haptic } from "@/lib/ui/haptics";
import { cn } from "@/lib/utils";

export type ApproveAllControl = {
  count: number;
  busy: boolean;
  onClick: () => void;
};

/**
 * Glass decision bar fixed at the bottom of the public page (docs/14, área C). It always acts on
 * the item in focus (`position`), shows who is deciding and, with 2+ pending items, floats an
 * "Aprovar todos" pill above itself. Never rendered in receipt (read-only) mode.
 */
export function ApprovalBar({
  itemId,
  position,
  decision,
  justDecided = false,
  lockedNote,
  mode,
  recipientName,
  approverName,
  busy,
  error,
  onDecide,
  onNext,
  approveAll,
  bulkStatus,
  onComposingChange,
}: {
  /** Post in focus; the comment draft resets when it changes. */
  itemId: string;
  /** "2 de 5" of the item in focus. */
  position: { index: number; total: number };
  decision: DecisionRecord | null;
  /** True right after this device decided the item: plays the burst. */
  justDecided?: boolean;
  /** Shown when there is no decision but the item cannot be decided now. */
  lockedNote: string | null;
  mode: "personal" | "shared";
  /** Recipient of a personal link; shown as "Decidindo como ...". */
  recipientName: string | null;
  /** Name typed on a shared link (optional). */
  approverName: string;
  busy: boolean;
  error: string | null;
  onDecide: (decision: "approved" | "changes_requested", comment: string) => Promise<boolean>;
  /** Jumps to the next pending item; null when nothing else is pending. */
  onNext: (() => void) | null;
  approveAll: ApproveAllControl | null;
  /** Progress or error line of "Aprovar todos". */
  bulkStatus?: { tone: "info" | "error"; text: string } | null;
  /** True while the comment box is open, so the page keeps the focus on this item. */
  onComposingChange?: (composing: boolean) => void;
}) {
  const uid = useId();
  const [askingChanges, setAskingChangesState] = useState(false);
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [forId, setForId] = useState(itemId);
  if (forId !== itemId) {
    setForId(itemId);
    setAskingChangesState(false);
    setComment("");
    setCommentError(null);
  }

  function setAskingChanges(value: boolean) {
    setAskingChangesState(value);
    onComposingChange?.(value);
  }

  const who = mode === "personal" ? recipientName : approverName.trim() || null;

  async function approve() {
    const ok = await onDecide("approved", "");
    haptic(ok ? "success" : "error");
  }

  async function sendChanges() {
    if (!comment.trim()) {
      setCommentError("Conta pra gente o que precisa mudar.");
      haptic("error");
      return;
    }
    setCommentError(null);
    const ok = await onDecide("changes_requested", comment.trim());
    haptic(ok ? "warning" : "error");
    if (ok) {
      setAskingChanges(false);
      setComment("");
    }
  }

  const nextButton = onNext ? (
    <Button className="h-12 shrink-0 px-4" onClick={onNext}>
      Próxima
      <ArrowDown aria-hidden />
    </Button>
  ) : null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto flex w-full max-w-[430px] flex-col items-center gap-2 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {approveAll && approveAll.count > 1 && !askingChanges ? (
          <Button
            variant="success"
            disabled={approveAll.busy || busy}
            onClick={approveAll.onClick}
            className="animate-pop-in pointer-events-auto h-11 pr-2 pl-4"
          >
            {approveAll.busy ? (
              <Loader2 aria-hidden className="animate-spin" />
            ) : (
              <CheckCheck aria-hidden />
            )}
            Aprovar todos
            <span className="sr-only"> ({approveAll.count})</span>
            <span
              aria-hidden
              className="bg-ink text-success flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs"
            >
              {approveAll.count}
            </span>
          </Button>
        ) : null}
        {bulkStatus ? (
          <p
            role={bulkStatus.tone === "error" ? "alert" : "status"}
            className={cn(
              "glass text-caption pointer-events-auto rounded-full border border-white/10 px-3 py-1.5",
              bulkStatus.tone === "error" ? "text-danger-ink" : "text-foreground",
            )}
          >
            {bulkStatus.text}
          </p>
        ) : null}

        <section
          aria-label="Sua decisão"
          className="glass shadow-sheet animate-sheet-in pointer-events-auto flex w-full flex-col gap-3 rounded-4xl border border-white/10 p-3"
        >
          <div className="flex min-h-9 items-center justify-between gap-2 px-1">
            {who ? (
              <span className="bg-surface-2/80 flex min-w-0 items-center gap-2 rounded-full py-1 pr-3 pl-1">
                <InitialsAvatar name={who} className="size-7 text-[0.625rem]" />
                <span className="text-caption truncate">
                  Decidindo como <strong>{who}</strong>
                </span>
              </span>
            ) : (
              <span className="text-caption text-muted-foreground px-1">Sua decisão</span>
            )}
            <span className="text-micro text-muted-foreground shrink-0 uppercase">
              {position.index} de {position.total}
            </span>
          </div>

          {decision ? (
            <div className="flex items-center gap-2">
              <span
                role="status"
                className={cn(
                  "text-ink relative flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-full px-4 text-sm font-bold",
                  decision.decision === "approved"
                    ? "bg-gradient-success shadow-glow-success"
                    : "bg-warning",
                )}
              >
                {justDecided && decision.decision === "approved" ? <SuccessBurst /> : null}
                {decision.decision === "approved" ? (
                  <Check
                    aria-hidden
                    className="animate-success-pop size-5 shrink-0"
                    strokeWidth={3}
                  />
                ) : (
                  <MessageCircle aria-hidden className="size-5 shrink-0" strokeWidth={2.5} />
                )}
                <span className="truncate" suppressHydrationWarning>
                  {decision.decision === "approved" ? "Aprovado" : "Ajustes pedidos"} em{" "}
                  {formatDecisionStamp(decision.decidedAt)}
                </span>
              </span>
              {nextButton}
            </div>
          ) : lockedNote ? (
            <div className="flex items-center gap-2">
              <p role="status" className="text-caption text-muted-foreground flex-1 px-1">
                {lockedNote}
              </p>
              {nextButton}
            </div>
          ) : askingChanges ? (
            <div className="animate-rise flex flex-col gap-2">
              <Label htmlFor={`${uid}-comment`} className="px-1">
                O que precisa mudar?
              </Label>
              <Textarea
                id={`${uid}-comment`}
                value={comment}
                rows={3}
                maxLength={2000}
                required
                autoFocus
                placeholder="Ex.: troca a foto da capa e tira a hashtag #promo"
                aria-invalid={commentError ? true : undefined}
                aria-describedby={commentError ? `${uid}-comment-error` : undefined}
                className="max-h-[30dvh] min-h-24"
                onChange={(e) => setComment(e.target.value)}
              />
              {commentError ? (
                <p
                  id={`${uid}-comment-error`}
                  role="alert"
                  className="text-danger-ink text-caption px-1"
                >
                  {commentError}
                </p>
              ) : null}
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setAskingChanges(false);
                    setCommentError(null);
                  }}
                >
                  Voltar
                </Button>
                <Button disabled={busy} onClick={() => void sendChanges()}>
                  {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
                  Enviar ajustes
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-[1.4fr_1fr] gap-2">
              <Button
                variant="success"
                size="lg"
                className="px-4 text-base"
                disabled={busy}
                onClick={() => void approve()}
              >
                {busy ? (
                  <Loader2 aria-hidden className="animate-spin" />
                ) : (
                  <Check aria-hidden strokeWidth={3} />
                )}
                Aprovar
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="border-outline-strong/60 border px-3 text-sm"
                disabled={busy}
                onClick={() => {
                  setAskingChanges(true);
                  haptic("tap");
                }}
              >
                <MessageCircle aria-hidden />
                Pedir ajustes
              </Button>
            </div>
          )}

          {error ? (
            <p role="alert" className="text-danger-ink text-caption px-1">
              {error}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
