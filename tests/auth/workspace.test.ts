import { describe, expect, it } from "vitest";
import { workspaceMembers, users } from "@/db/schema";
import { createWorkspaceForUser } from "@/lib/workspace/create";
import { isMember } from "@/lib/workspace/membership";
import { eq } from "drizzle-orm";
import { testDb as db } from "../setup";

describe("workspace", () => {
  it("createWorkspaceForUser creates workspace and owner membership", async () => {
    const [u] = await db.insert(users).values({ email: "maria@x.co" }).returning();
    const ws = await createWorkspaceForUser(db, u);
    expect(ws.name).toBe("maria");
    expect(ws.ownerId).toBe(u.id);
    const members = await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, u.id));
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe("owner");
  });

  it("isMember returns true for members and false otherwise", async () => {
    const [u] = await db.insert(users).values({ email: "a@x.co", name: "Ana" }).returning();
    const [other] = await db.insert(users).values({ email: "b@x.co" }).returning();
    const ws = await createWorkspaceForUser(db, u);
    expect(ws.name).toBe("Ana");
    expect(await isMember(db, ws.id, u.id)).toBe(true);
    expect(await isMember(db, ws.id, other.id)).toBe(false);
  });
});
