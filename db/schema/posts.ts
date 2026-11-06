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
import { postKind, postStatus } from "./enums";
import { mediaAssets } from "./media";
import { profiles } from "./profiles";

export type GridCrop = { x: number; y: number; w: number; h: number };

export const posts = pgTable(
  "posts",
  {
    id: id(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    kind: postKind("kind").notNull().default("post"),
    status: postStatus("status").notNull().default("draft"),
    position: integer("position").notNull(),
    caption: text("caption"),
    hashtags: text("hashtags").array().notNull().default([]),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    sentForApprovalAt: timestamp("sent_for_approval_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("posts_profile_position_uniq").on(t.profileId, t.position)],
);

export const postMedia = pgTable(
  "post_media",
  {
    id: id(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => mediaAssets.id),
    sortOrder: integer("sort_order").notNull().default(0),
    gridCrop: jsonb("grid_crop").$type<GridCrop>(),
    ...timestamps,
  },
  (t) => [index("post_media_post_sort_idx").on(t.postId, t.sortOrder)],
);
