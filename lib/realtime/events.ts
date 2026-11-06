import type { DecisionRecord, LiveEvent } from "@/lib/approvals/contracts";
import type { PostStatus } from "@/lib/profiles/contracts";

export const EVENTS_CHANNEL = "aprovo_events";

/** Payload stored in activity_log for `approval.decided`; rich enough to rebuild the LiveEvent. */
export type DecidedPayload = {
  postId: string;
  requestId: string;
  status: PostStatus;
  decision: "approved" | "changes_requested";
  comment: string | null;
  approverName: string | null;
  decidedAt: string;
};

function toRecord(p: DecidedPayload): DecisionRecord {
  return {
    decision: p.decision,
    comment: p.comment ?? null,
    approverName: p.approverName ?? null,
    decidedAt: new Date(p.decidedAt),
  };
}

/** Converts an activity_log row into a LiveEvent (same shape the NOTIFY path emits), or null. */
export function toLiveEvent(row: {
  profileId: string;
  event: string;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}): LiveEvent | null {
  const at = row.createdAt.toISOString();
  const p = row.payload ?? {};
  if (row.event === "approval.decided" && typeof p.postId === "string") {
    const d = p as unknown as DecidedPayload;
    return {
      type: "post.status",
      profileId: row.profileId,
      postId: d.postId,
      status: d.status,
      decision: toRecord(d),
      at,
    };
  }
  if (row.event === "link.opened" && typeof p.linkId === "string") {
    return { type: "link.opened", profileId: row.profileId, linkId: p.linkId, at };
  }
  return null;
}
