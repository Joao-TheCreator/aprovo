import type { Database } from "@/db/client";
import { workspaceMembers, workspaces } from "@/db/schema";

export function defaultWorkspaceName(user: { name?: string | null; email?: string | null }): string {
  const name = user.name?.trim();
  if (name) return name;
  const local = user.email?.split("@")[0]?.trim();
  return local || "Meu workspace";
}

/** Creates a workspace owned by the user plus the owner membership, atomically. */
export async function createWorkspaceForUser(
  db: Database,
  user: { id: string; name?: string | null; email?: string | null },
) {
  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .insert(workspaces)
      .values({ name: defaultWorkspaceName(user), ownerId: user.id })
      .returning();
    await tx
      .insert(workspaceMembers)
      .values({ workspaceId: workspace.id, userId: user.id, role: "owner" });
    return workspace;
  });
}
