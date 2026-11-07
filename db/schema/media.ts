import { bigint, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { assetKind, assetStatus } from "./enums";
import { workspaces } from "./workspaces";

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: assetKind("kind").notNull(),
    originalPath: text("original_path").notNull(),
    previewPath: text("preview_path"),
    thumbPath: text("thumb_path"),
    posterPath: text("poster_path"),
    /** JPEG derivative for Instagram publishing (prefix publish/). */
    publishPath: text("publish_path"),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    mimeType: text("mime_type"),
    sha256: text("sha256"),
    status: assetStatus("status").notNull().default("uploading"),
    ...timestamps,
  },
  (t) => [index("media_assets_workspace_sha256_idx").on(t.workspaceId, t.sha256)],
);
