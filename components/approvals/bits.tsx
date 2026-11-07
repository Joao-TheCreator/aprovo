import { initials } from "@/lib/approvals/ui-format";
import { cn } from "@/lib/utils";

/** Status tone of a dot pill; maps to the v2 status colors (docs/14, "Status de publicação"). */
export type DotTone = "pending" | "approved" | "changes" | "draft" | "failed" | "scheduled";

const DOT: Record<DotTone, string> = {
  pending: "text-status-pending",
  approved: "text-status-approved",
  changes: "text-status-changes",
  draft: "text-status-draft",
  failed: "text-status-failed",
  scheduled: "text-status-scheduled",
};

/** Dot + label pill (same look as `StatusPill variant="dot"`), for counts and link states. */
export function DotPill({
  tone,
  live = false,
  className,
  children,
}: {
  tone: DotTone;
  live?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "text-caption bg-surface-2 text-foreground inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 whitespace-nowrap",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full bg-current",
          DOT[tone],
          live && "animate-pulse-dot",
        )}
      />
      {children}
    </span>
  );
}

/** Round avatar with initials in display type over brand-soft (docs/14, "Avatar"). */
export function InitialsAvatar({
  name,
  className,
  ring = false,
}: {
  name: string | null | undefined;
  className?: string;
  /** Gradient ring (2 px), e.g. for whoever is deciding right now. */
  ring?: boolean;
}) {
  const face = (
    <span
      aria-hidden
      className={cn(
        "bg-brand-soft text-brand-ink font-display flex size-9 shrink-0 items-center justify-center rounded-full text-[0.75rem] leading-none font-bold",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
  if (!ring) return face;
  return (
    <span aria-hidden className="bg-gradient-brand flex shrink-0 rounded-full p-0.5">
      <span className="bg-background flex rounded-full p-0.5">{face}</span>
    </span>
  );
}

/** Thin progress bar with the brand gradient; the text next to it always says the numbers. */
export function ProgressMeter({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  label: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("bg-surface-2 h-2 w-full overflow-hidden rounded-full", className)}
    >
      <div
        className="bg-gradient-brand ease-out-expo h-full rounded-full transition-[width] duration-(--ap-dur-slow)"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
