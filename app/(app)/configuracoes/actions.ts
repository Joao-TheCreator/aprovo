"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { instagramConnections } from "@/db/schema";
import { getCurrentWorkspace, requireUser, requireWorkspaceMember } from "@/lib/auth/require";

export async function disconnectInstagram(): Promise<void> {
  const user = await requireUser();
  const ws = await getCurrentWorkspace(user.id!);
  if (!ws) return;
  await requireWorkspaceMember(ws.id);
  await db.delete(instagramConnections).where(eq(instagramConnections.workspaceId, ws.id));
  revalidatePath("/configuracoes");
  redirect("/configuracoes?disconnected=1");
}
