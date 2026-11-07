import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { instagramConnections, posts, publications } from "@/db/schema";
import { testDb as db } from "../setup";
import { seedWorkspace } from "../media/helpers";

async function seed() {
  const s = await seedWorkspace();
  const [post] = await db
    .insert(posts)
    .values({ profileId: s.profile.id, position: 0 })
    .returning();
  const [conn] = await db
    .insert(instagramConnections)
    .values({
      workspaceId: s.ws.id,
      igUserId: "ig1",
      username: "cliente",
      accessTokenEnc: "enc",
      tokenExpiresAt: new Date(Date.now() + 86_400_000),
    })
    .returning();
  const at = new Date(Date.now() + 3_600_000);
  const base = { postId: post.id, profileId: s.profile.id, scheduledAt: at, nextAttemptAt: at };
  return { ...s, post, conn, base };
}

describe("publications schema", () => {
  it("applies defaults", async () => {
    const { base } = await seed();
    const [row] = await db.insert(publications).values(base).returning();
    expect(row.status).toBe("scheduled");
    expect(row.attempts).toBe(0);
    expect(row.maxAttempts).toBe(5);
    expect(row.timezone).toBe("America/Sao_Paulo");
    expect(row.connectionId).toBeNull();
  });

  it("rejects two live publications for the same post", async () => {
    const { base } = await seed();
    await db.insert(publications).values(base);
    await expect(db.insert(publications).values(base)).rejects.toThrow();
    await expect(
      db.insert(publications).values({ ...base, status: "publishing" }),
    ).rejects.toThrow();
  });

  it("allows a cancelled (or failed) publication next to a live one", async () => {
    const { base } = await seed();
    await db.insert(publications).values({ ...base, status: "cancelled" });
    await db.insert(publications).values({ ...base, status: "failed" });
    await db.insert(publications).values(base);
    const rows = await db.select().from(publications);
    expect(rows).toHaveLength(3);
  });

  it("keeps ig_media_id unique when not null; nulls repeat", async () => {
    const { base } = await seed();
    await db.insert(publications).values({ ...base, status: "cancelled" });
    await db.insert(publications).values({ ...base, status: "cancelled" });
    await db.insert(publications).values({ ...base, status: "published", igMediaId: "m1" });
    await expect(
      db.insert(publications).values({ ...base, status: "published", igMediaId: "m1" }),
    ).rejects.toThrow();
  });

  it("sets connection_id to null when the connection is deleted", async () => {
    const { base, conn } = await seed();
    const [row] = await db
      .insert(publications)
      .values({ ...base, connectionId: conn.id })
      .returning();
    await db.delete(instagramConnections).where(eq(instagramConnections.id, conn.id));
    const [after] = await db.select().from(publications).where(eq(publications.id, row.id));
    expect(after.connectionId).toBeNull();
  });

  it("cascades when the post is deleted", async () => {
    const { base, post } = await seed();
    await db.insert(publications).values(base);
    await db.delete(posts).where(eq(posts.id, post.id));
    expect(await db.select().from(publications)).toHaveLength(0);
  });
});
