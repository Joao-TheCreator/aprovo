/**
 * Seeds the database the e2e server uses (DATABASE_URL) and writes the media through the local
 * storage driver. Runs in the Playwright process, never in the app. Nothing here talks to Meta.
 */
import { randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { getDb } from "@/db/client";
import {
  instagramConnections,
  mediaAssets,
  postMedia,
  posts,
  profiles,
  publications,
  sessions,
  users,
  workspaces,
} from "@/db/schema";
import { encrypt } from "@/lib/crypto/secretbox";
import { LocalStorage } from "@/lib/storage/local";
import { createWorkspaceForUser } from "@/lib/workspace/create";

export const SESSION_COOKIE_NAME = "authjs.session-token";
export const CRON_SECRET = process.env.CRON_SECRET ?? "e2e-secret";
const PUBLISH_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];

export type Scenario = {
  userId: string;
  workspaceId: string;
  profileId: string;
  connectionId: string;
  sessionToken: string;
  /** Draft post with one ready JPEG, ready to be sent for approval. */
  postId: string;
};

function db() {
  return getDb();
}

/** Removes everything a previous run of the same scenario left behind (local reruns). */
async function cleanup(email: string): Promise<void> {
  const found = await db().select({ id: users.id }).from(users).where(eq(users.email, email));
  if (found.length === 0) return;
  const ids = found.map((u) => u.id);
  await db().delete(workspaces).where(inArray(workspaces.ownerId, ids));
  await db().delete(users).where(inArray(users.id, ids));
}

/** A small valid JPEG (square, wider than Instagram's 320 px minimum). */
async function makeJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 640, height: 640, channels: 3, background: { r: 98, g: 44, b: 190 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** Inserts a post with one ready image asset; the file is stored where the app expects it. */
export async function seedPost(
  s: Pick<Scenario, "workspaceId" | "profileId">,
  opts: { status: "draft" | "scheduled"; caption: string; position: number },
): Promise<string> {
  const jpeg = await makeJpeg();
  const [post] = await db()
    .insert(posts)
    .values({
      profileId: s.profileId,
      position: opts.position,
      status: opts.status,
      kind: "post",
      caption: opts.caption,
    })
    .returning();
  const [asset] = await db()
    .insert(mediaAssets)
    .values({
      workspaceId: s.workspaceId,
      kind: "image",
      originalPath: "pending",
      mimeType: "image/jpeg",
      width: 640,
      height: 640,
      sizeBytes: jpeg.byteLength,
      status: "ready",
    })
    .returning();
  const base = `${s.workspaceId}/${asset.id}`;
  const originalPath = `originals/${base}/orig.jpg`;
  const previewPath = `previews/${base}/preview.jpg`;
  const thumbPath = `thumbs/${base}/thumb.jpg`;
  const storage = new LocalStorage();
  await Promise.all(
    [originalPath, previewPath, thumbPath].map((key) => storage.putObject(key, jpeg, "image/jpeg")),
  );
  await db()
    .update(mediaAssets)
    .set({ originalPath, previewPath, thumbPath })
    .where(eq(mediaAssets.id, asset.id));
  await db().insert(postMedia).values({ postId: post.id, assetId: asset.id, sortOrder: 0 });
  return post.id;
}

/** A scheduled post plus a publication that is due right now (for the cron to pick up). */
export async function seedDuePublication(
  s: Scenario,
  opts: { caption: string; position: number },
): Promise<{ postId: string; publicationId: string }> {
  const postId = await seedPost(s, { status: "scheduled", ...opts });
  const due = new Date(Date.now() - 60_000);
  const [pub] = await db()
    .insert(publications)
    .values({
      postId,
      profileId: s.profileId,
      connectionId: s.connectionId,
      scheduledAt: due,
      nextAttemptAt: due,
      createdBy: s.userId,
    })
    .returning();
  return { postId, publicationId: pub.id };
}

/** User + workspace + active Instagram connection + profile + draft post + login session. */
export async function seedScenario(name: string): Promise<Scenario> {
  const email = `e2e-${name}@x.co`;
  await cleanup(email);

  const [user] = await db()
    .insert(users)
    .values({ email, name: `E2E ${name}` })
    .returning();
  const ws = await createWorkspaceForUser(db(), user);
  const [conn] = await db()
    .insert(instagramConnections)
    .values({
      workspaceId: ws.id,
      igUserId: `e2e_ig_${name}`,
      username: `e2e_${name}`,
      accountType: "BUSINESS",
      // Not a real token: the fake publisher never reads it, but the app decrypts it.
      accessTokenEnc: encrypt("e2e-fake-token"),
      tokenExpiresAt: new Date(Date.now() + 50 * 86_400_000),
      lastRefreshedAt: new Date(),
      scopes: PUBLISH_SCOPES,
      connectedBy: user.id,
      status: "active",
    })
    .returning();
  const [profile] = await db()
    .insert(profiles)
    .values({
      workspaceId: ws.id,
      igUsername: `e2e_${name}`,
      connectionId: conn.id,
      importSource: "graph_api",
      accountType: "business",
    })
    .returning();

  const sessionToken = randomBytes(24).toString("hex");
  await db()
    .insert(sessions)
    .values({ sessionToken, userId: user.id, expires: new Date(Date.now() + 86_400_000) });

  const base = { workspaceId: ws.id, profileId: profile.id };
  const postId = await seedPost(base, {
    status: "draft",
    caption: `Legenda e2e ${name}`,
    position: 1,
  });
  return {
    userId: user.id,
    workspaceId: ws.id,
    profileId: profile.id,
    connectionId: conn.id,
    sessionToken,
    postId,
  };
}

/** Makes every live publication of the post due right now. */
export async function makeDueNow(postId: string): Promise<void> {
  const due = new Date(Date.now() - 5_000);
  await db()
    .update(publications)
    .set({ scheduledAt: due, nextAttemptAt: due })
    .where(eq(publications.postId, postId));
}

export async function setConnectionStatus(
  connectionId: string,
  status: "active" | "expired",
): Promise<void> {
  await db()
    .update(instagramConnections)
    .set({ status, statusDetail: status === "active" ? null : "Token expirado (e2e)" })
    .where(eq(instagramConnections.id, connectionId));
}
