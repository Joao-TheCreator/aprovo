import { describe, expect, it } from "vitest";
import type { PostStatus } from "@/lib/profiles/contracts";
import {
  canEditPost,
  InvalidTransitionError,
  isTerminalPostStatus,
  nextPostStatus,
  type PostEvent,
} from "@/lib/publishing/state";

const STATUSES: PostStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "changes_requested",
  "scheduled",
  "published",
  "publish_failed",
];
const EVENTS: PostEvent[] = [
  "schedule",
  "cancel_schedule",
  "published",
  "publish_failed",
  "reschedule",
  "edit",
];

const VALID: [PostStatus, PostEvent, PostStatus][] = [
  ["approved", "schedule", "scheduled"],
  ["scheduled", "cancel_schedule", "approved"],
  ["scheduled", "published", "published"],
  ["scheduled", "publish_failed", "publish_failed"],
  ["publish_failed", "reschedule", "scheduled"],
  ["scheduled", "edit", "draft"],
];

describe("nextPostStatus", () => {
  it.each(VALID)("%s --%s--> %s", (from, event, to) => {
    expect(nextPostStatus(from, event)).toBe(to);
  });

  it("throws InvalidTransitionError for every other combination", () => {
    const valid = new Set(VALID.map(([f, e]) => `${f}:${e}`));
    for (const from of STATUSES) {
      for (const event of EVENTS) {
        if (valid.has(`${from}:${event}`)) continue;
        expect(() => nextPostStatus(from, event), `${from}:${event}`).toThrow(
          InvalidTransitionError,
        );
      }
    }
  });

  it("published is terminal with a pt-BR message", () => {
    for (const event of EVENTS) {
      expect(() => nextPostStatus("published", event)).toThrow(
        "Publicações já publicadas no Instagram não podem ser alteradas.",
      );
    }
  });

  it("explains other invalid transitions in pt-BR", () => {
    try {
      nextPostStatus("draft", "schedule");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidTransitionError);
      expect((e as Error).message).toMatch(/não é permitida/);
    }
  });
});

describe("status helpers", () => {
  it("only published is terminal and non-editable", () => {
    for (const s of STATUSES) {
      expect(isTerminalPostStatus(s)).toBe(s === "published");
      expect(canEditPost(s)).toBe(s !== "published");
    }
  });
});
