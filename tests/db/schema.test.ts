import { describe, expect, it } from "vitest";
import { posts, profiles, users, workspaceMembers, workspaces } from "@/db/schema";
import { testDb as db } from "../setup";

async function seed() {
  const [user] = await db.insert(users).values({ email: "a@b.co", name: "A" }).returning();
  const [ws] = await db.insert(workspaces).values({ name: "WS", ownerId: user.id }).returning();
  await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: user.id, role: "owner" });
  const [profile] = await db
    .insert(profiles)
    .values({ workspaceId: ws.id, igUsername: "Cliente" })
    .returning();
  return { user, ws, profile };
}

describe("schema", () => {
  it("inserts the base entities with defaults", async () => {
    const { profile } = await seed();
    expect(profile.gridRatio).toBe("3:4");
    expect(profile.importStatus).toBe("idle");
    expect(profile.createdAt).toBeInstanceOf(Date);
  });

  it("rejects duplicate (workspace_id, ig_username), case-insensitively", async () => {
    const { ws } = await seed();
    await expect(
      db.insert(profiles).values({ workspaceId: ws.id, igUsername: "cliente" }),
    ).rejects.toThrow();
  });

  it("rejects duplicate (profile_id, position) on posts", async () => {
    const { profile } = await seed();
    await db.insert(posts).values({ profileId: profile.id, position: 0 });
    await expect(db.insert(posts).values({ profileId: profile.id, position: 0 })).rejects.toThrow();
    await db.insert(posts).values({ profileId: profile.id, position: 1 });
  });
});
