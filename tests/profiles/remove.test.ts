import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityLog,
  approvalDecisions,
  approvalLinks,
  approvalRequests,
  instagramConnections,
  posts,
  profiles,
  publications,
} from "@/db/schema";
import { encrypt } from "@/lib/crypto/secretbox";
import { resolveLink } from "@/lib/approvals/decide";
import { hashToken } from "@/lib/approvals/token";
import { findOrCreateProfileForConnection } from "@/lib/profiles/from-connection";
import { testDb } from "../setup";
import { makeRequireMock, seedWorkspace } from "../media/helpers";

const mocks = vi.hoisted(() => ({ user: { id: "" } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require", async () => {
  const base = await makeRequireMock(mocks);
  const { db } = await import("@/db/client");
  const { findCurrentWorkspace } = await import("@/lib/workspace/current");
  return {
    ...base,
    getCurrentWorkspace: (userId: string) => findCurrentWorkspace(db, userId),
  };
});

import { removeProfile } from "@/lib/profiles/actions";
import { listProfiles } from "@/lib/profiles/queries";
import { requireWorkspaceForProfile } from "@/lib/auth/require";

const TOKEN = "remove-test-token";

async function seedDecided(ctx: Awaited<ReturnType<typeof seedWorkspace>>) {
  const [conn] = await testDb
    .insert(instagramConnections)
    .values({
      workspaceId: ctx.ws.id,
      igUserId: "ig-remove",
      username: "cliente",
      accessTokenEnc: encrypt("TOKEN"),
      tokenExpiresAt: new Date(Date.now() + 86_400_000),
      scopes: ["instagram_business_basic", "instagram_business_content_publish"],
      connectedBy: ctx.user.id,
    })
    .returning();
  await testDb
    .update(profiles)
    .set({ connectionId: conn.id })
    .where(eq(profiles.id, ctx.profile.id));
  const [decidedPost] = await testDb
    .insert(posts)
    .values({ profileId: ctx.profile.id, position: 1, caption: "aprovado", status: "approved" })
    .returning();
  const [scheduledPost] = await testDb
    .insert(posts)
    .values({ profileId: ctx.profile.id, position: 2, caption: "agendado", status: "scheduled" })
    .returning();
  const [pub] = await testDb
    .insert(publications)
    .values({
      postId: scheduledPost.id,
      profileId: ctx.profile.id,
      connectionId: conn.id,
      scheduledAt: new Date(Date.now() + 3_600_000),
      nextAttemptAt: new Date(Date.now() + 3_600_000),
      createdBy: ctx.user.id,
    })
    .returning();
  const [req] = await testDb
    .insert(approvalRequests)
    .values({ profileId: ctx.profile.id })
    .returning();
  const [link] = await testDb
    .insert(approvalLinks)
    .values({
      requestId: req.id,
      tokenHash: hashToken(TOKEN),
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    .returning();
  await testDb.insert(approvalDecisions).values({
    requestId: req.id,
    postId: decidedPost.id,
    linkId: link.id,
    decision: "approved",
  });
  return { conn, scheduledPost, pub, req, link };
}

describe("removeProfile", () => {
  let ctx: Awaited<ReturnType<typeof seedWorkspace>>;
  beforeEach(async () => {
    ctx = await seedWorkspace();
    mocks.user.id = ctx.user.id;
  });

  it("hard-deletes a profile without approval decisions", async () => {
    const res = await removeProfile(ctx.profile.id);
    expect(res).toEqual({ ok: true, data: { mode: "hard" } });
    expect(
      await testDb.select().from(profiles).where(eq(profiles.id, ctx.profile.id)),
    ).toHaveLength(0);
  });

  it("soft-deletes a profile with decisions and keeps the audit trail", async () => {
    const seeded = await seedDecided(ctx);
    expect(await listProfiles()).toHaveLength(1);

    const res = await removeProfile(ctx.profile.id);
    expect(res).toEqual({ ok: true, data: { mode: "soft" } });

    const [p] = await testDb.select().from(profiles).where(eq(profiles.id, ctx.profile.id));
    expect(p.deletedAt).not.toBeNull();
    expect(p.connectionId).toBeNull();

    expect(await listProfiles()).toHaveLength(0);
    await expect(requireWorkspaceForProfile(ctx.profile.id)).rejects.toThrow();

    expect(await testDb.select().from(approvalDecisions)).toHaveLength(1);

    const [pub] = await testDb
      .select()
      .from(publications)
      .where(eq(publications.id, seeded.pub.id));
    expect(pub.status).toBe("cancelled");
    const [post] = await testDb.select().from(posts).where(eq(posts.id, seeded.scheduledPost.id));
    expect(post.status).toBe("draft");

    const [link] = await testDb
      .select()
      .from(approvalLinks)
      .where(eq(approvalLinks.id, seeded.link.id));
    expect(link.revokedAt).not.toBeNull();
    expect((await resolveLink(TOKEN)).state).toBe("revoked");

    const [log] = await testDb
      .select()
      .from(activityLog)
      .where(eq(activityLog.event, "profile.removed"));
    expect(log.payload).toMatchObject({ mode: "soft" });
  });

  it("restores the soft-deleted profile when the same account reconnects", async () => {
    const seeded = await seedDecided(ctx);
    await removeProfile(ctx.profile.id);

    const res = await findOrCreateProfileForConnection({
      id: seeded.conn.id,
      workspaceId: ctx.ws.id,
      username: "cliente",
      accountType: "BUSINESS",
    });
    expect(res).toEqual({ profileId: ctx.profile.id, created: false });

    const [p] = await testDb.select().from(profiles).where(eq(profiles.id, ctx.profile.id));
    expect(p.deletedAt).toBeNull();
    expect(p.connectionId).toBe(seeded.conn.id);
    expect(await listProfiles()).toHaveLength(1);
    const [log] = await testDb
      .select()
      .from(activityLog)
      .where(eq(activityLog.event, "profile.restored"));
    expect(log).toBeDefined();
  });
});
