import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityLog,
  approvalDecisions,
  approvalLinks,
  approvalRequests,
  mediaAssets,
  postMedia,
  posts,
} from "@/db/schema";
import { testDb } from "../setup";
import { makeRequireMock, seedWorkspace } from "../media/helpers";

const mocks = vi.hoisted(() => ({ user: { id: "" } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require", async () => {
  const base = await makeRequireMock(mocks);
  const { eq } = await import("drizzle-orm");
  const { db } = await import("@/db/client");
  const { workspaceMembers, workspaces } = await import("@/db/schema");
  return {
    ...base,
    getCurrentWorkspace: async (userId: string) => {
      const [row] = await db
        .select({ ws: workspaces })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
        .where(eq(workspaceMembers.userId, userId))
        .limit(1);
      return row ? { ...row.ws, role: "owner" } : null;
    },
  };
});
vi.mock("@/lib/email/send", () => ({ sendDecisionEmail: vi.fn(async () => undefined) }));

import {
  cancelApprovalRequest,
  createApprovalRequest,
  issueApprovalLink,
  revokeApprovalLink,
} from "@/lib/approvals/actions";
import { getPublicApproval, listApprovalRequests } from "@/lib/approvals/queries";
import { resetRateLimits } from "@/lib/approvals/rate-limit";
import { hashToken } from "@/lib/approvals/token";
import { getPost } from "@/lib/posts/queries";
import { POST as decideRoute } from "@/app/api/approval/[token]/decide/route";
import { GET as eventsRoute } from "@/app/api/events/route";

async function seed() {
  process.env.APP_URL = "http://localhost:3000";
  const s = await seedWorkspace();
  mocks.user.id = s.user.id;
  let pos = 0;
  const mkPost = async (
    opts: { assetStatus?: "ready" | "processing"; status?: "draft" | "approved" } = {},
  ) => {
    const [a] = await testDb
      .insert(mediaAssets)
      .values({
        workspaceId: s.ws.id,
        kind: "image",
        status: opts.assetStatus ?? "ready",
        originalPath: "originals/x.jpg",
        thumbPath: "thumbs/x.webp",
      })
      .returning();
    const [p] = await testDb
      .insert(posts)
      .values({
        profileId: s.profile.id,
        position: pos--,
        status: opts.status ?? "draft",
        caption: "Post da coxinha",
        notes: "SEGREDO INTERNO",
      })
      .returning();
    await testDb.insert(postMedia).values({ postId: p.id, assetId: a.id, sortOrder: 0 });
    return p.id;
  };
  return { ...s, mkPost };
}

function tokenOf(url: string) {
  return url.split("/a/")[1];
}

function decide(token: string, body: unknown, ip = "203.0.113.7") {
  return decideRoute(
    new NextRequest(`http://localhost/api/approval/${token}/decide`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "x-forwarded-for": `${ip}, 10.0.0.1`, "user-agent": "vitest-ua" },
    }),
    { params: Promise.resolve({ token }) },
  );
}

async function send(profileId: string, postIds: string[]) {
  const r = await createApprovalRequest({ profileId, postIds, label: "WhatsApp" });
  if (!r.ok) throw new Error(r.code);
  return { ...r.data, token: tokenOf(r.data.url) };
}

