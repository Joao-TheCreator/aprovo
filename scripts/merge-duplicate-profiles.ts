/**
 * One-off, idempotent repair: a user whose OAuth callback created a profile in a workspace other
 * than the one the app shows (see lib/workspace/current.ts).
 *
 * Usage (read-only by default):
 *   DATABASE_URL=... pnpm tsx scripts/merge-duplicate-profiles.ts --email joao@example.com
 *   DATABASE_URL=... pnpm tsx scripts/merge-duplicate-profiles.ts --email joao@example.com --apply
 *
 * The "kept" profile is the one in the user's current workspace (same rule as the app). For every
 * profile with the same @ in another workspace of the user ("orphan"), --apply moves posts (and
 * the media they use), publications, approval requests, activity log and the connection to the
 * kept profile. The orphan profile is then removed, and the orphan workspace is archived only
 * when nothing else is left in it.
 */
import { config } from "dotenv";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  activityLog,
  approvalRequests,
  importedPosts,
  instagramConnections,
  mediaAssets,
  postMedia,
  posts,
  profiles,
  publications,
  users,
  workspaceMembers,
  workspaces,
} from "../db/schema";
import { createDb } from "../db/client";
import { findCurrentWorkspace } from "../lib/workspace/current";

config({ path: ".env.local" });
config();

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const emailIdx = args.indexOf("--email");
const email = emailIdx >= 0 ? args[emailIdx + 1] : undefined;

function fail(msg: string): never {
  console.error(`Erro: ${msg}`);
  process.exit(1);
}

