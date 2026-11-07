import { and, eq, isNotNull } from "drizzle-orm";
import {
  CircleAlert,
  CircleCheck,
  Download,
  Info,
  LogOut,
  Palette,
  RefreshCw,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { db } from "@/db/client";
import { profiles, type InstagramConnection } from "@/db/schema";
import { PhoneFrame } from "@/components/app/PhoneFrame";
import { ProfileAvatar } from "@/components/app/ProfileAvatar";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { getCurrentWorkspace, requireUser } from "@/lib/auth/require";
import {
  activeOAuthProvider,
  canPublish,
  instagramScopes,
  isOAuthConfigured,
  listConnections,
  PUBLISH_SCOPE,
} from "@/lib/instagram/oauth";
import { getPublishingQuota } from "@/lib/publishing/actions";
import { countRescheduleableFailures } from "@/lib/publishing/connection-loss";
import { cn } from "@/lib/utils";
import { DeleteAccountButton } from "./DeleteAccountButton";
import { DisconnectButton } from "./DisconnectButton";
import { RescheduleFailedButton } from "./RescheduleFailedButton";

export const metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  not_configured: "A conexão com o Instagram não está configurada neste servidor.",
  denied: "A autorização foi cancelada no Instagram.",
  exchange_failed: "Não foi possível concluir a conexão com o Instagram. Tente novamente.",
  state_mismatch: "A sessão de conexão expirou ou é inválida. Tente conectar novamente.",
  no_instagram_page:
    "Nenhuma Página do Facebook ligada a uma conta profissional do Instagram foi encontrada. No Instagram, vá em Configurações › Contas vinculadas e vincule uma Página do Facebook, depois tente de novo.",
};

/** Status line of a connection; null for a healthy one (rendered as a plain "Conexão ativa"). */
function statusMessage(c: Pick<InstagramConnection, "status" | "username">): string | null {
  switch (c.status) {
    case "expired":
      return `O Instagram @${c.username} desconectou. Reconecte para continuar.`;
    case "missing_scope":
      return "Reconecte e autorize 'Publicar conteúdo'.";
    case "not_professional":
      return `A conta @${c.username} deixou de ser profissional. Mude para Criador ou Empresa e reconecte.`;
    case "revoked":
      return "Acesso revogado no Instagram. Reconecte para voltar a usar.";
    default:
      return null;
  }
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(d);
}

function accountTypeLabel(t: string | null) {
  switch (t?.toUpperCase()) {
    case "BUSINESS":
      return "Empresa";
    case "MEDIA_CREATOR":
    case "CREATOR":
      return "Criador";
    default:
      return t ?? "conta profissional";
  }
}

type Tone = "success" | "neutral" | "warning" | "danger";

const TONES: Record<Tone, { box: string; icon: string; Icon: LucideIcon }> = {
  success: { box: "border-success-ink/40", icon: "text-success-ink", Icon: CircleCheck },
  neutral: { box: "border-outline", icon: "text-brand-ink", Icon: Info },
  warning: { box: "border-warning-ink/40", icon: "text-warning-ink", Icon: TriangleAlert },
  danger: { box: "border-danger-ink/40", icon: "text-danger-ink", Icon: CircleAlert },
};

/** Inline banner/toast-like message (glass pill-ish card with a toned icon). */
function Banner({
  tone,
  role = "status",
  className,
  children,
}: {
  tone: Tone;
  role?: "status" | "alert";
  className?: string;
  children: React.ReactNode;
}) {
  const { box, icon, Icon } = TONES[tone];
  return (
    <div
      role={role}
      className={cn(
        "glass text-body flex items-start gap-3 rounded-3xl border px-4 py-3 font-medium",
        box,
        className,
      )}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", icon)} strokeWidth={2} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <h2 className="font-display text-h2 flex items-center gap-3">
      <span
        aria-hidden
        className="bg-brand-soft text-brand-ink flex size-10 shrink-0 items-center justify-center rounded-2xl"
      >
        <Icon className="size-5" strokeWidth={2} />
      </span>
      {children}
    </h2>
  );
}

function QuotaBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const high = pct >= 80;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-caption flex items-center justify-between">
        <span className="text-muted-foreground">Publicações hoje</span>
        <span className={cn("font-display tabular-nums", high && "text-warning-ink")}>
          {used}/{total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`Publicações hoje: ${used}/${total}`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={used}
        className="bg-surface-2 h-1.5 overflow-hidden rounded-full"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-(--ap-dur-slow) ease-out",
            high ? "bg-warning" : "bg-gradient-brand",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{
    connected?: string;
    disconnected?: string;
    error?: string;
    failed?: string;
  }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const ws = await getCurrentWorkspace(user.id!);
  const connections = ws ? await listConnections(ws.id) : [];
  // One query for the "Ver perfil" links (profiles.connection_id), scoped by workspace.
  const linked = ws
    ? await db
        .select({ id: profiles.id, connectionId: profiles.connectionId })
        .from(profiles)
        .where(and(eq(profiles.workspaceId, ws.id), isNotNull(profiles.connectionId)))
    : [];
  const profileByConnection = new Map(linked.map((p) => [p.connectionId, p.id]));
  // Daily publishing quota per publish-capable account (cached 10 min; null when unavailable).
  // TODO(T13?): "Avisar por e-mail quando publicar" toggle (needs `workspaces.notify_on_publish`).
  const quotaByConnection = new Map(
    await Promise.all(
      connections.map(async (c) => {
        const linkedProfileId = profileByConnection.get(c.id);
        const quota =
          linkedProfileId && c.status === "active" && canPublish(c)
            ? await getPublishingQuota(linkedProfileId)
            : null;
        return [c.id, quota] as const;
      }),
    ),
  );
  // Publications that failed while the account was disconnected (offer "Reagendar" once active).
  const failedByConnection = await countRescheduleableFailures(
    connections.filter((c) => c.status === "active").map((c) => c.id),
  );
  const configured = isOAuthConfigured();
  const publishEnabled = instagramScopes().includes(PUBLISH_SCOPE);
  const activeProvider = activeOAuthProvider();
  const error = sp.error ? (ERRORS[sp.error] ?? ERRORS.exchange_failed) : null;
  const failedParam = Number.parseInt(sp.failed ?? "", 10);
  const failedNotice = Number.isFinite(failedParam) && failedParam > 0 ? failedParam : 0;

  return (
    <PhoneFrame className="flex flex-col gap-8">
      <header className="animate-rise flex flex-col gap-2">
        {ws?.name ? <p className="text-micro text-brand-ink uppercase">{ws.name}</p> : null}
        <h1 className="font-display text-h1">Configurações</h1>
      </header>

      {sp.connected === "1" || sp.disconnected === "1" || error || failedNotice > 0 ? (
        <div className="flex flex-col gap-2">
          {sp.connected === "1" ? (
            <Banner tone="success" className="animate-pop-in">
              Instagram conectado com sucesso.
            </Banner>
          ) : null}
          {sp.disconnected === "1" ? (
            <Banner tone="neutral" className="animate-pop-in">
              Instagram desconectado.
            </Banner>
          ) : null}
          {failedNotice > 0 ? (
            <Banner tone="warning" className="animate-pop-in">
              {failedNotice === 1
                ? "1 publicação falhou enquanto a conta estava desconectada."
                : `${failedNotice} publicações falharam enquanto a conta estava desconectada.`}
            </Banner>
          ) : null}
          {error ? (
            <Banner tone="danger" role="alert" className="animate-pop-in">
              {error}
            </Banner>
          ) : null}
        </div>
      ) : null}

      <Card className="animate-rise gap-5 [animation-delay:40ms]">
        <CardHeader>
          <SectionTitle icon={RefreshCw}>Instagram</SectionTitle>
        </CardHeader>
        {connections.length > 0 ? (
          <>
            <ul className="flex flex-col gap-3">
              {connections.map((c) => {
                const profileId = profileByConnection.get(c.id);
                const publishGranted = canPublish(c);
                const statusText = statusMessage(c);
                const quota = quotaByConnection.get(c.id) ?? null;
                const failedCount = failedByConnection.get(c.id) ?? 0;
                const legacy = c.provider === "instagram" && activeProvider === "facebook";
                const needsReconnect = c.status !== "active";
                return (
                  <li
                    key={c.id}
                    className={cn(
                      "bg-surface-2/60 flex flex-col gap-4 rounded-3xl border p-4",
                      needsReconnect ? "border-warning-ink/40" : "border-outline",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <ProfileAvatar
                        src={c.profilePictureUrl}
                        initials={c.username.slice(0, 2).toUpperCase()}
                        size="md"
                        ring={!needsReconnect}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-title truncate">@{c.username}</p>
                        <p className="text-caption text-muted-foreground font-medium">
                          {accountTypeLabel(c.accountType)} · token válido até{" "}
                          {formatDate(c.tokenExpiresAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="brand">Feed</Badge>
                      {publishGranted ? <Badge variant="brand">Publicação</Badge> : null}
                    </div>
                    {statusText ? (
                      <Banner tone="warning">{statusText}</Banner>
                    ) : (
                      <p className="text-caption text-success-ink inline-flex items-center gap-2">
                        <span
                          aria-hidden
                          className="bg-status-approved animate-pulse-dot text-status-approved size-2 rounded-full"
                        />
                        Conexão ativa
                      </p>
                    )}
                    {quota ? <QuotaBar used={quota.used} total={quota.total} /> : null}
                    {publishEnabled && !publishGranted && c.status === "active" ? (
                      <p className="text-caption text-muted-foreground">
                        Reconecte para autorizar a publicação
                      </p>
                    ) : null}
                    {legacy ? (
                      <Banner tone="neutral">
                        Esta conexão usa o Login do Instagram. Este servidor está configurado para o
                        Login do Facebook; reconecte para usar o mesmo login.
                      </Banner>
                    ) : null}
                    {failedCount > 0 ? (
                      <RescheduleFailedButton connectionId={c.id} count={failedCount} />
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant={needsReconnect ? "default" : "secondary"}>
                        {/* API route (redirect to Instagram), not a page: plain anchor is intended. */}
                        <a href="/api/instagram/connect">
                          <RefreshCw aria-hidden />
                          Reconectar
                        </a>
                      </Button>
                      {profileId ? (
                        <Button asChild variant="outline">
                          <Link href={`/perfis/${profileId}`}>Ver perfil</Link>
                        </Button>
                      ) : null}
                      <DisconnectButton connectionId={c.id} username={c.username} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="text-caption text-muted-foreground font-medium">
              Para publicar automaticamente, a conta precisa ser profissional e autorizar
              &apos;Publicar conteúdo&apos;. Em modo de desenvolvimento, a conta precisa ser
              testadora do app.
            </p>
            {configured ? (
              <Button asChild variant="outline" className="self-start">
                <a href="/api/instagram/connect">Conectar outra conta do Instagram</a>
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <CardDescription>
              {activeProvider === "facebook"
                ? "Conecte com o Facebook uma conta profissional do Instagram (Criador ou Empresa) vinculada a uma Página do Facebook, para carregar feeds pela API oficial da Meta."
                : "Conecte uma conta profissional (Criador ou Empresa) para carregar feeds pela API oficial da Meta."}{" "}
              Em modo de desenvolvimento, a conta precisa ser testadora do app.
            </CardDescription>
            {configured ? (
              <Button asChild className="self-start">
                <a href="/api/instagram/connect">Conectar Instagram</a>
              </Button>
            ) : (
              <>
                <Button disabled className="self-start">
                  Conectar Instagram
                </Button>
                <p className="text-caption text-muted-foreground">
                  Configure META_FB_APP_ID e META_FB_APP_SECRET no servidor.
                </p>
              </>
            )}
          </>
        )}
      </Card>

      <Card className="animate-rise gap-4 [animation-delay:80ms]">
        <CardHeader>
          <SectionTitle icon={Palette}>Aparência</SectionTitle>
          <CardDescription>Segue o sistema por padrão. Você pode forçar um modo.</CardDescription>
        </CardHeader>
        <ThemeToggle className="self-start" />
      </Card>

      <Card className="animate-rise gap-5 [animation-delay:120ms]">
        <CardHeader>
          <SectionTitle icon={UserRound}>Conta</SectionTitle>
        </CardHeader>
        <div className="flex items-center gap-3">
          <ProfileAvatar src={user.image} name={user.name || user.email} size="md" ring />
          <div className="min-w-0">
            <p className="text-title truncate">{user.name || "—"}</p>
            <p className="text-caption text-muted-foreground font-medium break-all">
              {user.email || "—"}
            </p>
          </div>
        </div>
        <dl className="bg-surface-2/60 divide-outline flex flex-col divide-y rounded-3xl px-4 text-sm">
          <div className="flex items-center justify-between gap-3 py-3">
            <dt className="text-muted-foreground">Nome</dt>
            <dd className="truncate font-semibold">{user.name || "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <dt className="text-muted-foreground">E-mail</dt>
            <dd className="font-semibold break-all">{user.email || "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <dt className="text-muted-foreground">Workspace</dt>
            <dd className="truncate font-semibold">{ws?.name ?? "—"}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/auth/signout">
              <LogOut aria-hidden />
              Sair
            </a>
          </Button>
          <Button asChild variant="secondary">
            {/* File download from an API route: plain anchor is intended. */}
            <a href="/api/account/export" download>
              <Download aria-hidden />
              Exportar meus dados
            </a>
          </Button>
        </div>
        <div className="border-danger-ink/40 flex flex-col gap-3 rounded-3xl border border-dashed p-4">
          <div className="flex flex-col gap-1">
            <p className="text-micro text-danger-ink uppercase">Zona de perigo</p>
            <p className="text-caption text-muted-foreground font-medium">
              Excluir a conta apaga seu workspace, conexões e mídias. Não tem volta.
            </p>
          </div>
          <DeleteAccountButton />
        </div>
      </Card>

      <Button asChild variant="link" className="self-start">
        <Link href="/perfis">Voltar para perfis</Link>
      </Button>
    </PhoneFrame>
  );
}
