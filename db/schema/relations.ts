import { relations } from "drizzle-orm";
import { accounts, sessions, users } from "./auth";
import {
  activityLog,
  approvalDecisions,
  approvalItems,
  approvalLinks,
  approvalRequests,
} from "./approvals";
import { mediaAssets } from "./media";
import { postMedia, posts } from "./posts";
import { importedPosts, profileSnapshots, profiles } from "./profiles";
import { workspaceMembers, workspaces } from "./workspaces";

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  memberships: many(workspaceMembers),
}));
export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));
export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, { fields: [workspaces.ownerId], references: [users.id] }),
  members: many(workspaceMembers),
  profiles: many(profiles),
  assets: many(mediaAssets),
}));
export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
}));

export const mediaAssetsRelations = relations(mediaAssets, ({ one }) => ({
  workspace: one(workspaces, { fields: [mediaAssets.workspaceId], references: [workspaces.id] }),
}));

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [profiles.workspaceId], references: [workspaces.id] }),
  avatar: one(mediaAssets, { fields: [profiles.avatarAssetId], references: [mediaAssets.id] }),
  snapshots: many(profileSnapshots),
  importedPosts: many(importedPosts),
  posts: many(posts),
  approvalRequests: many(approvalRequests),
  activity: many(activityLog),
}));
export const profileSnapshotsRelations = relations(profileSnapshots, ({ one }) => ({
  profile: one(profiles, { fields: [profileSnapshots.profileId], references: [profiles.id] }),
}));
export const importedPostsRelations = relations(importedPosts, ({ one }) => ({
  profile: one(profiles, { fields: [importedPosts.profileId], references: [profiles.id] }),
  thumb: one(mediaAssets, { fields: [importedPosts.thumbAssetId], references: [mediaAssets.id] }),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  profile: one(profiles, { fields: [posts.profileId], references: [profiles.id] }),
  author: one(users, { fields: [posts.createdBy], references: [users.id] }),
  media: many(postMedia),
  approvalItems: many(approvalItems),
  decisions: many(approvalDecisions),
}));
export const postMediaRelations = relations(postMedia, ({ one }) => ({
  post: one(posts, { fields: [postMedia.postId], references: [posts.id] }),
  asset: one(mediaAssets, { fields: [postMedia.assetId], references: [mediaAssets.id] }),
}));

export const approvalRequestsRelations = relations(approvalRequests, ({ one, many }) => ({
  profile: one(profiles, { fields: [approvalRequests.profileId], references: [profiles.id] }),
  items: many(approvalItems),
  links: many(approvalLinks),
  decisions: many(approvalDecisions),
}));
export const approvalItemsRelations = relations(approvalItems, ({ one }) => ({
  request: one(approvalRequests, {
    fields: [approvalItems.requestId],
    references: [approvalRequests.id],
  }),
  post: one(posts, { fields: [approvalItems.postId], references: [posts.id] }),
}));
export const approvalLinksRelations = relations(approvalLinks, ({ one, many }) => ({
  request: one(approvalRequests, {
    fields: [approvalLinks.requestId],
    references: [approvalRequests.id],
  }),
  decisions: many(approvalDecisions),
}));
export const approvalDecisionsRelations = relations(approvalDecisions, ({ one }) => ({
  request: one(approvalRequests, {
    fields: [approvalDecisions.requestId],
    references: [approvalRequests.id],
  }),
  post: one(posts, { fields: [approvalDecisions.postId], references: [posts.id] }),
  link: one(approvalLinks, { fields: [approvalDecisions.linkId], references: [approvalLinks.id] }),
}));
export const activityLogRelations = relations(activityLog, ({ one }) => ({
  profile: one(profiles, { fields: [activityLog.profileId], references: [profiles.id] }),
}));
