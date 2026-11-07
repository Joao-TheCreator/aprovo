"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { instagramConnections } from "@/db/schema";
import { getCurrentWorkspace, requireUser, requireWorkspaceMember } from "@/lib/auth/require";
import { after } from "next/server";
import { db as rootDb } from "@/db/client";
import { deleteAccount, purgeWorkspaceMedia } from "@/lib/account/delete";
import { signOut } from "@/lib/auth";

const connectionIdSchema = z.string().uuid();

/** Disconnects one Instagram account; a connection of another workspace is a 404. */
export async function disconnectInstagram(connectionId: string): Promise<void> {
  const parsed = connectionIdSchema.safeParse(connectionId);
  if (!parsed.success) notFound();
  const user = await requireUser();
  const ws = await getCurrentWorkspace(user.id!);
  if (!ws) notFound();
  await requireWorkspaceMember(ws.id);
  const deleted = await db
    .delete(instagramConnections)
    .where(
      and(eq(instagramConnections.id, parsed.data), eq(instagramConnections.workspaceId, ws.id)),
    )
    .returning({ id: instagramConnections.id });
  if (deleted.length === 0) notFound();
  revalidatePath("/configuracoes");
  redirect("/configuracoes?disconnected=1");
}

export type DeleteAccountResult = { ok: true } | { ok: false; message: string };

/**
 * Deletes the account. The database part runs now; the storage purge runs after the response
 * (`after()`), so a slow bucket never breaks the deletion. Errors come back as a message instead
 * of the error screen.
 */
export async function deleteAccountAction(): Promise<DeleteAccountResult> {
  const user = await requireUser();
  const userId = user.id!;
  let workspaceIds: string[];
  try {
    ({ workspaceIds } = await deleteAccount(userId, { deferPurge: true }));
  } catch (e) {
    console.error("[account] delete failed:", e instanceof Error ? e.message : e);
    return {
      ok: false,
      message:
        "Não deu para excluir a conta agora. Tenta de novo em instantes ou fala com a gente.",
    };
  }
  after(async () => {
    const errors = await purgeWorkspaceMedia(rootDb, workspaceIds);
    if (errors) console.warn(`[account] storage purge left ${errors} object(s) behind`);
  });
  try {
    await signOut({ redirect: false });
  } catch {
    // The session row is already gone; clearing the cookie is best-effort.
  }
  return { ok: true };
}
