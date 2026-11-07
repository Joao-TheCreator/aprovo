import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles, type InstagramConnection } from "@/db/schema";
import { logActivity } from "@/lib/activity/log";
import type { AccountType } from "./contracts";
import { importProfileFromProvider } from "./import";

/** Maps the Graph `account_type` of a connection to the profile enum. */
export function mapConnectionAccountType(raw: string | null): AccountType {
  switch (raw?.toUpperCase()) {
    case "BUSINESS":
      return "business";
    case "MEDIA_CREATOR":
    case "CREATOR":
      return "creator";
    default:
      return "unknown";
  }
}

export type ProfileFromConnection = { profileId: string; created: boolean };

/**
 * Finds (by workspace + ig_username, case-insensitive through citext) or creates the profile of
 * a connected account and links it through profiles.connection_id. A reconnect re-links and
 * restores a soft-deleted profile.
 */
export async function findOrCreateProfileForConnection(
  connection: Pick<InstagramConnection, "id" | "workspaceId" | "username" | "accountType">,
): Promise<ProfileFromConnection> {
  const accountType = mapConnectionAccountType(connection.accountType);
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: profiles.id,
        accountType: profiles.accountType,
        deletedAt: profiles.deletedAt,
      })
      .from(profiles)
      .where(
        and(
          eq(profiles.workspaceId, connection.workspaceId),
          // Explicit cast keeps citext (case-insensitive) semantics whatever the driver binds.
          sql`${profiles.igUsername} = ${connection.username}::citext`,
        ),
      )
      .limit(1);

    if (existing) {
      await tx
        .update(profiles)
        .set({
          connectionId: connection.id,
          // A soft-deleted profile with the same @ comes back (the unique index forces restore).
          ...(existing.deletedAt ? { deletedAt: null } : {}),
          ...(existing.accountType === "unknown" && accountType !== "unknown"
            ? { accountType }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, existing.id));
      if (existing.deletedAt) {
        await logActivity(tx, {
          profileId: existing.id,
          actor: "system:reconnect",
          event: "profile.restored",
          payload: { via: "instagram_connection", connectionId: connection.id },
        });
      }
      return { profileId: existing.id, created: false };
    }

    const [row] = await tx
      .insert(profiles)
      .values({
        workspaceId: connection.workspaceId,
        igUsername: connection.username,
        connectionId: connection.id,
        accountType,
        importSource: "graph_api",
        importStatus: "idle",
      })
      // A concurrent callback may have created it first: link to that one instead.
      .onConflictDoUpdate({
        target: [profiles.workspaceId, profiles.igUsername],
        set: { connectionId: connection.id, updatedAt: new Date() },
      })
      .returning({ id: profiles.id, createdAt: profiles.createdAt, updatedAt: profiles.updatedAt });
    return { profileId: row.id, created: row.createdAt.getTime() === row.updatedAt.getTime() };
  });
}

/**
 * OAuth completion step: ensures the profile exists and loads header + feed with the
 * connection's own token. An import failure never fails the connection: the profile keeps
 * import_status = failed and the user can retry.
 */
export async function createProfileAndImport(
  connection: Pick<InstagramConnection, "id" | "workspaceId" | "username" | "accountType">,
): Promise<ProfileFromConnection> {
  const result = await findOrCreateProfileForConnection(connection);
  try {
    const res = await importProfileFromProvider(result.profileId);
    if (!res.ok) console.warn(`[instagram] profile import failed code=${res.error.code}`);
  } catch (e) {
    console.error("[instagram] profile import threw:", e instanceof Error ? e.message : e);
  }
  return result;
}
