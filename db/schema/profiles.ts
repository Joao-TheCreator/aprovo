import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { citext, id, timestamps } from "./columns";
import { accountType, gridRatio, importSource, importStatus, importedMediaType } from "./enums";
import { instagramConnections } from "./instagram";
import { mediaAssets } from "./media";
import { workspaces } from "./workspaces";

export const profiles = pgTable(
  "profiles",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    igUsername: citext("ig_username").notNull(),
    displayName: text("display_name"),
    biography: text("biography"),
    avatarAssetId: uuid("avatar_asset_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    externalUrl: text("external_url"),
    postsCount: integer("posts_count"),
    followersCount: integer("followers_count"),
    followingCount: integer("following_count"),
    accountType: accountType("account_type").notNull().default("unknown"),
    importSource: importSource("import_source"),
    lastImportedAt: timestamp("last_imported_at", { withTimezone: true }),
    importStatus: importStatus("import_status").notNull().default("idle"),
    importError: text("import_error"),
    gridRatio: gridRatio("grid_ratio").notNull().default("3:4"),
    /** Connected Instagram account that feeds this profile (null = manual or legacy profile). */
    connectionId: uuid("connection_id").references(() => instagramConnections.id, {
      onDelete: "set null",
    }),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("profiles_workspace_ig_username_uniq").on(t.workspaceId, t.igUsername),
    index("profiles_connection_idx").on(t.connectionId),
  ],
);

export const profileSnapshots = pgTable(
  "profile_snapshots",
  {
    id: id(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    ...timestamps,
  },
  (t) => [index("profile_snapshots_profile_idx").on(t.profileId, t.capturedAt)],
);

export const importedPosts = pgTable(
  "imported_posts",
  {
    id: id(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    igMediaId: text("ig_media_id").notNull(),
    mediaType: importedMediaType("media_type").notNull(),
    thumbAssetId: uuid("thumb_asset_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    permalink: text("permalink"),
    caption: text("caption"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    isHidden: boolean("is_hidden").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("imported_posts_profile_ig_media_uniq").on(t.profileId, t.igMediaId)],
);
