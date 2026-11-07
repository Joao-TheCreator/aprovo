"use server";
/** Schedule, reschedule and cancel Instagram publications (docs/12 sections 2.2, 4.2, 4.7, 5.5). */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { z } from "zod";
import {
  instagramConnections,
  mediaAssets,
  postMedia,
  posts,
  profiles,
  publications,
} from "@/db/schema";
import { logActivity } from "@/lib/activity/log";
import { requireWorkspaceForProfile, requireWorkspaceMember } from "@/lib/auth/require";
import { canPublish, getConnectionById } from "@/lib/instagram/oauth";
import { getPublisher } from "@/lib/instagram/publish";
import type { ActionResult } from "@/lib/profiles/contracts";
import {
  cancelPublicationInputSchema,
  MIN_SCHEDULE_LEAD_MS,
  PUBLISHING_ACTION_MESSAGES,
  reschedulePublicationInputSchema,
  schedulePublicationSchema,
  type CancelPublicationActionInput,
  type ReschedulePublicationActionInput,
  type SchedulePublicationInput,
} from "./contracts";
import { ACCOUNT_ERROR_CODES } from "./connection-loss";
import { validateForInstagram } from "./prepare";
import { nextPostStatus } from "./state";

function fail(code: string, message?: string) {
  return {
    ok: false as const,
    code,
    message: message ?? PUBLISHING_ACTION_MESSAGES[code] ?? "Erro.",
  };
}

