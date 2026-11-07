import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { id, timestamps } from "./columns";
import { publicationStatus } from "./enums";
import { instagramConnections } from "./instagram";
import { posts } from "./posts";
import { profiles } from "./profiles";

/** One scheduled/automatic Instagram publication per post (docs/12 section 2.1). */
export const publications = pgTable(
  "publications",
  {
    id: id(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    /** Redundant on purpose: workspace filtering goes through the profile. */
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    /** Account that will publish. Nullable so disconnecting an account keeps the history. */
    connectionId: uuid("connection_id").references(() => instagramConnections.id, {
      onDelete: "set null",
    }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    /** IANA name, only used to display "at 14:00 (Brasilia)". */
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    status: publicationStatus("status").notNull().default("scheduled"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    containerId: text("container_id"),
    containerCreatedAt: timestamp("container_created_at", { withTimezone: true }),
    igMediaId: text("ig_media_id"),
    permalink: text("permalink"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    /** Friendly message. Never contains tokens or signed URLs. */
    lastError: text("last_error"),
    /** Meta error body (without tokens), diagnostics only. */
    lastErrorRaw: jsonb("last_error_raw"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("publications_post_live_uniq")
      .on(t.postId)
      .where(sql`${t.status} in ('scheduled', 'publishing')`),
    index("publications_status_next_idx").on(t.status, t.nextAttemptAt),
    index("publications_profile_scheduled_idx").on(t.profileId, t.scheduledAt.desc()),
    uniqueIndex("publications_ig_media_uniq")
      .on(t.igMediaId)
      .where(sql`${t.igMediaId} is not null`),
  ],
);

export type Publication = typeof publications.$inferSelect;
