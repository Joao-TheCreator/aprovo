import { and, eq, inArray, isNull } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/db/client";
import {
  accounts,
  instagramConnections,
  mediaAssets,
  sessions,
  users,
  workspaceMembers,
  workspaces,
} from "@/db/schema";
import { getStorage, type Storage } from "@/lib/storage";

/**
 * Account deletion (docs/legal/exclusao-de-dados.md).
 * Transaction: owned workspaces are soft-deleted and emptied of members, the Instagram
 * connection (encrypted token) is removed, sessions/accounts are deleted and the user row is
 * anonymized. Profiles, posts and approval rows are KEPT (retention of approval records).
 * Afterwards, storage objects of those workspaces are removed best-effort.
 */
export async function deleteAccount(
  userId: string,
  opts: { db?: Database; storage?: Storage; deferPurge?: boolean } = {},
): Promise<{ workspaceIds: string[]; storageErrors: number }> {
  const db = opts.db ?? defaultDb;
  const workspaceIds = await db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.ownerId, userId), isNull(workspaces.deletedAt)));
    const ids = owned.map((w) => w.id);
    if (ids.length) {
      await tx.update(workspaces).set({ deletedAt: new Date() }).where(inArray(workspaces.id, ids));
      await tx.delete(workspaceMembers).where(inArray(workspaceMembers.workspaceId, ids));
      await tx.delete(instagramConnections).where(inArray(instagramConnections.workspaceId, ids));
    }
    await tx.delete(workspaceMembers).where(eq(workspaceMembers.userId, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(accounts).where(eq(accounts.userId, userId));
    await tx
      .update(users)
      .set({
        email: `deleted+${userId}@anon.aprovo`,
        name: null,
        image: null,
        emailVerified: null,
      })
      .where(eq(users.id, userId));
    return ids;
  });

  // Storage purge can take long (one DELETE per object); callers on serverless defer it
  // with next/server `after()` so the request answers at once (see deleteAccountAction).
  if (opts.deferPurge) return { workspaceIds, storageErrors: 0 };
  const storageErrors = await purgeWorkspaceMedia(db, workspaceIds, opts.storage);
  return { workspaceIds, storageErrors };
}

export async function purgeWorkspaceMedia(
  db: Database,
  workspaceIds: string[],
  storage: Storage = getStorage(),
): Promise<number> {
  if (!workspaceIds.length) return 0;
  let errors = 0;
  try {
    const assets = await db
      .select()
      .from(mediaAssets)
      .where(inArray(mediaAssets.workspaceId, workspaceIds));
    for (const a of assets) {
      const keys = [a.originalPath, a.previewPath, a.thumbPath, a.posterPath].filter(
        (k): k is string => !!k,
      );
      let ok = true;
      for (const key of keys) {
        try {
          await storage.deleteObject(key);
        } catch {
          ok = false;
          errors++;
        }
      }
      // original_path is NOT NULL: empty string marks "removed". Failed deletes keep their paths.
      if (ok) {
        await db
          .update(mediaAssets)
          .set({
            originalPath: "",
            previewPath: null,
            thumbPath: null,
            posterPath: null,
            status: "failed",
          })
          .where(eq(mediaAssets.id, a.id));
      }
    }
  } catch {
    errors++;
  }
  return errors;
}
