import { and, eq, isNotNull } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db/client";
import { profiles, type InstagramConnection } from "@/db/schema";
import { PhoneFrame } from "@/components/app/PhoneFrame";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { DeleteAccountButton } from "./DeleteAccountButton";
import { DisconnectButton } from "./DisconnectButton";

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

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; disconnected?: string; error?: string }>;
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
  // TODO(T9): "Avisar por e-mail quando publicar" toggle lives here once the e-mail template exists.
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
  const configured = isOAuthConfigured();
  const publishEnabled = instagramScopes().includes(PUBLISH_SCOPE);
  const activeProvider = activeOAuthProvider();
  const error = sp.error ? (ERRORS[sp.error] ?? ERRORS.exchange_failed) : null;

  return (
    <PhoneFrame className="flex flex-col gap-6">
      <h1 className="text-2xl leading-8 font-bold">Configurações</h1>

      {sp.connected === "1" ? (
        <p role="status" className="bg-success/10 text-success rounded-xl px-4 py-3 text-sm">
          Instagram conectado com sucesso.
        </p>
      ) : null}
      {sp.disconnected === "1" ? (
        <p role="status" className="bg-secondary rounded-xl px-4 py-3 text-sm">
          Instagram desconectado.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-xl px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}

      <section className="bg-card border-border flex flex-col gap-4 rounded-2xl border p-4">
        <h2 className="text-lg leading-6 font-semibold">Instagram</h2>
        {connections.length > 0 ? (
          <>
            <ul className="flex flex-col gap-4">
              {connections.map((c) => {
                const profileId = profileByConnection.get(c.id);
                const publishGranted = canPublish(c);
                const statusText = statusMessage(c);
                const quota = quotaByConnection.get(c.id) ?? null;
                const legacy = c.provider === "instagram" && activeProvider === "facebook";
                return (
                  <li
                    key={c.id}
                    className="border-border flex flex-col gap-3 rounded-xl border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="size-12">
                        {c.profilePictureUrl ? (
                          <AvatarImage src={c.profilePictureUrl} alt="" />
                        ) : null}
                        <AvatarFallback>{c.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">@{c.username}</p>
                        <p className="text-muted-foreground text-sm">
                          {accountTypeLabel(c.accountType)} · token válido até{" "}
                          {formatDate(c.tokenExpiresAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">Feed</Badge>
                      {publishGranted ? <Badge variant="secondary">Publicação</Badge> : null}
                    </div>
                    {statusText ? (
                      <p role="status" className="bg-lavanda rounded-xl px-4 py-3 text-sm">
                        {statusText}
                      </p>
                    ) : (
                      <p className="text-muted-foreground text-sm">Conexão ativa</p>
                    )}
                    {quota ? (
                      <p className="text-muted-foreground text-sm">
                        Publicações hoje: {quota.used}/{quota.total}
                      </p>
                    ) : null}
                    {publishEnabled && !publishGranted && c.status === "active" ? (
                      <p className="text-muted-foreground text-xs">
                        Reconecte para autorizar a publicação
                      </p>
                    ) : null}
                    {legacy ? (
                      <p role="status" className="bg-secondary rounded-xl px-4 py-3 text-sm">
                        Esta conexão usa o Login do Instagram. Este servidor está configurado para o
                        Login do Facebook; reconecte para usar o mesmo login.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-3">
                      <Button asChild variant="secondary">
                        {/* API route (redirect to Instagram), not a page: plain anchor is intended. */}
                        <a href="/api/instagram/connect">Reconectar</a>
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
            <p className="text-muted-foreground text-sm">
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
            <p className="text-muted-foreground text-sm">
              {activeProvider === "facebook"
                ? "Conecte com o Facebook uma conta profissional do Instagram (Criador ou Empresa) vinculada a uma Página do Facebook, para carregar feeds pela API oficial da Meta."
                : "Conecte uma conta profissional (Criador ou Empresa) para carregar feeds pela API oficial da Meta."}{" "}
              Em modo de desenvolvimento, a conta precisa ser testadora do app.
            </p>
            {configured ? (
              <Button asChild className="self-start">
                <a href="/api/instagram/connect">Conectar Instagram</a>
              </Button>
            ) : (
              <>
                <Button disabled className="self-start">
                  Conectar Instagram
                </Button>
                <p className="text-muted-foreground text-sm">
                  Configure META_FB_APP_ID e META_FB_APP_SECRET no servidor.
                </p>
              </>
            )}
          </>
        )}
      </section>

      <section className="bg-card border-border flex flex-col gap-4 rounded-2xl border p-4">
        <h2 className="text-lg leading-6 font-semibold">Conta</h2>
        <dl className="flex flex-col gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground">Nome</dt>
            <dd>{user.name || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">E-mail</dt>
            <dd className="break-all">{user.email || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Workspace</dt>
            <dd>{ws?.name ?? "—"}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/auth/signout">Sair</a>
          </Button>
          <Button asChild variant="outline">
            {/* File download from an API route: plain anchor is intended. */}
            <a href="/api/account/export" download>
              Exportar meus dados
            </a>
          </Button>
          <DeleteAccountButton />
        </div>
      </section>
      <Link href="/perfis" className="text-muted-foreground text-sm underline">
        Voltar para perfis
      </Link>
    </PhoneFrame>
  );
}
