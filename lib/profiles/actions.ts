"use server";
/**
 * Server Actions for profiles (Phase 1). Signatures are the contract in ./contracts.
 * Every action authenticates and scopes by workspace.
 */
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { importedPosts, mediaAssets, profiles } from "@/db/schema";
import { logActivity } from "@/lib/activity/log";
import { getCurrentWorkspace, requireUser, requireWorkspaceForProfile } from "@/lib/auth/require";
import type { IgError } from "@/lib/instagram/types";
import {
  ACCOUNT_DISCONNECTED_MESSAGE,
  CONNECT_ERROR_MESSAGES,
  NO_BUSINESS_DISCOVERY_MESSAGE,
  MANUAL_IMPORT_MAX_IMAGES,
  igUsernameSchema,
  manualImportSchema,
  type ActionResult,
  type ConnectErrorCode,
  type ConnectProfileResult,
  type GridRatio,
  type ManualImportInput,
} from "./contracts";
import { IMPORT_CACHE_MS, importProfileFromProvider } from "./import";

function revalidate(profileId?: string) {
  revalidatePath("/perfis");
  if (profileId) revalidatePath(`/perfis/${profileId}`);
}

/** Generic message per code, except the specific "reconnect with Facebook" guidance. */
function igMessage(error: IgError): string {
  if (
    error.code === "provider_down" &&
    (error.message === NO_BUSINESS_DISCOVERY_MESSAGE ||
      error.message === ACCOUNT_DISCONNECTED_MESSAGE)
  ) {
    return error.message;
  }
  return CONNECT_ERROR_MESSAGES[error.code];
}

function fail(code: ConnectErrorCode, profileId?: string, message?: string): ConnectProfileResult {
  return {
    ok: false,
    code,
    message: message ?? CONNECT_ERROR_MESSAGES[code],
    ...(profileId ? { profileId } : {}),
  };
}

type Prepared =
  { ok: true; workspaceId: string; username: string } | { ok: false; result: ConnectProfileResult };

/** Shared validation: auth, username format, uniqueness within the workspace. */
async function prepareConnect(input: { username: string }): Promise<Prepared> {
  const user = await requireUser();
  const workspace = await getCurrentWorkspace(user.id!);
  if (!workspace) return { ok: false, result: fail("invalid_username") };
  const parsed = igUsernameSchema.safeParse(input.username);
  if (!parsed.success) return { ok: false, result: fail("invalid_username") };
  const username = parsed.data;
  const [dup] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.workspaceId, workspace.id), eq(profiles.igUsername, username)))
    .limit(1);
  if (dup) return { ok: false, result: fail("already_connected", dup.id) };
  return { ok: true, workspaceId: workspace.id, username };
}

/** Tela 01: connect by @ and try the automatic import. */
export async function connectProfile(input: { username: string }): Promise<ConnectProfileResult> {
  const prep = await prepareConnect(input);
  if (!prep.ok) return prep.result;
  const [created] = await db
    .insert(profiles)
    .values({ workspaceId: prep.workspaceId, igUsername: prep.username, importStatus: "importing" })
    .onConflictDoNothing()
    .returning({ id: profiles.id });
  if (!created) return fail("already_connected");

  const res = await importProfileFromProvider(created.id);
  revalidate(created.id);
  if (!res.ok) return fail(res.error.code, created.id, igMessage(res.error));
  return { ok: true, profileId: created.id, imported: res.imported, source: "graph_api" };
}

/** Tela 01 fallback: create the profile without any feed. */
export async function createProfileWithoutFeed(input: {
  username: string;
}): Promise<ConnectProfileResult> {
  const prep = await prepareConnect(input);
  if (!prep.ok) return prep.result;
  const [created] = await db
    .insert(profiles)
    .values({
      workspaceId: prep.workspaceId,
      igUsername: prep.username,
      importStatus: "idle",
      importSource: null,
    })
    .onConflictDoNothing()
    .returning({ id: profiles.id });
  if (!created) return fail("already_connected");
  revalidate(created.id);
  return { ok: true, profileId: created.id, imported: 0, source: "none" };
}

/**
 * Manual import: header fields + ids of assets already uploaded straight to storage (presigned PUT)
 * and processed (`ready`). No file ever goes through this Server Action.
 */
