import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityLog,
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

import { createApprovalRequest, reopenApprovalRequest } from "@/lib/approvals/actions";
import {
  getPublicApproval,
  listApprovalRequests,
  suggestReopenItems,
} from "@/lib/approvals/queries";
import { OPENS_RETENTION_DAYS, purgeLinkOpens } from "@/lib/approvals/purge";
import { resetRateLimits } from "@/lib/approvals/rate-limit";
import { lastRoundNote, roundSummaries, shortUserAgent } from "@/lib/approvals/ui-format";
import { POST as decideRoute } from "@/app/api/approval/[token]/decide/route";
import { POST as decideAllRoute } from "@/app/api/approval/[token]/decide-all/route";

async function seed() {
  process.env.APP_URL = "http://localhost:3000";
  const s = await seedWorkspace();
  mocks.user.id = s.user.id;
  let pos = 0;
  const mkPost = async () => {
    const [a] = await testDb
      .insert(mediaAssets)
      .values({
        workspaceId: s.ws.id,
        kind: "image",
        status: "ready",
        originalPath: "originals/x.jpg",
        thumbPath: "thumbs/x.webp",
      })
      .returning();
    const [p] = await testDb
      .insert(posts)
      .values({ profileId: s.profile.id, position: pos--, status: "draft", caption: "Post" })
      .returning();
    await testDb.insert(postMedia).values({ postId: p.id, assetId: a.id, sortOrder: 0 });
    return p.id;
  };
  return { ...s, mkPost };
}

const tokenOf = (url: string) => url.split("/a/")[1];

function decide(token: string, body: unknown) {
  return decideRoute(
    new NextRequest(`http://localhost/api/approval/${token}/decide`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "x-forwarded-for": "203.0.113.7", "user-agent": "vitest-ua" },
    }),
    { params: Promise.resolve({ token }) },
  );
}

function decideAll(token: string, body: unknown) {
  return decideAllRoute(
    new NextRequest(`http://localhost/api/approval/${token}/decide-all`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "x-forwarded-for": "203.0.113.7", "user-agent": "vitest-ua" },
    }),
    { params: Promise.resolve({ token }) },
  );
}

async function send(profileId: string, postIds: string[]) {
  const r = await createApprovalRequest({
    profileId,
    postIds,
    recipients: [{ name: "Carlos", contact: "WhatsApp (11) 91234-5678" }],
  });
  if (!r.ok) throw new Error(r.code);
  return { ...r.data, token: tokenOf(r.data.url) };
}

async function reopen(requestId: string, postIds: string[], names: string[] = ["Carlos"]) {
  const r = await reopenApprovalRequest({
    requestId,
    postIds,
    recipients: names.map((name) => ({ name })),
  });
  if (!r.ok) throw new Error(`${r.code}: ${r.message}`);
  return r.data;
}

const postOf = async (id: string) => (await testDb.select().from(posts).where(eq(posts.id, id)))[0];
const requestOf = async (id: string) =>
  (await testDb.select().from(approvalRequests).where(eq(approvalRequests.id, id)))[0];
const linkOf = async (id: string) =>
  (await testDb.select().from(approvalLinks).where(eq(approvalLinks.id, id)))[0];

