import { Ban, Link2Off, TimerOff, type LucideIcon } from "lucide-react";

import { Logo } from "@/components/app/Logo";
import { APPROVAL_ERROR_MESSAGES } from "@/lib/approvals/contracts";

const REASONS: Record<
  "expired" | "revoked" | "inactive",
  { code: string; title: string; eyebrow: string; icon: LucideIcon }
> = {
  expired: {
    code: "link_expired",
    title: "Esse link já era.",
    eyebrow: "Link expirado",
    icon: TimerOff,
  },
  revoked: {
    code: "link_revoked",
    title: "Esse link saiu de cena.",
    eyebrow: "Link cancelado",
    icon: Ban,
  },
  inactive: {
    code: "link_inactive",
    title: "Esse link não vale mais.",
    eyebrow: "Link inativo",
    icon: Link2Off,
  },
};

/**
 * Public page for a link that no longer accepts decisions (docs/14, área C). The title has
 * attitude; the body is the official message for the reason (APPROVAL_ERROR_MESSAGES), so the
 * client always knows why and who to ask.
 */
export function InactiveLinkCard({ reason = "inactive" }: { reason?: keyof typeof REASONS }) {
  const { code, title, eyebrow, icon: Icon } = REASONS[reason];
  return (
    <div className="bg-background relative isolate flex flex-1 flex-col">
      <div aria-hidden className="bg-aurora pointer-events-none fixed inset-0 -z-10" />
      <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-1 flex-col items-center justify-center gap-8 px-4 py-[calc(2rem+env(safe-area-inset-top))]">
        <Logo height={32} className="self-center" />
        <section className="glass shadow-card animate-rise relative flex w-full flex-col items-center gap-4 overflow-hidden rounded-4xl border border-white/10 px-6 py-10 text-center">
          <span
            aria-hidden
            className="bg-gradient-brand text-on-brand shadow-glow flex size-16 items-center justify-center rounded-3xl"
          >
            <Icon className="size-8" strokeWidth={2} />
          </span>
          <p className="text-micro text-brand-ink uppercase">{eyebrow}</p>
          <h1 className="font-display text-h1 max-w-[14ch] text-balance">{title}</h1>
          <p className="text-body text-muted-foreground max-w-[32ch] text-pretty">
            {APPROVAL_ERROR_MESSAGES[code]}
          </p>
          <p className="text-caption text-muted-foreground bg-surface-2/70 rounded-full px-4 py-2">
            Quem te mandou o link gera outro em segundos.
          </p>
        </section>
      </main>
    </div>
  );
}
