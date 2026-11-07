import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Empty state v2 (docs/14, "Estados vazios"): big display title with attitude, optional icon
 * in a glowing badge, short copy and one clear action. v1 props unchanged; `icon`, `eyebrow`
 * and `tone` are optional additions.
 */
export function EmptyState({
  title,
  description,
  children,
  className,
  icon: Icon,
  eyebrow,
  tone = "brand",
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
  icon?: LucideIcon;
  eyebrow?: string;
  tone?: "brand" | "success";
}) {
  return (
    <div
      className={cn(
        "bg-card border-border animate-rise relative isolate flex flex-col items-center gap-3 overflow-hidden rounded-4xl border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -top-24 left-1/2 -z-10 size-56 -translate-x-1/2 rounded-full opacity-60 blur-3xl",
          tone === "success" ? "bg-brand-2/40" : "bg-glow",
        )}
      />
      {Icon ? (
        <span
          aria-hidden
          className={cn(
            "mb-1 flex size-16 items-center justify-center rounded-3xl",
            tone === "success"
              ? "bg-gradient-success text-ink shadow-glow-success"
              : "bg-gradient-brand text-on-brand shadow-glow",
          )}
        >
          <Icon className="size-8" strokeWidth={2} />
        </span>
      ) : null}
      {eyebrow ? <p className="text-micro text-brand-ink uppercase">{eyebrow}</p> : null}
      <h2 className="font-display text-h2 max-w-[18ch] text-balance">{title}</h2>
      {description ? (
        <p className="text-body text-muted-foreground max-w-[34ch] text-pretty">{description}</p>
      ) : null}
      {children ? <div className="mt-3 flex flex-col items-center gap-2">{children}</div> : null}
    </div>
  );
}
