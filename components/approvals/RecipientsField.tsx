"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const MAX_RECIPIENTS = 5;

export type RecipientRow = { key: number; name: string; contact: string };

let nextKey = 1;
export function newRecipientRow(): RecipientRow {
  return { key: nextKey++, name: "", contact: "" };
}

/** "Para quem?": one row per person (name required, contact optional). */
export function RecipientsField({
  rows,
  onChange,
  idPrefix,
}: {
  rows: RecipientRow[];
  onChange: (rows: RecipientRow[]) => void;
  idPrefix: string;
}) {
  function update(key: number, patch: Partial<RecipientRow>) {
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-semibold">Para quem?</legend>
      {rows.map((r, i) => (
        <div
          key={r.key}
          className="bg-card border-border flex flex-col gap-2 rounded-2xl border p-3"
        >
          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor={`${idPrefix}-name-${r.key}`}>Nome</Label>
              <Input
                id={`${idPrefix}-name-${r.key}`}
                value={r.name}
                maxLength={80}
                placeholder="Carlos"
                onChange={(e) => update(r.key, { name: e.target.value })}
              />
            </div>
            {rows.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="min-h-11 min-w-11"
                aria-label={`Remover pessoa ${i + 1}`}
                onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
              >
                <X aria-hidden />
              </Button>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-contact-${r.key}`}>Contato (opcional)</Label>
            <Input
              id={`${idPrefix}-contact-${r.key}`}
              value={r.contact}
              maxLength={120}
              placeholder="WhatsApp (11) 91234-5678"
              onChange={(e) => update(r.key, { contact: e.target.value })}
            />
          </div>
        </div>
      ))}
      {rows.length < MAX_RECIPIENTS ? (
        <Button
          type="button"
          variant="secondary"
          className="self-start"
          onClick={() => onChange([...rows, newRecipientRow()])}
        >
          <Plus aria-hidden />
          outra pessoa
        </Button>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Só você vê o contato. Ele ajuda a lembrar por onde mandou o link.
      </p>
    </fieldset>
  );
}
