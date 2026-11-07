import { and, asc, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { workspaceMembers, workspaces } from "@/db/schema";

/**
 * The ONE rule for "the workspace the app shows" when a user belongs to several:
 * the oldest live (not soft-deleted) membership, ties broken by workspace id so the result is
 * deterministic even when two memberships share a created_at (same-statement inserts).
 *
 * Every entry point that scopes by "current workspace" (profile list, OAuth connect/callback,
 * settings, approvals inbox) goes through this function via getCurrentWorkspace(), so the
 * OAuth callback can never create a profile in a workspace the profile list does not show.
 * No schema change: a future users.current_workspace_id would only have to change this query.
 */
export async function findCurrentWorkspace(db: Database, userId: string) {
  const [row] = await db
    .select({ workspace: workspaces, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.userId, userId), isNull(workspaces.deletedAt)))
    .orderBy(asc(workspaceMembers.createdAt), asc(workspaceMembers.workspaceId))
    .limit(1);
  return row ? { ...row.workspace, role: row.role } : null;
}
