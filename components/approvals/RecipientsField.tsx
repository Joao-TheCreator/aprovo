"use client";

import { Plus, X } from "lucide-react";

import { InitialsAvatar } from "@/components/approvals/bits";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const MAX_RECIPIENTS = 5;

export type RecipientRow = { key: number; name: string; contact: string };

let nextKey = 1;
export function newRecipientRow(): RecipientRow {
  return { key: nextKey++, name: "", contact: "" };
}

/**
 * "Para quem?": one row per person (name required, contact optional), each with an initials
 * avatar that fills in as you type. The "Nome" label is frozen (e2e).
 */
export function RecipientsField({
  rows,
  onChange,
  idPrefix,
  hideLegend = false,
}: {
  rows: RecipientRow[];
  onChange: (rows: RecipientRow[]) => void;
  idPrefix: string;
  /** Keeps the "Para quem?" legend for screen readers only (when the page shows its own title). */
  hideLegend?: boolean;
}) {
  function update(key: number, patch: Partial<RecipientRow>) {
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className={cn("text-title mb-1", hideLegend && "sr-only")}>Para quem?</legend>
      <ul className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <li
            key={r.key}
            className="bg-surface-2/50 border-border animate-rise flex gap-3 rounded-3xl border p-3"
          >
            <InitialsAvatar name={r.name} ring={r.name.trim().length > 0} className="size-10" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${idPrefix}-name-${r.key}`}>Nome</Label>
                <Input
                  id={`${idPrefix}-name-${r.key}`}
                  value={r.name}
                  maxLength={80}
                  placeholder="Carlos"
                  autoComplete="off"
                  onChange={(e) => update(r.key, { name: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${idPrefix}-contact-${r.key}`}>Contato (opcional)</Label>
                <Input
                  id={`${idPrefix}-contact-${r.key}`}
                  value={r.contact}
                  maxLength={120}
                  placeholder="WhatsApp (11) 91234-5678"
                  autoComplete="off"
                  onChange={(e) => update(r.key, { contact: e.target.value })}
                />
              </div>
            </div>
            {rows.length > 1 ? (
              <button
                type="button"
                aria-label={`Remover pessoa ${i + 1}`}
                onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
                className="press text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-visible:ring-ring flex size-11 shrink-0 items-center justify-center self-start rounded-full outline-none focus-visible:ring-2"
              >
                <X aria-hidden className="size-5" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {rows.length < MAX_RECIPIENTS ? (
        <button
          type="button"
          onClick={() => onChange([...rows, newRecipientRow()])}
          className="press border-outline-strong text-brand-ink hover:border-brand-ink hover:bg-brand-soft focus-visible:ring-ring flex min-h-12 items-center justify-center gap-2 rounded-full border-[1.5px] border-dashed text-sm font-bold outline-none focus-visible:ring-2"
        >
          <Plus aria-hidden className="size-5" />
          outra pessoa
        </button>
      ) : null}
      <p className="text-caption text-muted-foreground font-normal">
        Só você vê o contato. Ele ajuda a lembrar por onde mandou o link.
      </p>
    </fieldset>
  );
}