export async function manualImport(
  profileId: string,
  input: ManualImportInput,
): Promise<ActionResult<{ imported: number }>> {
  const { user, profile } = await requireWorkspaceForProfile(profileId);
  const workspaceId = profile.workspaceId;

  if (
    Array.isArray(input?.imageAssetIds) &&
    input.imageAssetIds.length > MANUAL_IMPORT_MAX_IMAGES
  ) {
    return {
      ok: false,
      code: "too_many_files",
      message: `Envie no máximo ${MANUAL_IMPORT_MAX_IMAGES} imagens.`,
    };
  }
  const parsed = manualImportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_input",
      message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }
  const { avatarAssetId, imageAssetIds, ...fields } = parsed.data;

  const wanted = [...new Set([...(avatarAssetId ? [avatarAssetId] : []), ...imageAssetIds])];
  if (new Set(imageAssetIds).size !== imageAssetIds.length) {
    return { ok: false, code: "invalid_input", message: "Há fotos repetidas na lista." };
  }
  if (wanted.length > 0) {
    const found = await db
      .select({ id: mediaAssets.id, kind: mediaAssets.kind, status: mediaAssets.status })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.workspaceId, workspaceId), inArray(mediaAssets.id, wanted)));
    if (found.length !== wanted.length || found.some((a) => a.kind !== "image")) {
      return { ok: false, code: "asset_not_found", message: "Alguma imagem não foi encontrada." };
    }
    if (found.some((a) => a.status !== "ready")) {
      return {
        ok: false,
        code: "asset_not_ready",
        message: "Algumas fotos ainda estão sendo processadas. Aguarde e tente de novo.",
      };
    }
  }

  const base = Date.now();
  const rows = imageAssetIds.map((assetId, i) => ({
    profileId,
    mediaType: "image" as const,
    igMediaId: `manual_${assetId}`,
    thumbAssetId: assetId,
    // first picture = most recent
    publishedAt: new Date(base - i * 60_000),
  }));

  await db.transaction(async (tx) => {
    await tx
      .update(profiles)
      .set({
        ...(fields.displayName !== undefined ? { displayName: fields.displayName } : {}),
        ...(fields.biography !== undefined ? { biography: fields.biography } : {}),
        ...(fields.externalUrl !== undefined ? { externalUrl: fields.externalUrl || null } : {}),
        ...(fields.postsCount !== undefined ? { postsCount: fields.postsCount } : {}),
        ...(fields.followersCount !== undefined ? { followersCount: fields.followersCount } : {}),
        ...(fields.followingCount !== undefined ? { followingCount: fields.followingCount } : {}),
        ...(avatarAssetId ? { avatarAssetId } : {}),
        importSource: "manual",
        importStatus: "ok",
        importError: null,
        lastImportedAt: new Date(),
      })
      .where(eq(profiles.id, profileId));
    if (rows.length) await tx.insert(importedPosts).values(rows);
    await logActivity(tx, {
      profileId,
      actor: `user:${user.id}`,
      event: "profile.manual_imported",
      payload: { imported: rows.length, avatar: Boolean(avatarAssetId) },
    });
  });

  revalidate(profileId);
  return { ok: true, data: { imported: rows.length } };
}

/** "Atualizar feed": re-run the automatic import (respects the 24 h cache unless force). */
export async function refreshProfile(
  profileId: string,
  opts: { force?: boolean } = {},
): Promise<ActionResult<{ imported: number }>> {
  const { profile } = await requireWorkspaceForProfile(profileId);
  if (
    !opts.force &&
    profile.importStatus === "ok" &&
    profile.lastImportedAt &&
    Date.now() - profile.lastImportedAt.getTime() < IMPORT_CACHE_MS
  ) {
    return { ok: true, data: { imported: 0 } };
  }
  const res = await importProfileFromProvider(profileId);
  revalidate(profileId);
  if (!res.ok) {
    const code = res.error.code;
    return { ok: false, code, message: igMessage(res.error) };
  }
  return { ok: true, data: { imported: res.imported } };
}

export async function updateGridRatio(profileId: string, ratio: GridRatio): Promise<ActionResult> {
  await requireWorkspaceForProfile(profileId);
  if (ratio !== "1:1" && ratio !== "3:4") {
    return { ok: false, code: "invalid_input", message: "Proporção inválida." };
  }
  await db.update(profiles).set({ gridRatio: ratio }).where(eq(profiles.id, profileId));
  revalidate(profileId);
  return { ok: true, data: undefined };
}

export async function setImportedPostHidden(
  importedPostId: string,
  hidden: boolean,
): Promise<ActionResult> {
  const [row] = await db
    .select({ profileId: importedPosts.profileId })
    .from(importedPosts)
    .where(eq(importedPosts.id, importedPostId))
    .limit(1);
  if (!row) return { ok: false, code: "not_found", message: "Publicação não encontrada." };
  await requireWorkspaceForProfile(row.profileId);
  await db
    .update(importedPosts)
    .set({ isHidden: hidden })
    .where(eq(importedPosts.id, importedPostId));
  revalidate(row.profileId);
  return { ok: true, data: undefined };
}

export async function removeProfile(profileId: string): Promise<ActionResult> {
  await requireWorkspaceForProfile(profileId, { roles: ["owner"] });
  await db.delete(profiles).where(eq(profiles.id, profileId));
  revalidate();
  return { ok: true, data: undefined };
}
