/**
 * Pure post state machine for scheduling and publishing (docs/12 section 2.2).
 * No I/O: callers persist the result inside their own transaction.
 */
import type { PostStatus } from "@/lib/profiles/contracts";

export type PostEvent =
  "schedule" | "cancel_schedule" | "published" | "publish_failed" | "reschedule" | "edit";

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: PostStatus,
    readonly event: PostEvent,
  ) {
    super(
      from === "published"
        ? "Publicações já publicadas no Instagram não podem ser alteradas."
        : `Esta ação não é permitida para uma publicação com status "${from}".`,
    );
    this.name = "InvalidTransitionError";
  }
}

const TRANSITIONS: Partial<Record<PostStatus, Partial<Record<PostEvent, PostStatus>>>> = {
  approved: { schedule: "scheduled" },
  scheduled: {
    cancel_schedule: "approved",
    published: "published",
    publish_failed: "publish_failed",
    // Editing a scheduled post cancels the schedule and requires a new approval.
    edit: "draft",
  },
  publish_failed: { reschedule: "scheduled" },
};

export function nextPostStatus(current: PostStatus, event: PostEvent): PostStatus {
  const next = TRANSITIONS[current]?.[event];
  if (!next) throw new InvalidTransitionError(current, event);
  return next;
}

/** `published` is terminal: the post is now a live Instagram post. */
export function isTerminalPostStatus(status: PostStatus): boolean {
  return status === "published";
}

export function canEditPost(status: PostStatus): boolean {
  return !isTerminalPostStatus(status);
}
