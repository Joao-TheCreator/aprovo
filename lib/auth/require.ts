// Server-only module: never import from client components.
/**
 * Authorization entry points. App code MAY NOT scope queries by any other means:
 * - requireUser(): session or redirect to /entrar
 * - getCurrentWorkspace(userId): the user's oldest live workspace (deterministic, see lib/workspace/current.ts)
 * - requireWorkspaceMember(workspaceId, { roles? }): membership (and role) check
 * - requireWorkspaceForProfile(profileId): profile -> workspace -> membership check
 * Every Drizzle query on tenant data must be filtered by the workspace id returned here.
 */
import { and, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { findCurrentWorkspace } from "@/lib/workspace/current";
import { getMemberRole, type MemberRole } from "@/lib/workspace/membership";
import { auth } from "./index";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/entrar");
  return session.user;
}

/** The user's current workspace (single rule in lib/workspace/current.ts). */
export async function getCurrentWorkspace(userId: string) {
  return findCurrentWorkspace(db, userId);
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
  const [profile] = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, profileId), isNull(profiles.deletedAt)))
    .limit(1);
  if (!profile) notFound();
  const member = await requireWorkspaceMember(profile.workspaceId, opts);
  return { ...member, profile };
}