describe("reopen approval request (doc 13 section 4)", () => {
  beforeEach(() => {
    resetRateLimits();
    mocks.user.id = "";
  });

  it("reopens an item: supersedes the old active link, the new link decides, rounds are recorded", async () => {
    const { profile, mkPost } = await seed();
    const [a, b] = [await mkPost(), await mkPost()];
    const r = await send(profile.id, [a, b]);
    const sentBefore = (await postOf(a)).sentForApprovalAt!;

    // Carlos decides only item a: his link stays active (1 of 2)
    const first = await decide(r.token, {
      postId: a,
      decision: "changes_requested",
      comment: "Trocar a foto",
    });
    expect(first.status).toBe(200);
    expect((await postOf(a)).status).toBe("changes_requested");

    const out = await reopen(r.requestId, [a], [" carlos ", "Ana"]);
    expect(out.links).toHaveLength(2);
    expect(out.url).toBe(out.links[0].url);

    const pa = await postOf(a);
    expect(pa.status).toBe("pending_approval");
    expect(pa.approvedAt).toBeNull();
    expect(pa.sentForApprovalAt!.getTime()).toBeGreaterThan(sentBefore.getTime());
    // b was never decided: request is open again
    expect((await requestOf(r.requestId)).status).toBe("open");

    // old link: superseded by Carlos' new link (case-insensitive trim match)
    const old = await linkOf(r.linkId);
    expect(old.usedReason).toBe("superseded");
    expect(old.usedAt).not.toBeNull();
    expect(old.supersededByLinkId).toBe(out.links[0].linkId);
    const ana = await linkOf(out.links[1].linkId);
    expect(ana).toMatchObject({ recipientName: "Ana", mode: "personal", usedAt: null });

    const stale = await decide(r.token, { postId: b, decision: "approved" });
    expect(stale.status).toBe(410);
    expect(await stale.json()).toMatchObject({ code: "link_used" });

    // new link decides the reopened item and the post follows
    const fresh = await decide(tokenOf(out.links[0].url), { postId: a, decision: "approved" });
    expect(fresh.status).toBe(200);
    expect((await postOf(a)).status).toBe("approved");
    expect((await requestOf(r.requestId)).status).toBe("partially_decided");

    const events = await testDb.select().from(activityLog);
    const reopened = events.filter((e) => e.event === "approval.reopened");
    expect(reopened).toHaveLength(1);
    expect(reopened[0].payload).toMatchObject({
      requestId: r.requestId,
      postIds: [a],
      linkIds: out.links.map((l) => l.linkId),
    });
    expect(events.filter((e) => e.event === "approval.link_issued")).toHaveLength(2);
    expect(JSON.stringify(events)).not.toContain(tokenOf(out.links[0].url));

    // two rounds with the right recipients
    const [summary] = await listApprovalRequests(profile.id);
    expect(summary.rounds).toHaveLength(2);
    expect(summary.rounds[0].decisions).toEqual([
      expect.objectContaining({
        postId: a,
        recipientName: "Carlos",
        decision: "changes_requested",
        comment: "Trocar a foto",
      }),
    ]);
    expect(summary.rounds[1].decisions).toEqual([
      expect.objectContaining({ postId: a, recipientName: "carlos", decision: "approved" }),
    ]);
    // the item shows only its current-round decision
    expect(summary.items.find((i) => i.postId === a)?.decision?.decision).toBe("approved");
    expect(summary.items.find((i) => i.postId === a)?.decidedViaLink).toBe("carlos");
    expect(roundSummaries(summary.rounds)).toHaveLength(2);
    expect(lastRoundNote(summary.rounds, a)).toMatch(
      /^Rodada 2: aprovado por carlos em \d\d\/\d\d$/,
    );
  });

  it("reopening one of two decided items keeps the other decision and status", async () => {
    const { profile, mkPost } = await seed();
    const [a, b] = [await mkPost(), await mkPost()];
    const r = await send(profile.id, [a, b]);
    await decide(r.token, { postId: a, decision: "changes_requested", comment: "Ajustar" });
    await decide(r.token, { postId: b, decision: "approved" });
    expect((await requestOf(r.requestId)).status).toBe("decided");
    expect((await linkOf(r.linkId)).usedReason).toBe("decided");
    const bBefore = await postOf(b);

    const out = await reopen(r.requestId, [a]);
    expect((await requestOf(r.requestId)).status).toBe("partially_decided");
    const bAfter = await postOf(b);
    expect(bAfter.status).toBe("approved");
    expect(bAfter.sentForApprovalAt?.getTime()).toBe(bBefore.sentForApprovalAt?.getTime());
    expect((await postOf(a)).status).toBe("pending_approval");
    // an already consumed link is not rewritten
    expect((await linkOf(r.linkId)).usedReason).toBe("decided");

    const res = await decide(tokenOf(out.url), { postId: a, decision: "approved" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { status: "approved" } });
    expect((await requestOf(r.requestId)).status).toBe("decided");
    // history is insert-only: 3 decisions in total
    const [summary] = await listApprovalRequests(profile.id);
    expect(summary.rounds.flatMap((x) => x.decisions)).toHaveLength(3);
    expect(summary.rounds.map((x) => x.decisions.length)).toEqual([2, 1]);
  });

  it("partial reopen: settled items are locked on the new link, which is consumed after the reopened one", async () => {
    const { profile, mkPost } = await seed();
    const [a, b] = [await mkPost(), await mkPost()];
    const r = await send(profile.id, [a, b]);
    await decide(r.token, { postId: a, decision: "approved" });
    await decide(r.token, { postId: b, decision: "changes_requested", comment: "Ajustar" });
    expect((await linkOf(r.linkId)).usedReason).toBe("decided");

    const out = await reopen(r.requestId, [b]);
    const token = tokenOf(out.url);

    const view = await getPublicApproval(token);
    expect(view.linkState).toBe("active");
    const va = view.items.find((i) => i.postId === a)!;
    const vb = view.items.find((i) => i.postId === b)!;
    expect(va.locked).toBe(true);
    expect(va.decision).toMatchObject({ decision: "approved", approverName: "Carlos" });
    expect(vb.locked).toBe(false);
    expect(vb.decision).toBeNull();

    // the settled item cannot be decided again via the new link
    const again = await decide(token, { postId: a, decision: "changes_requested", comment: "x" });
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ code: "already_decided" });
    expect((await postOf(a)).status).toBe("approved");
    expect((await linkOf(out.links[0].linkId)).usedAt).toBeNull();

    const ok = await decide(token, { postId: b, decision: "approved" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ data: { status: "approved", linkUsed: true } });
    expect((await postOf(b)).status).toBe("approved");
    expect((await requestOf(r.requestId)).status).toBe("decided");
    const used = await linkOf(out.links[0].linkId);
    expect(used.usedAt).not.toBeNull();
    expect(used.usedReason).toBe("decided");

    const receipt = await getPublicApproval(token);
    expect(receipt).toMatchObject({ linkState: "used", readOnly: true });
    expect(receipt.items.find((i) => i.postId === a)?.locked).toBe(true);
    expect(receipt.items.find((i) => i.postId === b)?.locked).toBe(false);
    expect(receipt.items.find((i) => i.postId === b)?.decision?.decision).toBe("approved");
  });

  it("partial reopen: decide-all ignores settled items and consumes the link", async () => {
    const { profile, mkPost } = await seed();
    const [a, b] = [await mkPost(), await mkPost()];
    const r = await send(profile.id, [a, b]);
    await decide(r.token, { postId: a, decision: "approved" });
    await decide(r.token, { postId: b, decision: "changes_requested", comment: "Ajustar" });
    const out = await reopen(r.requestId, [b]);

    const res = await decideAll(tokenOf(out.url), {
      decisions: [
        { postId: a, decision: "changes_requested", comment: "nao" },
        { postId: b, decision: "approved" },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.linkUsed).toBe(true);
    const ra = body.data.results.find((x: { postId: string }) => x.postId === a);
    const rb = body.data.results.find((x: { postId: string }) => x.postId === b);
    expect(ra).toMatchObject({ skipped: true, decision: { decision: "approved" } });
    expect(rb).toMatchObject({ skipped: false, status: "approved" });
    expect((await postOf(a)).status).toBe("approved");
    expect((await postOf(b)).status).toBe("approved");
    expect((await linkOf(out.links[0].linkId)).usedAt).not.toBeNull();
    // only the reopened item got a new decision: 3 in total
    const [summary] = await listApprovalRequests(profile.id);
    expect(summary.rounds.flatMap((x) => x.decisions)).toHaveLength(3);
  });

  it("refuses scheduled posts and foreign items, validates input", async () => {
    const { profile, mkPost } = await seed();
    const [a, b] = [await mkPost(), await mkPost()];
    const r = await send(profile.id, [a]);
    await decide(r.token, { postId: a, decision: "approved" });
    await testDb.update(posts).set({ status: "scheduled" }).where(eq(posts.id, a));

    const res = await reopenApprovalRequest({
      requestId: r.requestId,
      postIds: [a],
      recipients: [{ name: "Carlos" }],
    });
    expect(res).toMatchObject({
      ok: false,
      code: "invalid_status",
      message: "Publicações agendadas ou publicadas não podem ser reabertas.",
    });
    expect((await testDb.select().from(approvalLinks)).length).toBe(1);
    expect((await postOf(a)).status).toBe("scheduled");

    expect(
      await reopenApprovalRequest({
        requestId: r.requestId,
        postIds: [b],
        recipients: [{ name: "Carlos" }],
      }),
    ).toMatchObject({ ok: false, code: "not_found" });
    expect(
      await reopenApprovalRequest({ requestId: r.requestId, postIds: [], recipients: [] }),
    ).toMatchObject({ ok: false, code: "invalid_input" });
    expect(
      await reopenApprovalRequest({
        requestId: r.requestId,
        postIds: [a],
        recipients: Array.from({ length: 6 }, (_, i) => ({ name: `P${i}` })),
      }),
    ).toMatchObject({ ok: false, code: "invalid_input" });
  });

  it("another workspace gets not_found and nothing changes", async () => {
    const { profile, mkPost } = await seed();
    const a = await mkPost();
    const r = await send(profile.id, [a]);
    await decide(r.token, { postId: a, decision: "changes_requested", comment: "x" });

    const other = await seedWorkspace("b@x.co");
    mocks.user.id = other.user.id;
    expect(
      await reopenApprovalRequest({
        requestId: r.requestId,
        postIds: [a],
        recipients: [{ name: "Carlos" }],
      }),
    ).toMatchObject({ ok: false, code: "not_found" });
    expect(await suggestReopenItems(r.requestId)).toEqual([]);
    expect((await postOf(a)).status).toBe("changes_requested");
    expect((await requestOf(r.requestId)).status).toBe("decided");
  });

  it("cancelled requests cannot be reopened", async () => {
    const { profile, mkPost } = await seed();
    const a = await mkPost();
    const r = await send(profile.id, [a]);
    await testDb
      .update(approvalRequests)
      .set({ status: "revoked" })
      .where(eq(approvalRequests.id, r.requestId));
    expect(
      await reopenApprovalRequest({
        requestId: r.requestId,
        postIds: [a],
        recipients: [{ name: "Carlos" }],
      }),
    ).toMatchObject({ ok: false, code: "request_revoked" });
  });

  it("suggestReopenItems: changes requested and edited after the decision, not the untouched approved one", async () => {
    const { profile, mkPost } = await seed();
    const [a, b, c] = [await mkPost(), await mkPost(), await mkPost()];
    const r = await send(profile.id, [a, b, c]);
    await decide(r.token, { postId: a, decision: "changes_requested", comment: "Ajustar" });
    await decide(r.token, { postId: b, decision: "approved" });
    await decide(r.token, { postId: c, decision: "approved" });
    // c is edited after being approved
    await testDb
      .update(posts)
      .set({ status: "draft", updatedAt: new Date(Date.now() + 60_000) })
      .where(eq(posts.id, c));

    expect((await suggestReopenItems(r.requestId)).sort()).toEqual([a, c].sort());
    const [summary] = await listApprovalRequests(profile.id);
    expect([...summary.reopenSuggestions].sort()).toEqual([a, c].sort());

    // published/scheduled are never suggested
    await testDb.update(posts).set({ status: "scheduled" }).where(eq(posts.id, a));
    expect(await suggestReopenItems(r.requestId)).toEqual([c]);
  });
});

