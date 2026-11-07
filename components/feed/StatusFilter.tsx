"use client";

import type { PostStatus } from "@/lib/profiles/contracts";
import { cn } from "@/lib/utils";

export type StatusFilterValue = "all" | PostStatus;

const OPTIONS: { value: StatusFilterValue; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "draft", label: "Rascunho" },
  { value: "pending_approval", label: "Aguardando" },
  { value: "approved", label: "Aprovada" },
  { value: "changes_requested", label: "Ajustes" },
  { value: "scheduled", label: "Agendada" },
  { value: "published", label: "Publicada" },
];

export function StatusFilter({
  value,
  onChange,
  counts,
}: {
  value: StatusFilterValue;
  onChange: (v: StatusFilterValue) => void;
  counts: Record<StatusFilterValue, number>;
}) {
  return (
    <div className="mx-auto flex w-full flex-col gap-1.5 md:max-w-[430px]">
      <div role="group" aria-label="Filtrar por status" className="flex gap-2 overflow-x-auto pb-1">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "focus-visible:ring-ring/50 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold outline-none focus-visible:ring-[3px]",
              value === o.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground",
            )}
          >
            {o.label}
            <span className="text-xs opacity-80">{counts[o.value]}</span>
          </button>
        ))}
      </div>
      {value !== "all" ? (
        <p className="text-muted-foreground text-xs" role="status">
          Volte para Todos para reordenar.
        </p>
      ) : null}
    </div>
  );
}
