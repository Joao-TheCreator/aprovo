import Link from "next/link";

import { PhoneFrame } from "@/components/app/PhoneFrame";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getCurrentWorkspace, requireUser } from "@/lib/auth/require";
import { getWorkspaceConnection, isOAuthConfigured } from "@/lib/instagram/oauth";
import { DisconnectButton } from "./DisconnectButton";

export const metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  not_configured: "A conexão com o Instagram não está configurada neste servidor.",
  denied: "A autorização foi cancelada no Instagram.",
  exchange_failed: "Não foi possível concluir a conexão com o Instagram. Tente novamente.",
  state_mismatch: "A sessão de conexão expirou ou é inválida. Tente conectar novamente.",
};

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
  const connection = ws ? await getWorkspaceConnection(ws.id) : null;
  const configured = isOAuthConfigured();
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
        {connection ? (
          <>
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                {connection.profilePictureUrl ? (
                  <AvatarImage src={connection.profilePictureUrl} alt="" />
                ) : null}
                <AvatarFallback>{connection.username.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  Conectado como @{connection.username} ({accountTypeLabel(connection.accountType)})
                </p>
                <p className="text-muted-foreground text-sm">
                  Token válido até {formatDate(connection.tokenExpiresAt)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="secondary">
                {/* API route (redirect to Instagram), not a page: plain anchor is intended. */}
                <a href="/api/instagram/connect">Reconectar</a>
              </Button>
              <DisconnectButton username={connection.username} />
            </div>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              Conecte uma conta profissional (Criador ou Empresa) para carregar feeds pela API
              oficial da Meta. Em modo de desenvolvimento, a conta precisa ser testadora do app.
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
                  Configure META_APP_ID e META_APP_SECRET no servidor.
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
          <Button variant="outline" disabled title="Em breve">
            Excluir conta (em breve)
          </Button>
        </div>
      </section>
      <Link href="/perfis" className="text-muted-foreground text-sm underline">
        Voltar para perfis
      </Link>
    </PhoneFrame>
  );
}