describe("purgeLinkOpens", () => {
  it("deletes only opens older than the retention", async () => {
    const { profile, mkPost } = await seed();
    const a = await mkPost();
    const r = await send(profile.id, [a]);
    const now = new Date("2026-11-07T12:00:00Z");
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
    await testDb.insert(approvalLinkOpens).values([
      { linkId: r.linkId, openedAt: daysAgo(120), linkState: "active" },
      { linkId: r.linkId, openedAt: daysAgo(OPENS_RETENTION_DAYS + 1), linkState: "active" },
      { linkId: r.linkId, openedAt: daysAgo(OPENS_RETENTION_DAYS - 1), linkState: "active" },
      { linkId: r.linkId, openedAt: daysAgo(1), linkState: "used" },
    ]);
    expect(OPENS_RETENTION_DAYS).toBe(90);
    expect(await purgeLinkOpens(now)).toBe(2);
    const left = await testDb.select().from(approvalLinkOpens);
    expect(left).toHaveLength(2);
    expect(left.every((o) => o.openedAt >= daysAgo(90))).toBe(true);
    // the link itself is untouched
    expect(await linkOf(r.linkId)).toBeDefined();
    expect(await purgeLinkOpens(now, 0)).toBe(2);
  });
});

describe("shortUserAgent", () => {
  const cases: Array<[string | null, string]> = [
    [
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      "Chrome · Android",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Safari · iPhone",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1",
      "Chrome · iPhone",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
      "Edge · Windows",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Chrome · Windows",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
      "Firefox · Mac",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      "Safari · Mac",
    ],
    ["curl/8.0", "Navegador"],
    ["", "Navegador"],
    [null, "Navegador"],
  ];
  it.each(cases)("%s", (ua, expected) => {
    expect(shortUserAgent(ua)).toBe(expected);
  });
});