/** Thrown inside a transaction to roll it back with a friendly failure. */
class ActionFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function isNextNotFound(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

function isUniqueViolation(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 3 && cur; i++) {
    if ((cur as { code?: unknown }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

type Member = Awaited<ReturnType<typeof requireWorkspaceForProfile>>;

async function memberForProfile(profileId: string): Promise<Member | null> {
  try {
    return await requireWorkspaceForProfile(profileId);
  } catch (e) {
    if (isNextNotFound(e)) return null;
    throw e;
  }
}

function revalidate(profileId: string, postId: string) {
  revalidatePath(`/perfis/${profileId}`);
  revalidatePath(`/perfis/${profileId}/posts/${postId}`);
  revalidatePath(`/perfis/${profileId}/agendadas`);
}

function tooSoon(scheduledAt: Date): boolean {
  return scheduledAt.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS;
}

/** Checks the connection can publish. Returns a failure or null. */
async function checkConnection(connectionId: string | null, workspaceId: string) {
  if (!connectionId) return fail("connection_inactive");
  const connection = await getConnectionById(connectionId, workspaceId);
  if (!connection || connection.status !== "active") return fail("connection_inactive");
  if (!canPublish(connection)) return fail("missing_scope");
  return null;
}

type Scheduled = { publicationId: string; scheduledAt: string };

export async function schedulePublication(
  input: SchedulePublicationInput,
): Promise<ActionResult<Scheduled>> {
  const parsed = schedulePublicationSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  const { postId, timezone } = parsed.data;
  const scheduledAt = new Date(parsed.data.scheduledAt);

  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) return fail("not_found");
  const member = await memberForProfile(post.profileId);
  if (!member) return fail("not_found");

  const [live] = await db
    .select({ id: publications.id })
    .from(publications)
    .where(
      and(
        eq(publications.postId, postId),
        sql`${publications.status} in ('scheduled', 'publishing')`,
      ),
    )
    .limit(1);
  if (live) return fail("already_scheduled");
  if (post.status !== "approved") return fail("invalid_status");

  const connectionProblem = await checkConnection(member.profile.connectionId, member.workspaceId);
  if (connectionProblem) return connectionProblem;

  if (tooSoon(scheduledAt)) return fail("past_date");

  const media = await db
    .select({ asset: mediaAssets, sortOrder: postMedia.sortOrder })
    .from(postMedia)
    .innerJoin(mediaAssets, eq(postMedia.assetId, mediaAssets.id))
    .where(eq(postMedia.postId, postId))
    .orderBy(asc(postMedia.sortOrder));
  const issues = validateForInstagram({ kind: post.kind, media });
  if (issues.length > 0) {
    return fail("media_rejected", issues.map((i) => i.message).join(" "));
  }

  try {
    const publicationId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(publications)
        .values({
          postId,
          profileId: post.profileId,
          connectionId: member.profile.connectionId,
          scheduledAt,
          timezone,
          status: "scheduled",
          nextAttemptAt: scheduledAt,
          createdBy: member.user.id,
        })
        .returning({ id: publications.id });
      const moved = await tx
        .update(posts)
        .set({
          status: nextPostStatus("approved", "schedule"),
          scheduledFor: scheduledAt,
          updatedAt: new Date(),
        })
        .where(and(eq(posts.id, postId), eq(posts.status, "approved")))
        .returning({ id: posts.id });
      if (moved.length === 0) throw new ActionFailure("invalid_status");
      await logActivity(tx, {
        profileId: post.profileId,
        actor: `user:${member.user.id}`,
        event: "publication.scheduled",
        payload: {
          postId,
          publicationId: created.id,
          scheduledAt: scheduledAt.toISOString(),
          timezone,
        },
      });
      return created.id;
    });
    revalidate(post.profileId, postId);
    return { ok: true, data: { publicationId, scheduledAt: scheduledAt.toISOString() } };
  } catch (e) {
    if (e instanceof ActionFailure) return fail(e.code);
    if (isUniqueViolation(e)) return fail("already_scheduled");
    throw e;
  }
}

async function loadPublication(publicationId: string) {
  const [pub] = await db
    .select()
    .from(publications)
    .where(eq(publications.id, publicationId))
    .limit(1);
  if (!pub) return null;
  const member = await memberForProfile(pub.profileId);
  return member ? { pub, member } : null;
}

export async function reschedulePublication(
  input: ReschedulePublicationActionInput,
): Promise<ActionResult<Scheduled>> {
  const parsed = reschedulePublicationInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  const { publicationId, timezone } = parsed.data;
  const scheduledAt = new Date(parsed.data.scheduledAt);

  const loaded = await loadPublication(publicationId);
  if (!loaded) return fail("not_found");
  const { pub, member } = loaded;
  if (pub.status !== "scheduled" && pub.status !== "failed") {
    return fail("not_reschedulable");
  }

  const wasFailed = pub.status === "failed";
  const connectionId = pub.connectionId ?? member.profile.connectionId;
  if (wasFailed) {
    const problem = await checkConnection(connectionId, member.workspaceId);
    if (problem) return problem;
  }
  if (tooSoon(scheduledAt)) return fail("past_date");

  try {
    await db.transaction(async (tx) => {
      const now = new Date();
      const updated = await tx
        .update(publications)
        .set({
          scheduledAt,
          nextAttemptAt: scheduledAt,
          timezone,
          updatedAt: now,
          ...(wasFailed
            ? {
                status: "scheduled" as const,
                attempts: 0,
                lastErrorCode: null,
                lastError: null,
                lastErrorRaw: null,
                lockedAt: null,
                lockedBy: null,
                containerId: null,
                containerCreatedAt: null,
                connectionId,
              }
            : {}),
        })
        .where(and(eq(publications.id, pub.id), eq(publications.status, pub.status)))
        .returning({ id: publications.id });
      if (updated.length === 0) throw new ActionFailure("not_reschedulable");

      const [post] = await tx.select().from(posts).where(eq(posts.id, pub.postId)).limit(1);
      if (!post) throw new ActionFailure("not_found");
      const nextStatus = wasFailed ? nextPostStatus(post.status, "reschedule") : post.status;
      await tx
        .update(posts)
        .set({ status: nextStatus, scheduledFor: scheduledAt, updatedAt: now })
        .where(eq(posts.id, post.id));
      await logActivity(tx, {
        profileId: pub.profileId,
        actor: `user:${member.user.id}`,
        event: "publication.rescheduled",
        payload: {
          postId: pub.postId,
          publicationId: pub.id,
          scheduledAt: scheduledAt.toISOString(),
          timezone,
          from: pub.status,
        },
      });
    });
  } catch (e) {
    if (e instanceof ActionFailure) return fail(e.code);
    if (isUniqueViolation(e)) return fail("already_scheduled");
    if ((e as { name?: string } | null)?.name === "InvalidTransitionError") {
      return fail("not_reschedulable");
    }
    throw e;
  }
  revalidate(pub.profileId, pub.postId);
  return { ok: true, data: { publicationId: pub.id, scheduledAt: scheduledAt.toISOString() } };
}

export async function cancelPublication(
  input: CancelPublicationActionInput,
): Promise<ActionResult> {
  const parsed = cancelPublicationInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");

  const loaded = await loadPublication(parsed.data.publicationId);
  if (!loaded) return fail("not_found");
  const { pub, member } = loaded;
  if (pub.status === "publishing") return fail("publishing_now");
  if (pub.status !== "scheduled") return fail("not_cancellable");

  try {
    await db.transaction(async (tx) => {
      const now = new Date();
      const cancelled = await tx
        .update(publications)
        .set({ status: "cancelled", cancelledAt: now, cancelledBy: member.user.id, updatedAt: now })
        .where(and(eq(publications.id, pub.id), eq(publications.status, "scheduled")))
        .returning({ id: publications.id });
      // Lost a race with the scheduler (it just claimed the row).
      if (cancelled.length === 0) throw new ActionFailure("publishing_now");
      await tx
        .update(posts)
        .set({ status: nextPostStatus("scheduled", "cancel_schedule"), updatedAt: now })
        .where(and(eq(posts.id, pub.postId), eq(posts.status, "scheduled")));
      await logActivity(tx, {
        profileId: pub.profileId,
        actor: `user:${member.user.id}`,
        event: "publication.cancelled",
        payload: { postId: pub.postId, publicationId: pub.id, reason: "user" },
      });
    });
  } catch (e) {
    if (e instanceof ActionFailure) return fail(e.code);
    throw e;
  }
  revalidate(pub.profileId, pub.postId);
  return { ok: true, data: undefined };
}

const QUOTA_TTL_MS = 10 * 60 * 1000;
const QUOTA_FAILURE_TTL_MS = 60 * 1000;
type Quota = { used: number; total: number };
const quotaCache = new Map<string, { at: number; ttl: number; value: Quota | null }>();

/** Daily publishing quota of the profile's connected account; cached 10 min per connection. Never throws. */
export async function getPublishingQuota(profileId: string): Promise<Quota | null> {
  try {
    const member = await memberForProfile(profileId);
    const connectionId = member?.profile.connectionId;
    if (!member || !connectionId) return null;
    const hit = quotaCache.get(connectionId);
    if (hit && Date.now() - hit.at < hit.ttl) return hit.value;

    const connection = await getConnectionById(connectionId, member.workspaceId);
    if (!connection || connection.status !== "active" || !canPublish(connection)) return null;
    let value: Quota | null = null;
    try {
      const res = await getPublisher(connection).getPublishingLimit();
      if (res.ok) value = { used: res.data.quotaUsage, total: res.data.quotaTotal };
    } catch {
      value = null;
    }
    quotaCache.set(connectionId, {
      at: Date.now(),
      ttl: value ? QUOTA_TTL_MS : QUOTA_FAILURE_TTL_MS,
      value,
    });
    return value;
  } catch {
    return null;
  }
}

const RESCHEDULE_LEAD_MS = 60 * 1000;
const rescheduleFailedSchema = z.string().uuid();

/**
 * After reconnecting an Instagram account: puts every publication that failed because of the
 * lost connection back in the queue (docs/12 section 7). Each runs at `max(scheduled_at, now +
 * 1 min)` with fresh attempts. Workspace-scoped; another workspace's connection is `not_found`.
 */
export async function rescheduleFailedForConnection(
  connectionId: string,
): Promise<ActionResult<{ rescheduled: number }>> {
  const parsed = rescheduleFailedSchema.safeParse(connectionId);
  if (!parsed.success) return fail("invalid_input");

  const [found] = await db
    .select({ workspaceId: instagramConnections.workspaceId })
    .from(instagramConnections)
    .where(eq(instagramConnections.id, parsed.data))
    .limit(1);
  if (!found) return fail("not_found");
  let member: Awaited<ReturnType<typeof requireWorkspaceMember>>;
  try {
    member = await requireWorkspaceMember(found.workspaceId);
  } catch (e) {
    if (isNextNotFound(e)) return fail("not_found");
    throw e;
  }
  const problem = await checkConnection(parsed.data, member.workspaceId);
  if (problem) return problem;

  const profileIds = new Set<string>();
  const rescheduled = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ pub: publications })
      .from(publications)
      .innerJoin(profiles, eq(profiles.id, publications.profileId))
      .where(
        and(
          eq(publications.connectionId, parsed.data),
          eq(profiles.workspaceId, member.workspaceId),
          isNull(profiles.deletedAt),
          eq(publications.status, "failed"),
          inArray(publications.lastErrorCode, [...ACCOUNT_ERROR_CODES]),
        ),
      )
      .orderBy(asc(publications.scheduledAt));

    let done = 0;
    for (const { pub } of rows) {
      const [post] = await tx.select().from(posts).where(eq(posts.id, pub.postId)).limit(1);
      // The post moved on meanwhile (edited, deleted): leave the failure as history.
      if (!post || post.status !== "publish_failed") continue;
      const [live] = await tx
        .select({ id: publications.id })
        .from(publications)
        .where(
          and(
            eq(publications.postId, pub.postId),
            sql`${publications.status} in ('scheduled', 'publishing')`,
          ),
        )
        .limit(1);
      if (live) continue;

      const now = new Date();
      const nextAttemptAt = new Date(
        Math.max(pub.scheduledAt.getTime(), now.getTime() + RESCHEDULE_LEAD_MS),
      );
      const updated = await tx
        .update(publications)
        .set({
          status: "scheduled",
          nextAttemptAt,
          attempts: 0,
          lastErrorCode: null,
          lastError: null,
          lastErrorRaw: null,
          lockedAt: null,
          lockedBy: null,
          containerId: null,
          containerCreatedAt: null,
          updatedAt: now,
        })
        .where(and(eq(publications.id, pub.id), eq(publications.status, "failed")))
        .returning({ id: publications.id });
      if (updated.length === 0) continue;
      await tx
        .update(posts)
        .set({ status: nextPostStatus(post.status, "reschedule"), updatedAt: now })
        .where(eq(posts.id, post.id));
      await logActivity(tx, {
        profileId: pub.profileId,
        actor: `user:${member.user.id}`,
        event: "publication.rescheduled",
        payload: {
          postId: pub.postId,
          publicationId: pub.id,
          scheduledAt: pub.scheduledAt.toISOString(),
          nextAttemptAt: nextAttemptAt.toISOString(),
          reason: "reconnected",
          from: "failed",
        },
      });
      profileIds.add(pub.profileId);
      done++;
    }
    return done;
  });

  revalidatePath("/configuracoes");
  for (const id of profileIds) {
    revalidatePath(`/perfis/${id}`);
    revalidatePath(`/perfis/${id}/agendadas`);
  }
  return { ok: true, data: { rescheduled } };
}
