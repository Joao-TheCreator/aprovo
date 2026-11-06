import {
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { id, timestamps } from "./columns";
import { approvalDecisionValue, approvalRequestStatus } from "./enums";
import { posts } from "./posts";
import { profiles } from "./profiles";

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: id(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    title: text("title"),
    message: text("message"),
    status: approvalRequestStatus("status").notNull().default("open"),
    ...timestamps,
  },
  (t) => [index("approval_requests_profile_idx").on(t.profileId)],
);

export const approvalItems = pgTable(
  "approval_items",
  {
    requestId: uuid("request_id")
      .notNull()
      .references(() => approvalRequests.id, { onDelete: "cascade" }),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.requestId, t.postId] })],
);

export const approvalLinks = pgTable(
  "approval_links",
  {
    id: id(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => approvalRequests.id, { onDelete: "cascade" }),
    /** SHA-256 of the token. The clear token is never stored or logged. */
    tokenHash: text("token_hash").notNull(),
    label: text("label"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    openedCount: integer("opened_count").notNull().default(0),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("approval_links_token_hash_uniq").on(t.tokenHash)],
);

// Audit table: never updated or deleted by the app. No cascade from posts/requests on purpose.
export const approvalDecisions = pgTable(
  "approval_decisions",
  {
    id: id(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => approvalRequests.id),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id),
    linkId: uuid("link_id")
      .notNull()
      .references(() => approvalLinks.id),
    decision: approvalDecisionValue("decision").notNull(),
    comment: text("comment"),
    approverName: text("approver_name"),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (t) => [index("approval_decisions_post_decided_idx").on(t.postId, t.decidedAt.desc())],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: id(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** `user:<id>` or `link:<id>` */
    actor: text("actor").notNull(),
    event: text("event").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [index("activity_log_profile_created_idx").on(t.profileId, t.createdAt.desc())],
);
