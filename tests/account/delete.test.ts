import { eq } from "drizzle-orm";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  approvalDecisions,
  approvalLinkOpens,
  approvalLinks,
  approvalRequests,
  instagramConnections,
  mediaAssets,
  posts,
  profiles,
  publications,
  sessions,
  users,
  workspaceMembers,
  workspaces,
} from "@/db/schema";
import { encrypt } from "@/lib/crypto/secretbox";
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

  it("deletes with Fase 6 rows in place (connection, scheduled publication, link opens)", async () => {
    process.env.AUTH_SECRET ||= "test-secret";
    const { user, ws, profile } = await seedWorkspace("dona@x.co");
    const [conn] = await db
      .insert(instagramConnections)
      .values({
        workspaceId: ws.id,
        igUserId: "ig-del",
        username: "cliente",
        accessTokenEnc: encrypt("TOKEN"),
        tokenExpiresAt: new Date(Date.now() + 86_400_000),
        scopes: ["instagram_business_basic", "instagram_business_content_publish"],
        connectedBy: user.id,
      })
      .returning();
    await db.update(profiles).set({ connectionId: conn.id }).where(eq(profiles.id, profile.id));
    const [post] = await db
      .insert(posts)
      .values({ profileId: profile.id, position: 1, caption: "agendado", status: "scheduled" })
      .returning();
    const [pub] = await db
      .insert(publications)
      .values({
        postId: post.id,
        profileId: profile.id,
        connectionId: conn.id,
        scheduledAt: new Date(Date.now() + 3_600_000),
        nextAttemptAt: new Date(Date.now() + 3_600_000),
        createdBy: user.id,
      })
      .returning();
    const [req] = await db.insert(approvalRequests).values({ profileId: profile.id }).returning();
    const [link] = await db
      .insert(approvalLinks)
      .values({
        requestId: req.id,
        tokenHash: "d".repeat(64),
        recipientName: "Carlos",
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      .returning();
    await db
      .insert(approvalLinkOpens)
      .values({ linkId: link.id, ip: "127.0.0.1", userAgent: "ua", linkState: "active" });

    const res = await deleteAccount(user.id, { deferPurge: true });
    expect(res.workspaceIds).toEqual([ws.id]);
    expect(await db.select().from(instagramConnections)).toHaveLength(0);
    const [p] = await db.select().from(publications).where(eq(publications.id, pub.id));
    expect(p.connectionId).toBeNull();
    expect(p.createdBy).toBeNull();
    const [pr] = await db.select().from(profiles).where(eq(profiles.id, profile.id));
    expect(pr.connectionId).toBeNull();
    expect(await db.select().from(approvalLinkOpens)).toHaveLength(1);
    expect(await getCurrentWorkspace(user.id)).toBeNull();
  });
});
