"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { instagramConnections } from "@/db/schema";
import { getCurrentWorkspace, requireUser, requireWorkspaceMember } from "@/lib/auth/require";
import { deleteAccount } from "@/lib/account/delete";
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

export async function deleteAccountAction(): Promise<void> {
  const user = await requireUser();
  await deleteAccount(user.id!);
  try {
    await signOut({ redirect: false });
  } catch {
    // The session row is already gone; clearing the cookie is best-effort.
  }
  redirect("/entrar?deleted=1");
}
