"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { instagramConnections } from "@/db/schema";
import { getCurrentWorkspace, requireUser, requireWorkspaceMember } from "@/lib/auth/require";
import { deleteAccount } from "@/lib/account/delete";
import { signOut } from "@/lib/auth";

export async function disconnectInstagram(): Promise<void> {
  const user = await requireUser();
  const ws = await getCurrentWorkspace(user.id!);
  if (!ws) return;
  await requireWorkspaceMember(ws.id);
  await db.delete(instagramConnections).where(eq(instagramConnections.workspaceId, ws.id));
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