describe("approvals", () => {
  beforeEach(() => {
    resetRateLimits();
    mocks.user.id = "";
  });

  it("creates a request: posts pending, url shape, only the hash stored", async () => {
    const { profile, mkPost } = await seed();
    const [a, b] = [await mkPost(), await mkPost()];
    const r = await send(profile.id, [a, b]);
    expect(r.url).toMatch(/^http:\/\/localhost:3000\/a\/[A-Za-z0-9_-]{43}$/);
    const [link] = await testDb.select().from(approvalLinks).where(eq(approvalLinks.id, r.linkId));
    expect(link.tokenHash).toBe(hashToken(r.token));
    expect(link.tokenHash).not.toContain(r.token);
    expect(link.label).toBe("WhatsApp");
    const days = (link.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    const ps = await testDb.select().from(posts);
    expect(ps.every((p) => p.status === "pending_approval" && p.sentForApprovalAt)).toBe(true);
    const ev = (await testDb.select().from(activityLog)).map((e) => e.event);
    expect(ev.filter((e) => e === "approval.sent")).toHaveLength(2);
    expect(ev).toContain("approval.request_created");
    expect(JSON.stringify(await testDb.select().from(activityLog))).not.toContain(r.token);
  });

  it("rejects invalid status and non-ready media", async () => {
    const { profile, mkPost } = await seed();
    const approved = await mkPost({ status: "approved" });
    expect(
      await createApprovalRequest({ profileId: profile.id, postIds: [approved] }),
    ).toMatchObject({
      code: "invalid_status",
    });
    const proc = await mkPost({ assetStatus: "processing" });
    expect(await createApprovalRequest({ profileId: profile.id, postIds: [proc] })).toMatchObject({
      code: "no_ready_media",
    });
  });

  it("decide: approval, request progression, repeat and validation", async () => {
    const { profile, mkPost } = await seed();
    const [a, b] = [await mkPost(), await mkPost()];
    const r = await send(profile.id, [a, b]);

    const bad = await decide(r.token, { postId: a, decision: "changes_requested" });
    expect(bad.status).toBe(400);

    const res = await decide(r.token, { postId: a, decision: "approved", approverName: "Carlos" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, data: { status: "approved" } });
    const [pa] = await testDb.select().from(posts).where(eq(posts.id, a));
    expect(pa.status).toBe("approved");
    expect(pa.approvedAt).not.toBeNull();
    const [d] = await testDb.select().from(approvalDecisions);
    expect(d).toMatchObject({
      linkId: r.linkId,
      ip: "203.0.113.7",
      userAgent: "vitest-ua",
      approverName: "Carlos",
    });
    let [req] = await testDb.select().from(approvalRequests);
    expect(req.status).toBe("partially_decided");

    const again = await decide(r.token, { postId: a, decision: "approved" });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ code: "already_decided" });

    // another link of the same request cannot re-decide either
    const l2 = await issueApprovalLink(r.requestId, "Outro contato");
    if (!l2.ok) throw new Error("x");
    expect(
      (
        await decide(tokenOf(l2.data.url), {
          postId: a,
          decision: "changes_requested",
          comment: "x",
        })
      ).status,
    ).toBe(409);

    const res2 = await decide(r.token, {
      postId: b,
      decision: "changes_requested",
      comment: "Trocar a foto",
    });
    expect(res2.status).toBe(200);
    [req] = await testDb.select().from(approvalRequests);
    expect(req.status).toBe("decided");
    const [pb] = await testDb.select().from(posts).where(eq(posts.id, b));
    expect(pb.status).toBe("changes_requested");
    expect(await testDb.select().from(approvalDecisions)).toHaveLength(2);
    expect((await getPost(b))?.lastClientComment).toBe("Trocar a foto");
    expect((await getPost(a))?.lastClientComment).toBeNull();

    const ev = (await testDb.select().from(activityLog)).filter(
      (e) => e.event === "approval.decided",
    );
    expect(ev).toHaveLength(2);
    expect(ev[0].actor).toBe(`link:${r.linkId}`);
  });

  it("404 for unknown, expired and revoked links; post must belong to request", async () => {
    const { profile, mkPost } = await seed();
    const [a, other] = [await mkPost(), await mkPost()];
    const r = await send(profile.id, [a]);
    const ok = { postId: a, decision: "approved" };
    expect((await decide("nope", ok)).status).toBe(404);
    expect((await decide(r.token, { postId: other, decision: "approved" })).status).toBe(404);

    await testDb
      .update(approvalLinks)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(approvalLinks.id, r.linkId));
    const res = await decide(r.token, ok);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "link_inactive" });
    expect((await getPublicApproval(r.token)).linkState).toBe("expired");

    await testDb
      .update(approvalLinks)
      .set({ expiresAt: new Date(Date.now() + 1e7), revokedAt: new Date() })
      .where(eq(approvalLinks.id, r.linkId));
    expect((await decide(r.token, ok)).status).toBe(404);
    expect((await getPublicApproval(r.token)).linkState).toBe("revoked");
    expect((await getPublicApproval("nope")).linkState).toBe("not_found");
  });

  it("rate limits the 11th call", async () => {
    const { profile, mkPost } = await seed();
    const r = await send(profile.id, [await mkPost()]);
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (
        await decide(
          r.token,
          { postId: "00000000-0000-4000-8000-000000000000", decision: "approved" },
          "198.51.100.1",
        )
      ).status;
      if (i < 10) expect(last).not.toBe(429);
    }
    expect(last).toBe(429);
  });

  it("cancel returns pending posts to draft and revokes links; revoke link works", async () => {
    const { profile, mkPost } = await seed();
    const [a, b] = [await mkPost(), await mkPost()];
    const r = await send(profile.id, [a, b]);
    await decide(r.token, { postId: a, decision: "approved" });
    expect((await cancelApprovalRequest(r.requestId)).ok).toBe(true);
    const [pa] = await testDb.select().from(posts).where(eq(posts.id, a));
    const [pb] = await testDb.select().from(posts).where(eq(posts.id, b));
    expect(pa.status).toBe("approved");
    expect(pb.status).toBe("draft");
    const [req] = await testDb.select().from(approvalRequests);
    expect(req.status).toBe("revoked");
    expect((await getPublicApproval(r.token)).linkState).toBe("revoked");
    expect(await issueApprovalLink(r.requestId)).toMatchObject({ code: "link_inactive" });

    const c = await mkPost();
    const r2 = await send(profile.id, [c]);
    expect((await revokeApprovalLink(r2.linkId)).ok).toBe(true);
    expect((await getPublicApproval(r2.token)).linkState).toBe("revoked");
  });

  it("public view: active, counts opens, never exposes notes", async () => {
    const { profile, mkPost } = await seed();
    const a = await mkPost();
    const r = await send(profile.id, [a]);
    const v = await getPublicApproval(r.token, { recordOpen: true });
    await getPublicApproval(r.token, { recordOpen: true });
    expect(v.linkState).toBe("active");
    expect(v.items).toHaveLength(1);
    expect(v.items[0].media).toHaveLength(1);
    expect(v.profile?.igUsername).toBe("cliente");
    expect(v.request?.senderName).toBe("a");
    expect(JSON.stringify(v)).not.toContain("SEGREDO");
    const [l] = await testDb.select().from(approvalLinks);
    expect(l.openedCount).toBe(2);
    expect(l.lastOpenedAt).not.toBeNull();
  });

  it("lists requests with counts and links", async () => {
    const { profile, mkPost } = await seed();
    const [a, b] = [await mkPost(), await mkPost()];
    const r = await send(profile.id, [a, b]);
    await decide(r.token, { postId: a, decision: "approved" });
    const list = await listApprovalRequests(profile.id);
    expect(list).toHaveLength(1);
    expect(list[0].counts).toEqual({ items: 2, approved: 1, changes: 0, pending: 1 });
    expect(list[0].links[0].label).toBe("WhatsApp");
    expect(list[0].items.find((i) => i.postId === a)?.decidedViaLink).toBe("WhatsApp");
    expect(await listApprovalRequests()).toHaveLength(1);
  });

  it("polling endpoint returns post.status with the decision; 403 for non-members", async () => {
    const { profile, mkPost } = await seed();
    const a = await mkPost();
    const since = new Date(Date.now() - 1000).toISOString();
    const r = await send(profile.id, [a]);
    await decide(r.token, { postId: a, decision: "changes_requested", comment: "Ajustar" });
    const call = (id: string) =>
      eventsRoute(
        new NextRequest(
          `http://localhost/api/events?profile=${id}&since=${encodeURIComponent(since)}`,
        ),
      );
    const res = await call(profile.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({
      type: "post.status",
      postId: a,
      status: "changes_requested",
      profileId: profile.id,
      decision: { decision: "changes_requested", comment: "Ajustar" },
    });
    expect(typeof body.now).toBe("string");

    const other = await seedWorkspace("b@x.co");
    mocks.user.id = other.user.id;
    expect((await call(profile.id)).status).toBe(403);
  });
});
