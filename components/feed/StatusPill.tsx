import {
  AlertTriangle,
  Check,
  CheckCheck,
  Clock,
  MessageCircle,
  Pencil,
  Send,
  type LucideIcon,
} from "lucide-react";

import type { PostStatus } from "@/lib/profiles/contracts";
import { cn } from "@/lib/utils";

export type { PostStatus };

/** Frozen: e2e tests read these exact strings (docs/14, "Rótulos congelados"). */
export const STATUS_LABELS: Record<PostStatus, string> = {
  draft: "Rascunho",
  pending_approval: "Aguardando aprovação",
  approved: "Aprovada",
  changes_requested: "Ajustes solicitados",
  scheduled: "Agendada",
  published: "Publicada",
  publish_failed: "Falhou",
};

const STATUS_STYLES: Record<
  PostStatus,
  { icon: LucideIcon; dot: string; solid: string; live?: boolean }
> = {
  draft: {
    icon: Pencil,
    dot: "text-status-draft",
    solid: "border-outline-strong text-muted-foreground border bg-transparent",
  },
  pending_approval: {
    icon: Clock,
    dot: "text-status-pending",
    solid: "bg-roxo-apoio text-white",
    live: true,
  },
  approved: { icon: Check, dot: "text-status-approved", solid: "bg-verde text-ink" },
  changes_requested: {
    icon: MessageCircle,
    dot: "text-status-changes",
    solid: "bg-warning text-ink",
  },
  scheduled: { icon: Send, dot: "text-status-scheduled", solid: "bg-gradient-brand text-white" },
  published: {
    icon: CheckCheck,
    dot: "text-status-published",
    solid: "bg-status-published text-ink",
  },
  publish_failed: { icon: AlertTriangle, dot: "text-status-failed", solid: "bg-danger text-white" },
};

export type StatusPillVariant = "dot" | "solid" | "overlay";

/**
 * Status pill v2 (docs/14, "Status pills"): colored dot + label.
 * - `dot` (default): neutral surface, colored dot; "Aguardando aprovação" pulses.
 * - `solid`: v1-style filled pill with icon (for emphasis in headers).
 * - `overlay`: dark glass for use on top of photos (feed grid); always dark-themed.
 * The label is plain text in the pill, so `getByText("Aprovada", { exact: true })` keeps working.
 */
export function StatusPill({
  status,
  className,
  variant = "dot",
}: {
  status: PostStatus;
  className?: string;
  variant?: StatusPillVariant;
}) {
  const { icon: Icon, dot, solid, live } = STATUS_STYLES[status];

  if (variant === "solid") {
    return (
      <span
        data-status={status}
        className={cn(
          "text-caption inline-flex items-center gap-1 rounded-full px-2.5 py-1 whitespace-nowrap",
          solid,
          className,
        )}
      >
        <Icon className="size-3.5" strokeWidth={2} aria-hidden />
        {STATUS_LABELS[status]}
      </span>
    );
  }

  return (
    <span
      data-status={status}
      data-theme={variant === "overlay" ? "dark" : undefined}
      className={cn(
        "text-caption inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 whitespace-nowrap",
        variant === "overlay"
          ? "border border-white/10 bg-black/60 text-white backdrop-blur-md"
          : "bg-surface-2 text-foreground",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full bg-current", dot, live && "animate-pulse-dot")}
      />
      {STATUS_LABELS[status]}
    </span>
  );
}