async function main() {
  if (!email) fail("informe --email <e-mail do usuario>.");
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL nao definida.");
  const { db, client } = createDb(url, { max: 1 });
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

  const count = async (
    table: typeof posts | typeof publications | typeof approvalRequests,
    pid: string,
  ) =>
    (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(table)
        .where(eq(table.profileId, pid))
    )[0].n;

  try {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) fail(`nenhum usuario com o e-mail ${email}.`);

    const memberships = await db
      .select({ ws: workspaces, role: workspaceMembers.role, since: workspaceMembers.createdAt })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, user.id))
      .orderBy(asc(workspaceMembers.createdAt), asc(workspaceMembers.workspaceId));
    const current = await findCurrentWorkspace(db, user.id);

    console.log(`\nUsuario: ${user.email} (${user.id})`);
    console.log(
      `Modo: ${apply ? "APLICAR (--apply)" : "SIMULACAO (--dry-run, nada sera alterado)"}\n`,
    );
    console.log(`Workspaces (${memberships.length}); o atual do app e o mais antigo ativo:`);

    const byWs = new Map<string, (typeof profiles.$inferSelect)[]>();
    for (const m of memberships) {
      const ps = await db.select().from(profiles).where(eq(profiles.workspaceId, m.ws.id));
      byWs.set(m.ws.id, ps);
      const tag = m.ws.id === current?.id ? "  <- ATUAL" : m.ws.deletedAt ? "  (excluido)" : "";
      console.log(
        `- ${m.ws.id} "${m.ws.name}" papel=${m.role} desde ${m.since.toISOString()}${tag}`,
      );
      for (const p of ps) {
        console.log(`    perfil ${p.id} @${p.igUsername} conexao=${p.connectionId ?? "nenhuma"}`);
      }
    }
    if (!current) fail("o usuario nao tem workspace ativo.");

    const keptProfiles = byWs.get(current.id) ?? [];
    let found = 0;
    for (const m of memberships) {
      if (m.ws.id === current.id) continue;
      for (const orphan of byWs.get(m.ws.id) ?? []) {
        const kept = keptProfiles.find(
          (k) => k.igUsername.toLowerCase() === orphan.igUsername.toLowerCase(),
        );
        if (!kept) {
          console.log(
            `\nPerfil @${orphan.igUsername} (${orphan.id}) esta em outro workspace e nao existe no atual: nada a unir (ignorado).`,
          );
          continue;
        }
        found++;
        console.log(`\nDuplicado: @${orphan.igUsername}`);
        console.log(`  manter : ${kept.id} (workspace ${current.id})`);
        console.log(`  orfao  : ${orphan.id} (workspace ${m.ws.id})`);
        console.log(
          `  itens no orfao: posts=${await count(posts, orphan.id)} publicacoes=${await count(publications, orphan.id)} aprovacoes=${await count(approvalRequests, orphan.id)}`,
        );
        if (!apply) continue;

        await db.transaction(async (tx: Tx) => {
          // 1. connection: the one that feeds the orphan moves to the kept workspace/profile.
          if (orphan.connectionId) {
            const [conn] = await tx
              .select()
              .from(instagramConnections)
              .where(eq(instagramConnections.id, orphan.connectionId));
            if (conn) {
              const [clash] = await tx
                .select({ id: instagramConnections.id })
                .from(instagramConnections)
                .where(
                  and(
                    eq(instagramConnections.workspaceId, current.id),
                    eq(instagramConnections.igUserId, conn.igUserId),
                  ),
                );
              await tx
                .update(profiles)
                .set({ connectionId: null })
                .where(eq(profiles.id, orphan.id));
              if (clash) {
                // Same IG account already connected in the kept workspace: keep that one.
                await tx
                  .update(publications)
                  .set({ connectionId: clash.id })
                  .where(eq(publications.connectionId, conn.id));
                await tx
                  .update(profiles)
                  .set({ connectionId: clash.id })
                  .where(eq(profiles.id, kept.id));
              } else {
                await tx
                  .update(instagramConnections)
                  .set({ workspaceId: current.id })
                  .where(eq(instagramConnections.id, conn.id));
                await tx
                  .update(profiles)
                  .set({ connectionId: conn.id })
                  .where(eq(profiles.id, kept.id));
              }
            }
          }

          // 2. posts: shift positions past the kept profile's max (unique profile + position).
          const [{ max }] = await tx
            .select({ max: sql<number>`coalesce(max(${posts.position}), -1)::int` })
            .from(posts)
            .where(eq(posts.profileId, kept.id));
          const orphanPosts = await tx
            .select({ id: posts.id })
            .from(posts)
            .where(eq(posts.profileId, orphan.id));
          if (orphanPosts.length > 0) {
            const ids = orphanPosts.map((p) => p.id);
            await tx
              .update(posts)
              .set({ profileId: kept.id, position: sql`${posts.position} + ${max + 1}` })
              .where(inArray(posts.id, ids));
            // Media used by moved posts must belong to the kept workspace.
            const assets = await tx
              .select({ id: postMedia.assetId })
              .from(postMedia)
              .where(inArray(postMedia.postId, ids));
            if (assets.length > 0) {
              await tx
                .update(mediaAssets)
                .set({ workspaceId: current.id })
                .where(
                  inArray(
                    mediaAssets.id,
                    assets.map((a) => a.id),
                  ),
                );
            }
          }

          // 3. the rest of the profile's data.
          await tx
            .update(publications)
            .set({ profileId: kept.id })
            .where(eq(publications.profileId, orphan.id));
          await tx
            .update(approvalRequests)
            .set({ profileId: kept.id })
            .where(eq(approvalRequests.profileId, orphan.id));
          await tx
            .update(activityLog)
            .set({ profileId: kept.id })
            .where(eq(activityLog.profileId, orphan.id));
          // imported_posts are a cache of the IG feed: the kept profile re-imports its own.
          await tx.delete(importedPosts).where(eq(importedPosts.profileId, orphan.id));

          // 4. the orphan profile is now empty: remove it.
          await tx.delete(profiles).where(eq(profiles.id, orphan.id));
        });
        console.log("  -> dados movidos para o perfil mantido e perfil orfao removido.");
      }
    }

    if (found === 0)
      console.log("\nNenhum perfil duplicado entre workspaces deste usuario. Nada a fazer.");

    if (apply) {
      // Archive orphan workspaces left empty (soft delete + drop this user's membership).
      for (const m of memberships) {
        if (m.ws.id === current.id || m.ws.deletedAt) continue;
        const [left] = await db
          .select({
            perfis: sql<number>`(select count(*)::int from profiles where workspace_id = ${m.ws.id})`,
            conexoes: sql<number>`(select count(*)::int from instagram_connections where workspace_id = ${m.ws.id})`,
            midia: sql<number>`(select count(*)::int from media_assets where workspace_id = ${m.ws.id})`,
            outrosMembros: sql<number>`(select count(*)::int from workspace_members where workspace_id = ${m.ws.id} and user_id <> ${user.id})`,
          })
          .from(workspaces)
          .where(and(eq(workspaces.id, m.ws.id), isNull(workspaces.deletedAt)));
        if (left && left.perfis + left.conexoes + left.midia + left.outrosMembros === 0) {
          await db.transaction(async (tx: Tx) => {
            await tx
              .update(workspaces)
              .set({ deletedAt: new Date() })
              .where(eq(workspaces.id, m.ws.id));
            await tx
              .delete(workspaceMembers)
              .where(
                and(
                  eq(workspaceMembers.workspaceId, m.ws.id),
                  eq(workspaceMembers.userId, user.id),
                ),
              );
          });
          console.log(`\nWorkspace ${m.ws.id} estava vazio: arquivado e removido da sua conta.`);
        } else if (left) {
          console.log(
            `\nWorkspace ${m.ws.id} mantido (ainda tem ${JSON.stringify(left)}). Nada foi apagado dele.`,
          );
        }
      }
      console.log("\nConcluido. Reabra /perfis para conferir.");
    } else {
      console.log("\nSimulacao concluida. Rode de novo com --apply para executar.");
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("Falha:", e instanceof Error ? e.message : e);
  process.exit(1);
});
