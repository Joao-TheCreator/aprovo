import { Plus } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/app/EmptyState";
import { PhoneFrame } from "@/components/app/PhoneFrame";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { isOAuthConfigured } from "@/lib/instagram/oauth";
import { listProfiles } from "@/lib/profiles/queries";
import type { ProfileListItem } from "@/lib/profiles/contracts";
import { relativeTimePt } from "@/lib/profiles/ui-time";
import { cn } from "@/lib/utils";

function statusLine(p: ProfileListItem): string {
  if (p.importStatus === "failed") return "Importação falhou";
  if (p.importStatus === "importing") return "Importando…";
  if (p.lastImportedAt) return `Importado ${relativeTimePt(p.lastImportedAt)}`;
  return "Sem feed";
}

function CountPill({ n, label, className }: { n: number; label: string; className: string }) {
  if (n <= 0) return null;
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs leading-4 font-semibold", className)}>
      {n} {label}
    </span>
  );
}

export default async function PerfisPage() {
  const profiles = await listProfiles();
  const oauth = isOAuthConfigured();

  return (
    <PhoneFrame className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl leading-8 font-bold">Perfis</h1>
        {profiles.length > 0 ? (
          <Button asChild>
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
        ) : null}
      </div>
      {profiles.length === 0 ? (
        <EmptyState
          title="Conecte a primeira conta"
          description={
            oauth
              ? "A conta precisa ser profissional (Empresa ou Criador). Você autoriza o APROVO uma vez por conta."
              : "A conexão com o Instagram não está configurada neste servidor. Você pode importar um perfil manualmente."
          }
        >
          {oauth ? (
            <div className="flex flex-col items-center gap-3">
              <Button asChild>
                <a href="/api/instagram/connect">
                  <Plus aria-hidden />
                  Conectar conta do Instagram
                </a>
              </Button>
              <Link
                href="/perfis/novo?manual=1"
                className="text-muted-foreground text-sm underline"
              >
                Importar manualmente
              </Link>
            </div>
          ) : (
            <Button asChild>
              <Link href="/perfis/novo">
                <Plus aria-hidden />
                Importar manualmente
              </Link>
            </Button>
          )}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {profiles.map((p) => (
            <li key={p.id}>
              <Link
                href={`/perfis/${p.id}`}
                className="border-border bg-card focus-visible:ring-ring/50 flex min-h-11 items-center gap-3 rounded-2xl border p-4 outline-none focus-visible:ring-[3px]"
              >
                <Avatar className="size-14">
                  {p.avatarUrl ? <AvatarImage src={p.avatarUrl} alt="" /> : null}
                  <AvatarFallback>{p.igUsername.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-semibold">@{p.igUsername}</span>
                  {p.displayName ? (
                    <span className="text-muted-foreground truncate text-sm">{p.displayName}</span>
                  ) : null}
                  <span
                    className={cn(
                      "text-xs",
                      p.importStatus === "failed" ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {statusLine(p)}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <CountPill
                      n={p.counts.pending_approval}
                      label="aguardando"
                      className="bg-roxo-apoio text-white"
                    />
                    <CountPill
                      n={p.counts.approved}
                      label={p.counts.approved === 1 ? "aprovada" : "aprovadas"}
                      className="bg-verde text-ink"
                    />
                    <CountPill
                      n={p.counts.changes_requested}
                      label="com ajustes"
                      className="bg-lavanda text-roxo"
                    />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PhoneFrame>
  );
}
