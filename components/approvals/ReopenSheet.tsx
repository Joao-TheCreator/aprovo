"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

import {
  MAX_RECIPIENTS,
  RecipientsField,
  newRecipientRow,
  type RecipientRow,
} from "@/components/approvals/RecipientsField";
import { StatusPill } from "@/components/feed/StatusPill";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { reopenApprovalRequest } from "@/lib/approvals/actions";
import {
  APPROVAL_ERROR_MESSAGES,
  type ApprovalRequestSummary,
  type IssuedLink,
} from "@/lib/approvals/contracts";
import { lastRoundNote, shortCaption } from "@/lib/approvals/ui-format";
import { cn } from "@/lib/utils";

/** Current personal recipients of the request (one row per person, newest contact wins). */
function currentRecipients(request: ApprovalRequestSummary): RecipientRow[] {
  const byName = new Map<string, { name: string; contact: string }>();
  for (const l of request.links) {
    if (l.mode !== "personal" || l.revokedAt || !l.recipientName) continue;
    byName.set(l.recipientName.trim().toLowerCase(), {
      name: l.recipientName,
      contact: l.recipientContact ?? "",
    });
  }
  const rows = [...byName.values()].slice(0, MAX_RECIPIENTS).map((r) => ({
    ...newRecipientRow(),
    ...r,
  }));
  return rows.length > 0 ? rows : [newRecipientRow()];
}

/** "Reabrir": choose the items for a new round and who decides; new links come back via `onIssued`. */
export function ReopenSheet({
  request,
  open,
  onOpenChange,
  onIssued,
}: {
  request: ApprovalRequestSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIssued: (links: IssuedLink[]) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(request.reopenSuggestions));
  const [recipients, setRecipients] = useState<RecipientRow[]>(() => currentRecipients(request));
  const [error, setError] = useState<string | null>(null);

  const locked = (status: string) => status === "scheduled" || status === "published";
  const ready =
    selected.size > 0 && recipients.length > 0 && recipients.every((r) => r.name.trim().length > 0);

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await reopenApprovalRequest({
        requestId: request.id,
        postIds: request.items.filter((i) => selected.has(i.postId)).map((i) => i.postId),
        recipients: recipients.map((r) => ({
          name: r.name.trim(),
          contact: r.contact.trim() || undefined,
        })),
      });
      if (res.ok) {
        onIssued(res.data.links);
        onOpenChange(false);
      } else setError(APPROVAL_ERROR_MESSAGES[res.code] ?? res.message);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] w-full overflow-y-auto md:max-w-[430px]"
      >
        <SheetHeader>
          <SheetTitle>Reabrir envio</SheetTitle>
          <SheetDescription>
            Escolha as publicações para uma nova rodada. Cada pessoa recebe um link novo e o link
            anterior dela deixa de valer.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Publicações</legend>
            {request.items.map((it) => {
              const isLocked = locked(it.status);
              const note = lastRoundNote(request.rounds, it.postId);
              const id = `reopen-${request.id}-${it.postId}`;
              return (
                <label
                  key={it.postId}
                  htmlFor={id}
                  className={cn(
                    "bg-card border-border flex min-h-11 items-center gap-3 rounded-2xl border p-3",
                    isLocked && "opacity-60",
                  )}
                >
                  <input
                    id={id}
                    type="checkbox"
                    className="size-5 shrink-0"
                    disabled={isLocked}
                    checked={selected.has(it.postId) && !isLocked}
                    onChange={() => toggle(it.postId)}
                  />
                  <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-neutral-200">
                    {it.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.thumbUrl}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                    <span className="truncate">{shortCaption(it.caption, 60)}</span>
                    <span>
                      <StatusPill status={it.status} />
                    </span>
                    {note ? (
                      <span className="text-muted-foreground text-xs" suppressHydrationWarning>
                        {note}
                      </span>
                    ) : null}
                    {isLocked ? (
                      <span className="text-muted-foreground text-xs">
                        Agendadas ou publicadas não podem ser reabertas.
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </fieldset>

          <RecipientsField
            rows={recipients}
            onChange={setRecipients}
            idPrefix={`reopen-${request.id}`}
          />

          {error ? (
            <p role="alert" className="text-destructive text-sm font-semibold">
              {error}
            </p>
          ) : null}
          <Button disabled={pending || !ready} onClick={submit}>
            {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
            Reabrir e gerar links
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
