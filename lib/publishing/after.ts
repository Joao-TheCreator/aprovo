/**
 * Post-publication hooks (docs/12 sections 4.6 and 5.5). Called by `run.ts` after the outcome
 * is stored. Both hooks never throw and never include tokens or signed URLs in e-mails or logs.
 */
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { posts, profiles, users } from "@/db/schema";
import { sendPublishFailedEmail, sendPublishedEmail } from "@/lib/email/send";
import { importProfileFromProvider } from "@/lib/profiles/import";
import { isAccountErrorCode } from "./connection-loss";
import type { PublicationRow } from "./queue";

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

function warn(step: string, e: unknown): void {
  console.warn(`[publishing] after hook ${step} skipped:`, e instanceof Error ? e.name : "unknown");
}

async function recipient(createdBy: string | null): Promise<string | null> {
  if (!createdBy) return null;
  const [u] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, createdBy))
    .limit(1);
  return u?.email ?? null;
}

async function context(pub: PublicationRow) {
  const [row] = await db
    .select({ caption: posts.caption, username: profiles.igUsername })
    .from(posts)
    .innerJoin(profiles, eq(profiles.id, posts.profileId))
    .where(eq(posts.id, pub.postId))
    .limit(1);
  return row ?? null;
}

/**
 * Published: make sure the post is `published` with its media id (idempotent), e-mail whoever
 * scheduled it, then import the profile so the live post lands in `imported_posts` by
 * `ig_media_id`. Until the import lands the planned post stays in the grid as "Publicada".
 */
export async function onPublished(pub: PublicationRow): Promise<void> {
  try {
    if (pub.igMediaId) {
      await db
        .update(posts)
        .set({ status: "published", publishedMediaId: pub.igMediaId })
        .where(
          and(
            eq(posts.id, pub.postId),
            or(
              sql`${posts.status} <> 'published'`,
              sql`${posts.publishedMediaId} is distinct from ${pub.igMediaId}`,
            ),
          ),
        );
    }
  } catch (e) {
    warn("status", e);
  }

  // TODO(T13?): respect `workspaces.notify_on_publish` ("Avisar por e-mail quando publicar")
  // once the column exists; for now the e-mail is always sent.
  try {
    const [to, ctx] = await Promise.all([recipient(pub.createdBy), context(pub)]);
    if (to && ctx) {
      await sendPublishedEmail({
        to,
        profileUsername: ctx.username,
        postCaption: ctx.caption,
        permalink: pub.permalink,
        publishedAt: pub.publishedAt ?? new Date(),
      });
    }
  } catch (e) {
    warn("e-mail", e);
  }

  try {
    const res = await importProfileFromProvider(pub.profileId);
    if (!res.ok) console.warn(`[publishing] post-publish import failed code=${res.error.code}`);
  } catch (e) {
    warn("import", e);
  }
}

/**
 * Definitive failure: e-mail the friendly reason with a link to the post page. The activity log
 * is already written by `run.ts`. Account-level codes (token expired, scope, not professional)
 * are covered by the single "connection lost" e-mail, so no per-publication e-mail goes out.
 */
export async function onFailed(pub: PublicationRow): Promise<void> {
  try {
    if (isAccountErrorCode(pub.lastErrorCode)) return;
    const [to, ctx] = await Promise.all([recipient(pub.createdBy), context(pub)]);
    if (!to || !ctx) return;
    await sendPublishFailedEmail({
      to,
      profileUsername: ctx.username,
      postCaption: ctx.caption,
      reason: pub.lastError,
      url: `${appUrl()}/perfis/${pub.profileId}/posts/${pub.postId}`,
    });
  } catch (e) {
    warn("failed e-mail", e);
  }
}
