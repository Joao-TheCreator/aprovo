import { pgEnum } from "drizzle-orm/pg-core";

export const memberRole = pgEnum("member_role", ["owner", "editor"]);
export const accountType = pgEnum("account_type", ["business", "creator", "personal", "unknown"]);
export const importSource = pgEnum("import_source", ["graph_api", "fallback", "manual"]);
export const importStatus = pgEnum("import_status", ["idle", "importing", "ok", "failed"]);
export const gridRatio = pgEnum("grid_ratio", ["1:1", "3:4"]);
export const importedMediaType = pgEnum("imported_media_type", ["image", "carousel", "video"]);
export const postKind = pgEnum("post_kind", ["post", "video"]);
export const postStatus = pgEnum("post_status", [
  "draft",
  "pending_approval",
  "approved",
  "changes_requested",
  "scheduled",
  "published",
  "publish_failed",
]);
export const publicationStatus = pgEnum("publication_status", [
  "scheduled",
  "publishing",
  "published",
  "failed",
  "cancelled",
]);
export const assetKind = pgEnum("asset_kind", ["image", "video"]);
export const assetStatus = pgEnum("asset_status", ["uploading", "processing", "ready", "failed"]);
export const approvalRequestStatus = pgEnum("approval_request_status", [
  "open",
  "partially_decided",
  "decided",
  "revoked",
]);
export const approvalDecisionValue = pgEnum("approval_decision_value", [
  "approved",
  "changes_requested",
]);
export const connectionStatus = pgEnum("connection_status", [
  "active",
  "expired",
  "revoked",
  "not_professional",
  "missing_scope",
]);
