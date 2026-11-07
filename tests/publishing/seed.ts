import { eq } from "drizzle-orm";
import { instagramConnections, mediaAssets, postMedia, posts, publications } from "@/db/schema";
import { testDb as db } from "../setup";
import { seedWorkspace } from "../media/helpers";

export const PUBLISH_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];

type Base = Awaited<ReturnType<typeof seedWorkspace>>;
type Connection = typeof instagramConnections.$inferSelect;

type Seed = {
  items?: Array<"image" | "video">;
  connection?: Partial<typeof instagramConnections.$inferInsert> | null;
  publication?: Partial<typeof publications.$inferInsert>;
  /** Reuse a workspace/profile/connection from an earlier seed. */
  from?: Base & { conn: Connection | null };
  email?: string;
};

/** Workspace, profile, active connection, scheduled post with ready media and a due publication. */
export async function seedJob(opts: Seed = {}) {
  const base: Base = opts.from ?? (await seedWorkspace(opts.email));
  let conn: Connection | null = opts.from?.conn ?? null;
  if (!conn && opts.connection !== null) {
    [conn] = await db
      .insert(instagramConnections)
      .values({
        workspaceId: base.ws.id,
        igUserId: "ig1",
        username: "cliente",
        accessTokenEnc: "enc",
        tokenExpiresAt: new Date(Date.now() + 86_400_000),
        scopes: PUBLISH_SCOPES,
        ...opts.connection,
      })
      .returning();
  }
  const items = opts.items ?? ["image"];
  const [post] = await db
    .insert(posts)
    .values({
      profileId: base.profile.id,
      position: Math.floor(Math.random() * 1_000_000),
      status: "scheduled",
      kind: items.length === 1 && items[0] === "video" ? "video" : "post",
      caption: "Legenda",
    })
    .returning();
  for (const [i, kind] of items.entries()) {
    const [asset] = await db
      .insert(mediaAssets)
      .values(
        kind === "image"
          ? {
              workspaceId: base.ws.id,
              kind,
              originalPath: `originals/${base.ws.id}/a${i}/orig.jpg`,
              mimeType: "image/jpeg",
              width: 1080,
              height: 1080,
              sizeBytes: 1000,
              status: "ready" as const,
            }
          : {
              workspaceId: base.ws.id,
              kind,
              originalPath: `originals/${base.ws.id}/v${i}/orig.mp4`,
              mimeType: "video/mp4",
              durationMs: 10_000,
              sizeBytes: 1000,
              status: "ready" as const,
            },
      )
      .returning();
    await db.insert(postMedia).values({ postId: post.id, assetId: asset.id, sortOrder: i });
  }
  const due = new Date(Date.now() - 60_000);
  const [pub] = await db
    .insert(publications)
    .values({
      postId: post.id,
      profileId: base.profile.id,
      connectionId: conn?.id ?? null,
      scheduledAt: due,
      nextAttemptAt: due,
      ...opts.publication,
    })
    .returning();
  return { ...base, conn, post, pub };
}

export async function makeDue(id: string): Promise<void> {
  await db
    .update(publications)
    .set({ nextAttemptAt: new Date(Date.now() - 1000) })
    .where(eq(publications.id, id));
}
