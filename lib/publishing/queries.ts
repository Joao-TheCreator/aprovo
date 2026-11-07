import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { mediaAssets, postMedia, posts, publications } from "@/db/schema";
import { requireWorkspaceForProfile } from "@/lib/auth/require";
import { canPublish, getConnectionById } from "@/lib/instagram/oauth";
import { assetUrls } from "@/lib/media/urls";
import type { LivePublication, PublicationListItem, PublicationLists } from "./contracts";

const PUBLISHED_LIMIT = 50;
const FAILED_LIMIT = 50;
const EXCERPT_LENGTH = 100;

function isNextNotFound(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

function excerpt(caption: string | null): string {
  const text = (caption ?? "").replace(/\s+/g, " ").trim();
  return text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…` : text;
}

/**
 * Publications of a profile grouped for the "Agendadas" screen. Workspace-scoped through
 * `requireWorkspaceForProfile` (non-members get notFound()). Cancelled publications are omitted.
 */
export async function listPublications(profileId: string): Promise<PublicationLists> {
  await requireWorkspaceForProfile(profileId);

  const select = () =>
    db
      .select({
        pub: publications,
        caption: posts.caption,
        kind: posts.kind,
      })
      .from(publications)
      .innerJoin(posts, eq(posts.id, publications.postId));

  const [scheduledRows, publishedRows, failedRows] = await Promise.all([
    select()
      .where(
        and(
          eq(publications.profileId, profileId),
          sql`${publications.status} in ('scheduled', 'publishing')`,
        ),
      )
      .orderBy(asc(publications.scheduledAt)),
    select()
      .where(and(eq(publications.profileId, profileId), eq(publications.status, "published")))
      .orderBy(desc(publications.publishedAt))
      .limit(PUBLISHED_LIMIT),
    select()
      .where(and(eq(publications.profileId, profileId), eq(publications.status, "failed")))
      .orderBy(desc(publications.updatedAt))
      .limit(FAILED_LIMIT),
  ]);

  const postIds = [
    ...new Set([...scheduledRows, ...publishedRows, ...failedRows].map((r) => r.pub.postId)),
  ];
  const thumbs = new Map<string, string | null>();
  if (postIds.length > 0) {
    const mediaRows = await db
      .select({ postId: postMedia.postId, asset: mediaAssets })
      .from(postMedia)
      .innerJoin(mediaAssets, eq(mediaAssets.id, postMedia.assetId))
      .where(inArray(postMedia.postId, postIds))
      .orderBy(asc(postMedia.sortOrder));
    const first = new Map<string, (typeof mediaRows)[number]["asset"]>();
    for (const r of mediaRows) if (!first.has(r.postId)) first.set(r.postId, r.asset);
    const entries = [...first.entries()];
    const urls = await assetUrls(entries.map(([, asset]) => asset));
    entries.forEach(([postId], i) => thumbs.set(postId, urls[i]?.thumbUrl ?? null));
  }

  const toItem = (r: (typeof scheduledRows)[number]): PublicationListItem => ({
    id: r.pub.id,
    postId: r.pub.postId,
    kind: r.kind,
    captionExcerpt: excerpt(r.caption),
    thumbUrl: thumbs.get(r.pub.postId) ?? null,
    scheduledAt: r.pub.scheduledAt,
    timezone: r.pub.timezone,
    status: r.pub.status,
    attempts: r.pub.attempts,
    lastErrorCode: r.pub.lastErrorCode,
    lastError: r.pub.lastError,
    permalink: r.pub.permalink,
    publishedAt: r.pub.publishedAt,
  });

  return {
    scheduled: scheduledRows.map(toItem),
    published: publishedRows.map(toItem),
    failed: failedRows.map(toItem),
  };
}

/**
 * The publication that explains a post's scheduling state: the live one (`scheduled`/`publishing`)
 * or, failing that, the most recent `failed` one. null when none or when the caller is not a member.
 */
export async function getLivePublication(postId: string): Promise<LivePublication | null> {
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return null;
  const [post] = await db
    .select({ profileId: posts.profileId })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);
  if (!post) return null;
  try {
    await requireWorkspaceForProfile(post.profileId);
  } catch (e) {
    if (isNextNotFound(e)) return null;
    throw e;
  }
  const [row] = await db
    .select()
    .from(publications)
    .where(
      and(
        eq(publications.postId, postId),
        sql`${publications.status} in ('scheduled', 'publishing', 'failed')`,
      ),
    )
    .orderBy(desc(publications.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    scheduledAt: row.scheduledAt,
    timezone: row.timezone,
    attempts: row.attempts,
    lastErrorCode: row.lastErrorCode,
    lastError: row.lastError,
  };
}

/** Scheduling context of a profile: its time zone and whether its connection can publish. */
export async function getProfilePublishing(
  profileId: string,
): Promise<{ timezone: string; canPublish: boolean }> {
  const { profile, workspaceId } = await requireWorkspaceForProfile(profileId);
  let publishable = false;
  if (profile.connectionId) {
    const connection = await getConnectionById(profile.connectionId, workspaceId);
    publishable = !!connection && connection.status === "active" && canPublish(connection);
  }
  return { timezone: profile.timezone, canPublish: publishable };
}
