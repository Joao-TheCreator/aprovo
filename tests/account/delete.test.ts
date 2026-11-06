import { eq } from "drizzle-orm";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  approvalDecisions,
  approvalLinks,
  approvalRequests,
  mediaAssets,
  posts,
  sessions,
  users,
  workspaceMembers,
  workspaces,
} from "@/db/schema";
import { deleteAccount } from "@/lib/account/delete";
import { getCurrentWorkspace } from "@/lib/auth/require";
import { makeTempStorage, seedWorkspace } from "../media/helpers";
import { testDb as db } from "../setup";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

let tmp: Awaited<ReturnType<typeof makeTempStorage>>;
beforeAll(async () => {
  tmp = await makeTempStorage();
});
afterAll(async () => {
  await tmp.cleanup();
});

describe("deleteAccount", () => {
  it("anonymizes the user, soft-deletes the workspace, keeps approval data, purges files", async () => {
    const { user, ws, profile } = await seedWorkspace("dono@x.co");
    await db
      .update(users)
      .set({ name: "Dono", image: "http://img", emailVerified: new Date() })
      .where(eq(users.id, user.id));
    await db.insert(sessions).values({
      sessionToken: "tok",
      userId: user.id,
      expires: new Date(Date.now() + 1e6),
    });
    const key = `originals/${ws.id}/a1/orig.jpg`;
    const file = path.join(tmp.dir, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "x");
    const [asset] = await db
      .insert(mediaAssets)
      .values({ workspaceId: ws.id, kind: "image", originalPath: key, status: "ready" })
      .returning();
    const [post] = await db
      .insert(posts)
      .values({ profileId: profile.id, position: 1, caption: "oi" })
      .returning();
    const [req] = await db.insert(approvalRequests).values({ profileId: profile.id }).returning();
    const [link] = await db
      .insert(approvalLinks)
      .values({ requestId: req.id, tokenHash: "h", expiresAt: new Date(Date.now() + 1e6) })
      .returning();
    await db.insert(approvalDecisions).values({
      requestId: req.id,
      postId: post.id,
      linkId: link.id,
      decision: "approved",
      approverName: "Cliente",
    });

    expect(await getCurrentWorkspace(user.id)).not.toBeNull();
    const res = await deleteAccount(user.id);
    expect(res.workspaceIds).toEqual([ws.id]);

    const [u] = await db.select().from(users).where(eq(users.id, user.id));
    expect(u.email).toBe(`deleted+${user.id}@anon.aprovo`);
    expect(u.name).toBeNull();
    expect(u.image).toBeNull();
    expect(u.emailVerified).toBeNull();
    const [w] = await db.select().from(workspaces).where(eq(workspaces.id, ws.id));
    expect(w.deletedAt).not.toBeNull();
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
    expect(
      await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, ws.id)),
    ).toHaveLength(0);
    expect(await db.select().from(posts)).toHaveLength(1);
    expect(await db.select().from(approvalDecisions)).toHaveLength(1);
    expect(await getCurrentWorkspace(user.id)).toBeNull();

    expect(existsSync(file)).toBe(false);
    const [a] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, asset.id));
    expect(a.status).toBe("failed");
    expect(a.originalPath).toBe("");
  });

  it("getCurrentWorkspace skips deleted workspaces", async () => {
    const { user, ws } = await seedWorkspace("skip@x.co");
    await db.update(workspaces).set({ deletedAt: new Date() }).where(eq(workspaces.id, ws.id));
    expect(await getCurrentWorkspace(user.id)).toBeNull();
  });
});
