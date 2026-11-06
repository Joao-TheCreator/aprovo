// Server-only module: never import from client components.
/**
 * Authorization entry points. App code MAY NOT scope queries by any other means:
 * - requireUser(): session or redirect to /entrar
 * - getCurrentWorkspace(userId): the user's first workspace
 * - requireWorkspaceMember(workspaceId, { roles? }): membership (and role) check
 * - requireWorkspaceForProfile(profileId): profile -> workspace -> membership check
 * Every Drizzle query on tenant data must be filtered by the workspace id returned here.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { profiles, workspaceMembers, workspaces } from "@/db/schema";
import { getMemberRole, type MemberRole } from "@/lib/workspace/membership";
import { auth } from "./index";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/entrar");
  return session.user;
}

export async function getCurrentWorkspace(userId: string) {
  const [row] = await db
    .select({ workspace: workspaces, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.userId, userId), isNull(workspaces.deletedAt)))
    .orderBy(asc(workspaceMembers.createdAt))
    .limit(1);
  return row ? { ...row.workspace, role: row.role } : null;
}

export async function requireWorkspaceMember(
  workspaceId: string,
  opts: { roles?: MemberRole[] } = {},
) {
  const user = await requireUser();
  const role = await getMemberRole(db, workspaceId, user.id);
  if (!role || (opts.roles && !opts.roles.includes(role))) notFound();
  return { user, workspaceId, role };
}

export async function requireWorkspaceForProfile(
  profileId: string,
  opts: { roles?: MemberRole[] } = {},
) {
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
  if (!profile) notFound();
  const member = await requireWorkspaceMember(profile.workspaceId, opts);
  return { ...member, profile };
}
