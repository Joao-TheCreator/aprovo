"use client";

import { Check, Loader2, MessageCircle } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DecisionRecord } from "@/lib/approvals/contracts";
import { formatDayMonth, formatTimeBr } from "@/lib/approvals/ui-format";

export function ApprovalBar({
  decision,
  lockedNote,
  readOnly = false,
  mode,
  recipientName,
  approverName,
  onApproverNameChange,
  busy,
  error,
  onDecide,
}: {
  decision: DecisionRecord | null;
  /** Shown when there is no decision but the item cannot be decided now. */
  lockedNote: string | null;
  /** Receipt mode (used link): never shows buttons. */
  readOnly?: boolean;
  mode: "personal" | "shared";
  /** Recipient of a personal link; shown as "Decidindo como ...". */
  recipientName: string | null;
  approverName: string;
  onApproverNameChange: (name: string) => void;
  busy: boolean;
  error: string | null;
  onDecide: (decision: "approved" | "changes_requested", comment: string) => Promise<boolean>;
}) {
  const uid = useId();
  const [askingChanges, setAskingChanges] = useState(false);
  const [comment, setComment] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);

  if (decision) {
    const approved = decision.decision === "approved";
    const Icon = approved ? Check : MessageCircle;
    return (
      <div
        role="status"
        className={`flex flex-col gap-1 rounded-2xl p-3 text-sm ${approved ? "bg-verde text-ink" : "bg-lavanda text-roxo"}`}
      >
        <p className="flex items-center gap-1.5 font-semibold" suppressHydrationWarning>
          <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2.5} />
          {approved ? "Aprovado" : "Ajustes solicitados"} em {formatDayMonth(decision.decidedAt)} às{" "}
          {formatTimeBr(decision.decidedAt)}
        </p>
        {decision.approverName ? <p>por {decision.approverName}</p> : null}
        {decision.comment ? <p className="whitespace-pre-line">{decision.comment}</p> : null}
      </div>
    );
  }

  if (readOnly) {
    return (
      <p role="status" className="bg-lavanda text-ink-2 rounded-2xl p-3 text-sm">
        Nenhuma decisão registrada para esta publicação.
      </p>
    );
  }

  if (lockedNote) {
    return (
      <p role="status" className="bg-lavanda text-ink-2 rounded-2xl p-3 text-sm">
        {lockedNote}
      </p>
    );
  }

  async function sendChanges() {
    if (!comment.trim()) {
      setCommentError("Descreva o ajuste que você precisa.");
      return;
    }
    setCommentError(null);
    await onDecide("changes_requested", comment.trim());
  }

  return (
    <div className="flex flex-col gap-3">
      {mode === "personal" && recipientName ? (
        <p className="text-sm">
          Decidindo como <strong>{recipientName}</strong>
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-name`}>Seu nome (opcional)</Label>
          <Input
            id={`${uid}-name`}
            value={approverName}
            maxLength={80}
            autoComplete="name"
            onChange={(e) => onApproverNameChange(e.target.value)}
          />
        </div>
      )}

      {askingChanges ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-comment`}>O que precisa mudar?</Label>
          <Textarea
            id={`${uid}-comment`}
            value={comment}
            rows={4}
            maxLength={2000}
            required
            aria-invalid={commentError ? true : undefined}
            onChange={(e) => setComment(e.target.value)}
          />
          {commentError ? (
            <p role="alert" className="text-destructive text-sm font-semibold">
              {commentError}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setAskingChanges(false)}>
              Voltar
            </Button>
            <Button disabled={busy} onClick={sendChanges}>
              {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
              Enviar ajustes
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="success" disabled={busy} onClick={() => void onDecide("approved", "")}>
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
            Aprovar
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => setAskingChanges(true)}>
            <MessageCircle aria-hidden />
            Pedir ajustes
          </Button>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-destructive text-sm font-semibold">
          {error}
        </p>
      ) : null}
    </div>
  );
}
