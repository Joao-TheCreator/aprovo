import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityLog,
  approvalDecisions,
  approvalLinkOpens,
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
  issuePersonalLink,
  revokeApprovalLink,
} from "@/lib/approvals/actions";
import { derivePostStatus } from "@/lib/approvals/decide";
import { getPublicApproval, listApprovalRequests } from "@/lib/approvals/queries";
import { resetRateLimits } from "@/lib/approvals/rate-limit";
import { hashToken } from "@/lib/approvals/token";
import { getPost } from "@/lib/posts/queries";
import { POST as decideRoute } from "@/app/api/approval/[token]/decide/route";
import { POST as decideAllRoute } from "@/app/api/approval/[token]/decide-all/route";
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

function decideAll(token: string, body: unknown, ip = "203.0.113.7") {
  return decideAllRoute(
    new NextRequest(`http://localhost/api/approval/${token}/decide-all`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "x-forwarded-for": `${ip}, 10.0.0.1`, "user-agent": "vitest-ua" },
    }),
    { params: Promise.resolve({ token }) },
  );
}

/** Personal link for "Carlos" (default mode). */
async function send(profileId: string, postIds: string[]) {
  const r = await createApprovalRequest({
    profileId,
    postIds,
    label: "WhatsApp",
    recipients: [{ name: "Carlos", contact: "WhatsApp (11) 91234-5678" }],
  });
  if (!r.ok) throw new Error(r.code);
  return { ...r.data, token: tokenOf(r.data.url) };
}

