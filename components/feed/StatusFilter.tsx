"use client";

import type { PostStatus } from "@/lib/profiles/contracts";
import { cn } from "@/lib/utils";

export type StatusFilterValue = "all" | PostStatus;

const OPTIONS: { value: StatusFilterValue; label: string; dot?: string }[] = [
  { value: "all", label: "Todos" },
  { value: "draft", label: "Rascunho", dot: "bg-status-draft" },
  { value: "pending_approval", label: "Aguardando", dot: "bg-status-pending" },
  { value: "approved", label: "Aprovada", dot: "bg-status-approved" },
  { value: "changes_requested", label: "Ajustes", dot: "bg-status-changes" },
  { value: "scheduled", label: "Agendada", dot: "bg-status-scheduled" },
  { value: "published", label: "Publicada", dot: "bg-status-published" },
];

/** Status filter chips (Tela 06): horizontal rail, active chip in gradient (docs/14). */
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
      <div
        role="group"
        aria-label="Filtrar por status"
        className="-my-1 flex [scrollbar-width:none] gap-2 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] py-1 pr-6 [&::-webkit-scrollbar]:hidden"
      >
        {OPTIONS.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.value)}
              className={cn(
                "press focus-visible:ring-ring focus-visible:ring-offset-background text-caption inline-flex h-11 shrink-0 items-center gap-2 rounded-full pr-2 pl-3.5 font-bold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                "transition-[background-color,color,box-shadow] duration-(--ap-dur-fast)",
                active
                  ? "bg-gradient-brand text-on-brand shadow-glow"
                  : "bg-surface-2 text-foreground hover:bg-brand-soft",
              )}
            >
              {o.dot ? (
                <span
                  aria-hidden
                  className={cn("size-2 shrink-0 rounded-full", active ? "bg-on-brand" : o.dot)}
                />
              ) : null}
              {o.label}
              <span
                className={cn(
                  "min-w-6 rounded-full px-1.5 py-0.5 text-center text-[11px] leading-4 tabular-nums",
                  active ? "bg-white/20" : "bg-surface text-muted-foreground",
                )}
              >
                {counts[o.value]}
              </span>
            </button>
          );
        })}
      </div>
      {value !== "all" ? (
        <p className="text-muted-foreground text-caption font-medium" role="status">
          Volte para Todos para reordenar.
        </p>
      ) : null}
    </div>
  );
}
