import { Camera, ChevronRight, Plus, Upload } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/app/EmptyState";
import { PhoneFrame } from "@/components/app/PhoneFrame";
import { ProfileAvatar } from "@/components/app/ProfileAvatar";
import { Button } from "@/components/ui/button";
import { cardVariants } from "@/components/ui/card";
import { Press } from "@/components/ui/press";
import { isOAuthConfigured } from "@/lib/instagram/oauth";
import { listProfiles } from "@/lib/profiles/queries";
import type { ProfileListItem } from "@/lib/profiles/contracts";
import { relativeTimePt } from "@/lib/profiles/ui-time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Perfis" };

function statusLine(p: ProfileListItem): string {
  if (p.importStatus === "failed") return "Importação falhou";
  if (p.importStatus === "importing") return "Importando…";
  if (p.lastImportedAt) return `Importado ${relativeTimePt(p.lastImportedAt)}`;
  return "Sem feed";
}

/** Counter as a dot pill (same language as StatusPill `dot`). Hidden when zero. */
function CountPill({
  n,
  label,
  dot,
  live = false,
}: {
  n: number;
  label: string;
  dot: string;
  live?: boolean;
}) {
  if (n <= 0) return null;
  return (
    <span className="bg-surface-2 text-foreground text-caption inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 whitespace-nowrap">
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full bg-current", dot, live && "animate-pulse-dot")}
      />
      {n} {label}
    </span>
  );
}

function ConnectCta({ oauth, className }: { oauth: boolean; className?: string }) {
  return (
    <Button asChild className={className}>
      {oauth ? (
        // API route (redirect to Instagram), not a page: plain anchor is intended.
        <a href="/api/instagram/connect">
          <Plus aria-hidden />
          Conectar conta do Instagram
        </a>
      ) : (
        <Link href="/perfis/novo">
          <Plus aria-hidden />
          Importar manualmente
        </Link>
      )}
    </Button>
  );
}

export default async function PerfisPage() {
  const profiles = await listProfiles();
  const oauth = isOAuthConfigured();
  const pendingTotal = profiles.reduce((sum, p) => sum + p.counts.pending_approval, 0);

  return (
    <PhoneFrame className="flex flex-col gap-8">
      <header className="animate-rise flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-micro text-brand-ink uppercase">
            {profiles.length === 1 ? "1 perfil" : `${profiles.length} perfis`}
            {pendingTotal > 0 ? ` · ${pendingTotal} aguardando` : ""}
          </p>
          <h1 className="font-display text-h1">
            Seus <span className="text-gradient-brand">perfis</span>
          </h1>
        </div>
        {profiles.length > 0 ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <ConnectCta oauth={oauth} className="w-full sm:w-auto" />
            {oauth ? (
              <Button asChild variant="ghost" className="w-full sm:w-auto">
                <Link href="/perfis/novo?manual=1">
                  <Upload aria-hidden />
                  Importar manualmente
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      {profiles.length === 0 ? (
        <EmptyState
          icon={Camera}
          eyebrow="Primeiro passo"
          title="Nada por aqui. Ainda."
          description={
            oauth
              ? "Conecte o primeiro Instagram e comece a montar o feed. A conta precisa ser profissional (Empresa ou Criador)."
              : "A conexão com o Instagram não está configurada neste servidor. Importe um perfil manualmente e comece a montar o feed."
          }
        >
          <ConnectCta oauth={oauth} />
          {oauth ? (
            <Button asChild variant="link" size="sm">
              <Link href="/perfis/novo?manual=1">Importar manualmente</Link>
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {profiles.map((p, i) => {
            const attention = p.counts.pending_approval + p.counts.changes_requested > 0;
            return (
              <li
                key={p.id}
                className="animate-rise"
                style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
              >
                <Press asChild scale="sm">
                  <Link
                    href={`/perfis/${p.id}`}
                    className={cn(
                      cardVariants({ variant: "default" }),
                      "hover:border-outline-strong focus-visible:ring-ring focus-visible:ring-offset-background flex-row items-center gap-4 p-4 transition-[transform,border-color] outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                    )}
                  >
                    <ProfileAvatar
                      src={p.avatarUrl}
                      initials={p.igUsername.slice(0, 2).toUpperCase()}
                      size="lg"
                      ring={attention}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex min-w-0 flex-col">
                        <span className="text-title truncate">@{p.igUsername}</span>
                        {p.displayName ? (
                          <span className="text-muted-foreground truncate text-sm">
                            {p.displayName}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <CountPill
                          n={p.counts.pending_approval}
                          label="aguardando"
                          dot="text-status-pending"
                          live
                        />
                        <CountPill
                          n={p.counts.changes_requested}
                          label="com ajustes"
                          dot="text-status-changes"
                        />
                        <CountPill
                          n={p.counts.approved}
                          label={p.counts.approved === 1 ? "aprovada" : "aprovadas"}
                          dot="text-status-approved"
                        />
                        <CountPill
                          n={p.counts.publish_failed}
                          label={p.counts.publish_failed === 1 ? "falhou" : "falharam"}
                          dot="text-status-failed"
                        />
                      </div>
                      <span
                        className={cn(
                          "text-caption inline-flex items-center gap-1.5 font-medium",
                          p.importStatus === "failed" ? "text-danger-ink" : "text-muted-foreground",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "size-1.5 rounded-full bg-current",
                            p.importStatus === "importing" &&
                              "text-status-pending animate-pulse-dot",
                          )}
                        />
                        {statusLine(p)}
                      </span>
                    </div>
                    <ChevronRight
                      aria-hidden
                      className="text-muted-foreground size-5 shrink-0"
                      strokeWidth={2}
                    />
                  </Link>
                </Press>
              </li>
            );
          })}
        </ul>
      )}
    </PhoneFrame>
  );
}
