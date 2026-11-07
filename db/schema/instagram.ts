import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { id, timestamps } from "./columns";
import { workspaces } from "./workspaces";

/** Instagram account connected through OAuth (Instagram Login). One per workspace for now. */
export const instagramConnections = pgTable(
  "instagram_connections",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    igUserId: text("ig_user_id").notNull(),
    username: text("username").notNull(),
    accountType: text("account_type"),
    profilePictureUrl: text("profile_picture_url"),
    /** AES-256-GCM envelope, see lib/crypto/secretbox.ts. Never store or log the clear token. */
    accessTokenEnc: text("access_token_enc").notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
    provider: text("provider").$type<ConnectionProvider>().notNull().default("instagram"),
    scopes: text("scopes").array().notNull().default([]),
    connectedBy: uuid("connected_by").references(() => users.id, { onDelete: "set null" }),
    lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("instagram_connections_workspace_uq").on(t.workspaceId)],
);

/** "instagram" = legacy Instagram Login (own feed only); "facebook" = Facebook Login (Business Discovery). */
export type ConnectionProvider = "instagram" | "facebook";

export type InstagramConnection = typeof instagramConnections.$inferSelect;
