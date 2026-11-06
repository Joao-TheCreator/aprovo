"use server";
/**
 * Server Actions for profiles (Phase 1). Signatures are the contract in ./contracts.
 * Every action authenticates and scopes by workspace.
 */
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { importedPosts, profiles } from "@/db/schema";
import { getCurrentWorkspace, requireUser, requireWorkspaceForProfile } from "@/lib/auth/require";
import {
  CONNECT_ERROR_MESSAGES,
  igUsernameSchema,
  manualImportSchema,
  type ActionResult,
  type ConnectErrorCode,
  type ConnectProfileResult,
  type GridRatio,
} from "./contracts";
import { IMPORT_CACHE_MS, importProfileFromProvider } from "./import";
import { storeCachedImage } from "./thumbs";

const MAX_IMAGES = 12;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function revalidate(profileId?: string) {
  revalidatePath("/perfis");
  if (profileId) revalidatePath(`/perfis/${profileId}`);
}

function fail(code: ConnectErrorCode, profileId?: string): ConnectProfileResult {
  return {
    ok: false,
    code,
    message: CONNECT_ERROR_MESSAGES[code],
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
  if (!res.ok) return fail(res.error.code, created.id);
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

function isFile(v: FormDataEntryValue): v is File {
  return typeof v !== "string" && v.size > 0;
}

function validateFile(f: File): string | null {
  const name = f.name || "arquivo";
  const heicByExt = /\.(heic|heif)$/i.test(name);
  if (!ALLOWED_TYPES.has(f.type) && !heicByExt)
    return `${name}: formato não suportado (use JPG, PNG, WebP ou HEIC).`;
  if (f.size > MAX_FILE_BYTES) return `${name}: maior que 15 MB.`;
  return null;
}

function optionalString(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

/** Manual import: header fields + avatar file ("avatar") + up to 12 images ("images"). */
export async function manualImport(
  profileId: string,
  formData: FormData,
): Promise<ActionResult<{ imported: number }>> {
  const { profile } = await requireWorkspaceForProfile(profileId);
  const workspaceId = profile.workspaceId;

  const parsed = manualImportSchema.safeParse({
    displayName: optionalString(formData, "displayName"),
    biography: optionalString(formData, "biography"),
    externalUrl: optionalString(formData, "externalUrl"),
    postsCount: optionalString(formData, "postsCount"),
    followersCount: optionalString(formData, "followersCount"),
    followingCount: optionalString(formData, "followingCount"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid_input",
      message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }
  const fields = parsed.data;

  const images = formData.getAll("images").filter(isFile);
  if (images.length > MAX_IMAGES) {
    return { ok: false, code: "too_many_files", message: `Envie no máximo ${MAX_IMAGES} imagens.` };
  }
  const avatarEntry = formData.get("avatar");
  const avatarFile = avatarEntry && isFile(avatarEntry) ? avatarEntry : null;

  const errors: string[] = [];
  let avatarAssetId: string | null = null;
  if (avatarFile) {
    const err = validateFile(avatarFile);
    if (err) errors.push(err);
    else {
      const stored = await storeCachedImage(
        workspaceId,
        Buffer.from(await avatarFile.arrayBuffer()),
      );
      if (stored) avatarAssetId = stored.assetId;
      else errors.push(`${avatarFile.name}: não foi possível ler a imagem.`);
    }
  }

  const base = Date.now();
  const rows: { igMediaId: string; thumbAssetId: string; publishedAt: Date }[] = [];
  for (let i = 0; i < images.length; i++) {
    const file = images[i];
    const err = validateFile(file);
    if (err) {
      errors.push(err);
      continue;
    }
    const stored = await storeCachedImage(workspaceId, Buffer.from(await file.arrayBuffer()));
    if (!stored) {
      errors.push(
        `${file.name}: não foi possível ler a imagem (HEIC não suportado neste servidor?).`,
      );
      continue;
    }
    rows.push({
      igMediaId: `manual:${stored.assetId}`,
      thumbAssetId: stored.assetId,
      // first file = most recent
      publishedAt: new Date(base - i * 60_000),
    });
  }

  if (images.length > 0 && rows.length === 0) {
    return { ok: false, code: "no_valid_images", message: errors.join(" ") };
  }

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
    if (rows.length) {
      await tx
        .insert(importedPosts)
        .values(rows.map((r) => ({ profileId, mediaType: "image" as const, ...r })));
    }
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
    return { ok: false, code, message: CONNECT_ERROR_MESSAGES[code] };
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
