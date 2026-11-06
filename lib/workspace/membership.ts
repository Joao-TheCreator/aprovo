import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { workspaceMembers } from "@/db/schema";

export type MemberRole = "owner" | "editor";

/** Returns the member's role in the workspace, or null when not a member. */
export async function getMemberRole(
  db: Database,
  workspaceId: string,
  userId: string,
): Promise<MemberRole | null> {
  const [row] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export async function isMember(db: Database, workspaceId: string, userId: string): Promise<boolean> {
  return (await getMemberRole(db, workspaceId, userId)) !== null;
}