/** Legacy open link. */
async function sendShared(profileId: string, postIds: string[]) {
  const r = await createApprovalRequest({ profileId, postIds, label: "WhatsApp", mode: "shared" });
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
    expect(link).toMatchObject({ mode: "personal", recipientName: "Carlos" });
    expect(r.links).toHaveLength(1);
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
      await createApprovalRequest({
        profileId: profile.id,
        postIds: [approved],
        recipients: [{ name: "Carlos" }],
      }),
    ).toMatchObject({
      code: "invalid_status",
    });
    const proc = await mkPost({ assetStatus: "processing" });
    expect(
      await createApprovalRequest({
        profileId: profile.id,
        postIds: [proc],
        recipients: [{ name: "Carlos" }],
      }),
    ).toMatchObject({
      code: "no_ready_media",
    });
  });

  it("shared link: approval, request progression, repeat and validation (legacy behavior)", async () => {
    const { profile, mkPost } = await seed();
    const [a, b] = [await mkPost(), await mkPost()];
    const r = await sendShared(profile.id, [a, b]);

    const bad = await decide(r.token, { postId: a, decision: "changes_requested" });
    expect(bad.status).toBe(400);

    const res = await decide(r.token, { postId: a, decision: "approved", approverName: "Carlos" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, data: { status: "approved", linkUsed: false } });
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

    // another shared link of the same request cannot re-decide either
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
    expect(await res2.json()).toMatchObject({ data: { linkUsed: false } });
    [req] = await testDb.select().from(approvalRequests);
    expect(req.status).toBe("decided");
    // shared links are never consumed
    const [sl] = await testDb.select().from(approvalLinks).where(eq(approvalLinks.id, r.linkId));
    expect(sl.usedAt).toBeNull();
    expect(sl.mode).toBe("shared");
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

  it("404 for unknown links, 410 for expired and revoked; post must belong to request", async () => {
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
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ code: "link_expired" });
    expect((await getPublicApproval(r.token)).linkState).toBe("expired");

    await testDb
      .update(approvalLinks)
      .set({ expiresAt: new Date(Date.now() + 1e7), revokedAt: new Date() })
      .where(eq(approvalLinks.id, r.linkId));
    const rev = await decide(r.token, ok);
    expect(rev.status).toBe(410);
    expect(await rev.json()).toMatchObject({ code: "link_revoked" });
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
    expect(await issuePersonalLink(r.requestId, { name: "Ana" })).toMatchObject({
      code: "link_inactive",
    });
    const [cancelled] = await testDb.select().from(approvalLinks);
    expect(cancelled.usedAt).toBeNull();

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
    expect(list[0].items.find((i) => i.postId === a)?.decidedViaLink).toBe("Carlos");
    expect(list[0].links[0]).toMatchObject({
      mode: "personal",
      recipientName: "Carlos",
      recipientContact: "WhatsApp (11) 91234-5678",
      usedAt: null,
    });
    expect(list[0].links[0].decisions).toHaveLength(1);
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

  describe("personal links (doc 13)", () => {
    it("two recipients get two distinct links; shared needs no recipients; personal needs one", async () => {
      const { profile, mkPost } = await seed();
      const a = await mkPost();
      const r = await createApprovalRequest({
        profileId: profile.id,
        postIds: [a],
        recipients: [{ name: "Carlos" }, { name: "Ana", contact: "ana@x.co" }],
      });
      if (!r.ok) throw new Error(r.code);
      expect(r.data.links).toHaveLength(2);
      expect(r.data.url).toBe(r.data.links[0].url);
      expect(r.data.linkId).toBe(r.data.links[0].linkId);
      const [u1, u2] = r.data.links.map((l) => l.url);
      expect(u1).not.toBe(u2);
      const rows = await testDb.select().from(approvalLinks);
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((l) => l.tokenHash)).size).toBe(2);
      expect(rows.every((l) => l.mode === "personal")).toBe(true);
      expect(rows.map((l) => l.recipientName).sort()).toEqual(["Ana", "Carlos"]);
      expect(rows.find((l) => l.recipientName === "Ana")?.recipientContact).toBe("ana@x.co");

      const b = await mkPost();
      expect(await createApprovalRequest({ profileId: profile.id, postIds: [b] })).toMatchObject({
        ok: false,
        code: "invalid_input",
      });
      const sh = await createApprovalRequest({
        profileId: profile.id,
        postIds: [b],
        mode: "shared",
      });
      expect(sh.ok && sh.data.links[0]).toMatchObject({ mode: "shared", recipientName: null });
    });

    it("1-item request: the first decision consumes the link, the second call is 410 link_used", async () => {
      const { profile, mkPost } = await seed();
      const a = await mkPost();
      const r = await send(profile.id, [a]);
      const res = await decide(r.token, {
        postId: a,
        decision: "approved",
        approverName: "Outro Nome",
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        ok: true,
        data: { linkUsed: true, decision: { approverName: "Carlos" } },
      });
      const [l] = await testDb.select().from(approvalLinks);
      expect(l.usedAt).not.toBeNull();
      expect(l.usedReason).toBe("decided");
      const events = (await testDb.select().from(activityLog)).map((e) => e.event);
      expect(events).toContain("approval.link_used");

      const again = await decide(r.token, { postId: a, decision: "approved" });
      expect(again.status).toBe(410);
      expect(await again.json()).toMatchObject({ code: "link_used" });
      expect(await testDb.select().from(approvalDecisions)).toHaveLength(1);
    });

    it("N items: a partial decision keeps the link alive, the last one consumes it", async () => {
      const { profile, mkPost } = await seed();
      const ids = [await mkPost(), await mkPost(), await mkPost()];
      const r = await send(profile.id, ids);
      const first = await (await decide(r.token, { postId: ids[0], decision: "approved" })).json();
      expect(first.data.linkUsed).toBe(false);
      const second = await (
        await decide(r.token, { postId: ids[1], decision: "changes_requested", comment: "Ajustar" })
      ).json();
      expect(second.data.linkUsed).toBe(false);
      expect((await getPublicApproval(r.token)).linkState).toBe("active");
      const third = await (await decide(r.token, { postId: ids[2], decision: "approved" })).json();
      expect(third.data.linkUsed).toBe(true);
      expect((await getPublicApproval(r.token)).linkState).toBe("used");
    });

    it("decide-all consumes the link in one call and does not duplicate decisions", async () => {
      const { profile, mkPost } = await seed();
      const ids = [await mkPost(), await mkPost(), await mkPost()];
      const r = await send(profile.id, ids);
      await decide(r.token, { postId: ids[0], decision: "approved" });
      const body = { decisions: ids.map((postId) => ({ postId, decision: "approved" })) };
      const res = await decideAll(r.token, body);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.linkUsed).toBe(true);
      expect(json.data.results.map((x: { skipped: boolean }) => x.skipped)).toEqual([
        true,
        false,
        false,
      ]);
      expect(await testDb.select().from(approvalDecisions)).toHaveLength(3);
      const [req] = await testDb.select().from(approvalRequests);
      expect(req.status).toBe("decided");
      const ps = await testDb.select().from(posts);
      expect(ps.every((p) => p.status === "approved")).toBe(true);

      // replay after consumption: 410, nothing new written
      const replay = await decideAll(r.token, body);
      expect(replay.status).toBe(410);
      expect(await replay.json()).toMatchObject({ code: "link_used" });
      expect(await testDb.select().from(approvalDecisions)).toHaveLength(3);
    });

    it("decide-all validates input and scopes items to the request", async () => {
      const { profile, mkPost } = await seed();
      const [a, other] = [await mkPost(), await mkPost()];
      const r = await send(profile.id, [a]);
      expect((await decideAll(r.token, { decisions: [] })).status).toBe(400);
      expect(
        (await decideAll(r.token, { decisions: [{ postId: a, decision: "changes_requested" }] }))
          .status,
      ).toBe(400);
      expect(
        (await decideAll(r.token, { decisions: [{ postId: other, decision: "approved" }] })).status,
      ).toBe(404);
      expect(await testDb.select().from(approvalDecisions)).toHaveLength(0);
      expect(
        (await decideAll("nope", { decisions: [{ postId: a, decision: "approved" }] })).status,
      ).toBe(404);
    });

    it("derivePostStatus", () => {
      const t = (min: number) => new Date(Date.UTC(2026, 10, 1, 12, min));
      const approve = (linkId: string, min: number) => ({
        linkId,
        decision: "approved" as const,
        decidedAt: t(min),
      });
      const changes = (linkId: string, min: number) => ({
        linkId,
        decision: "changes_requested" as const,
        decidedAt: t(min),
      });
      expect(derivePostStatus([], null)).toBe("pending_approval");
      expect(derivePostStatus([approve("a", 1)], null)).toBe("approved");
      // changes wins regardless of order
      expect(derivePostStatus([approve("a", 1), changes("b", 2)], null)).toBe("changes_requested");
      expect(derivePostStatus([changes("b", 1), approve("a", 2)], null)).toBe("changes_requested");
      // decisions before the last send are ignored
      expect(derivePostStatus([changes("b", 1)], t(5))).toBe("pending_approval");
      expect(derivePostStatus([changes("b", 1), approve("a", 6)], t(5))).toBe("approved");
      // any rule: first approval is enough
      expect(derivePostStatus([approve("a", 1)], null, "any", ["a", "b"])).toBe("approved");
      // all rule waits for every recipient
      expect(derivePostStatus([approve("a", 1)], null, "all", ["a", "b"])).toBe("pending_approval");
      expect(derivePostStatus([approve("a", 1), approve("b", 2)], null, "all", ["a", "b"])).toBe(
        "approved",
      );
      expect(derivePostStatus([approve("a", 1), changes("b", 2)], null, "all", ["a", "b"])).toBe(
        "changes_requested",
      );
      // all rule without a recipient list falls back to the links that decided
      expect(derivePostStatus([approve("a", 1), approve("b", 2)], null, "all")).toBe("approved");
    });

    it("two recipients: any approval approves, changes prevails, request status progresses", async () => {
      const { profile, mkPost } = await seed();
      const [a, b] = [await mkPost(), await mkPost()];
      const r = await createApprovalRequest({
        profileId: profile.id,
        postIds: [a, b],
        recipients: [{ name: "Carlos" }, { name: "Ana" }],
      });
      if (!r.ok) throw new Error(r.code);
      const [carlos, ana] = r.data.links.map((l) => tokenOf(l.url));
      const reqStatus = async () => (await testDb.select().from(approvalRequests))[0].status;
      const postStatus = async (id: string) =>
        (await testDb.select().from(posts).where(eq(posts.id, id)))[0].status;
      expect(await reqStatus()).toBe("open");

      await decide(carlos, { postId: a, decision: "approved" });
      expect(await postStatus(a)).toBe("approved");
      expect(await reqStatus()).toBe("partially_decided");

      // Ana can still decide the same item; her change request prevails
      const anaRes = await decide(ana, {
        postId: a,
        decision: "changes_requested",
        comment: "Cor",
      });
      expect(anaRes.status).toBe(200);
      expect(await postStatus(a)).toBe("changes_requested");
      expect(await reqStatus()).toBe("partially_decided");

      await decide(carlos, { postId: b, decision: "approved" });
      expect(await reqStatus()).toBe("decided");
      // Carlos decided everything: his link is consumed, Ana's is still alive
      expect((await getPublicApproval(carlos)).linkState).toBe("used");
      const view = await getPublicApproval(ana);
      expect(view.linkState).toBe("active");
      expect(view.recipientName).toBe("Ana");
      expect(view.items.find((i) => i.postId === a)?.decision?.decision).toBe("changes_requested");
      expect(view.items.find((i) => i.postId === b)?.decision).toBeNull();
      // original links settle nothing: Ana's own decision is not "locked" on her link
      expect(view.items.every((i) => !i.locked)).toBe(true);
    });

    it("original links: another recipient's decision does not settle the item; link is consumed only after all items", async () => {
      const { profile, mkPost } = await seed();
      const [a, b] = [await mkPost(), await mkPost()];
      const r = await createApprovalRequest({
        profileId: profile.id,
        postIds: [a, b],
        recipients: [{ name: "Carlos" }, { name: "Ana" }],
      });
      if (!r.ok) throw new Error(r.code);
      const [carlos, ana] = r.data.links.map((l) => tokenOf(l.url));

      expect((await decide(carlos, { postId: a, decision: "approved" })).status).toBe(200);
      const view = await getPublicApproval(ana);
      expect(view.items.find((i) => i.postId === a)).toMatchObject({
        decision: null,
        locked: false,
      });

      expect((await decide(ana, { postId: a, decision: "approved" })).status).toBe(200);
      expect((await getPublicApproval(ana)).linkState).toBe("active");
      expect((await decide(ana, { postId: b, decision: "approved" })).status).toBe(200);
      expect((await getPublicApproval(ana)).linkState).toBe("used");
      expect((await getPublicApproval(carlos)).linkState).toBe("active");
    });

    it("records opens with ip/user agent for active and used links; used view is a read-only receipt", async () => {
      const { profile, mkPost } = await seed();
      const a = await mkPost();
      const r = await send(profile.id, [a]);
      const v1 = await getPublicApproval(r.token, {
        recordOpen: true,
        ip: "198.51.100.9",
        userAgent: "Mozilla/test",
      });
      expect(v1).toMatchObject({ linkState: "active", readOnly: false, mode: "personal" });
      expect(v1.recipientName).toBe("Carlos");
      await getPublicApproval(r.token); // no recordOpen: not counted
      await decide(r.token, { postId: a, decision: "changes_requested", comment: "Trocar" });

      const v2 = await getPublicApproval(r.token, {
        recordOpen: true,
        ip: null,
        userAgent: "Mozilla/receipt",
      });
      expect(v2).toMatchObject({ linkState: "used", readOnly: true, recipientName: "Carlos" });
      expect(v2.items).toHaveLength(1);
      expect(v2.items[0].decision).toMatchObject({
        decision: "changes_requested",
        comment: "Trocar",
      });
      expect(JSON.stringify(v2)).not.toContain("SEGREDO");
      expect(JSON.stringify(v2)).not.toContain("WhatsApp (11)");

      const opens = await testDb.select().from(approvalLinkOpens);
      expect(opens).toHaveLength(2);
      const active = opens.find((o) => o.linkState === "active");
      const used = opens.find((o) => o.linkState === "used");
      expect(active).toMatchObject({ ip: "198.51.100.9", userAgent: "Mozilla/test" });
      expect(used).toMatchObject({ ip: null, userAgent: "Mozilla/receipt" });
      const [l] = await testDb.select().from(approvalLinks);
      expect(l.openedCount).toBe(2);

      const list = await listApprovalRequests(profile.id);
      expect(list[0].links[0].opens).toHaveLength(2);
      expect(list[0].links[0].opens[0].openedAt.getTime()).toBeGreaterThanOrEqual(
        list[0].links[0].opens[1].openedAt.getTime(),
      );
      expect(list[0].links[0].usedReason).toBe("decided");
      expect(list[0].links[0].decisions).toEqual([
        expect.objectContaining({ postId: a, decision: "changes_requested" }),
      ]);
    });

    it("expired link is 410 link_expired; state precedence is revoked, used, expired", async () => {
      const { profile, mkPost } = await seed();
      const a = await mkPost();
      const r = await send(profile.id, [a]);
      await testDb
        .update(approvalLinks)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(approvalLinks.id, r.linkId));
      const res = await decide(r.token, { postId: a, decision: "approved" });
      expect(res.status).toBe(410);
      expect(await res.json()).toMatchObject({ code: "link_expired" });
      await testDb.update(approvalLinks).set({ usedAt: new Date() });
      expect((await getPublicApproval(r.token)).linkState).toBe("used");
      await testDb.update(approvalLinks).set({ revokedAt: new Date() });
      expect((await getPublicApproval(r.token)).linkState).toBe("revoked");
    });

    it("the unique index blocks a second decision of the same link on the same item", async () => {
      const { profile, mkPost } = await seed();
      const a = await mkPost();
      const r = await send(profile.id, [a]);
      await decide(r.token, { postId: a, decision: "approved" });
      await expect(
        testDb.insert(approvalDecisions).values({
          requestId: r.requestId,
          postId: a,
          linkId: r.linkId,
          decision: "changes_requested",
          comment: "x",
        }),
      ).rejects.toThrow();
    });
  });
});
