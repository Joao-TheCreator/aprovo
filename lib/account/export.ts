import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  approvalDecisions,
  approvalRequests,
  posts,
  profiles,
  users,
  workspaceMembers,
  workspaces,
} from "@/db/schema";

/** Personal data export. Never includes approval link tokens/hashes or Instagram tokens. */
export async function buildExport(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const ws = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      role: workspaceMembers.role,
      createdAt: workspaces.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId));
  const wsIds = ws.map((w) => w.id);

  const profileRows = wsIds.length
    ? await db
        .select({
          id: profiles.id,
          workspaceId: profiles.workspaceId,
          igUsername: profiles.igUsername,
          displayName: profiles.displayName,
          biography: profiles.biography,
          createdAt: profiles.createdAt,
        })
        .from(profiles)
        .where(inArray(profiles.workspaceId, wsIds))
    : [];
  const profileIds = profileRows.map((p) => p.id);

  const postRows = profileIds.length
    ? await db
        .select({
          id: posts.id,
          profileId: posts.profileId,
          kind: posts.kind,
          caption: posts.caption,
          hashtags: posts.hashtags,
          status: posts.status,
          scheduledFor: posts.scheduledFor,
          notes: posts.notes,
          createdAt: posts.createdAt,
        })
        .from(posts)
        .where(inArray(posts.profileId, profileIds))
    : [];

  const requests = profileIds.length
    ? await db
        .select({
          id: approvalRequests.id,
          profileId: approvalRequests.profileId,
          title: approvalRequests.title,
          message: approvalRequests.message,
          status: approvalRequests.status,
          createdAt: approvalRequests.createdAt,
        })
        .from(approvalRequests)
        .where(inArray(approvalRequests.profileId, profileIds))
    : [];
  const requestIds = requests.map((r) => r.id);

  const decisions = requestIds.length
    ? await db
        .select({
          requestId: approvalDecisions.requestId,
          postId: approvalDecisions.postId,
          approverName: approvalDecisions.approverName,
          decision: approvalDecisions.decision,
          comment: approvalDecisions.comment,
          decidedAt: approvalDecisions.decidedAt,
        })
        .from(approvalDecisions)
        .where(inArray(approvalDecisions.requestId, requestIds))
        .orderBy(desc(approvalDecisions.decidedAt))
    : [];

  return {
    exportedAt: new Date().toISOString(),
    user: user ?? null,
    workspaces: ws,
    profiles: profileRows,
    posts: postRows,
    approvalRequests: requests,
    approvalDecisions: decisions,
  };
}
