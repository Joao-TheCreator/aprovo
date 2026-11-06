import { Check, Clock, MessageCircle, Pencil, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type PostStatus = "draft" | "pending_approval" | "approved" | "changes_requested";

export const STATUS_LABELS: Record<PostStatus, string> = {
  draft: "Rascunho",
  pending_approval: "Aguardando aprovação",
  approved: "Aprovada",
  changes_requested: "Ajustes solicitados",
};

const STATUS_STYLES: Record<PostStatus, { icon: LucideIcon; className: string }> = {
  draft: { icon: Pencil, className: "border border-border bg-white text-ink-2" },
  pending_approval: { icon: Clock, className: "bg-roxo-apoio text-white" },
  approved: { icon: Check, className: "bg-verde text-ink" },
  changes_requested: { icon: MessageCircle, className: "bg-lavanda text-roxo" },
};

export function StatusPill({ status, className }: { status: PostStatus; className?: string }) {
  const { icon: Icon, className: styles } = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs leading-4 font-semibold whitespace-nowrap",
        styles,
        className,
      )}
    >
      <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}
