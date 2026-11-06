"use server";
/**
 * Server Actions for profiles (Phase 1). STUB: the backend agent replaces this file.
 * Signatures are the contract; keep them.
 */
import type { ActionResult, ConnectProfileResult, GridRatio } from "./contracts";

const NOT_IMPLEMENTED = { ok: false as const, code: "not_implemented", message: "Em construção." };

/** Tela 01: connect by @ and try the automatic import. */
export async function connectProfile(_input: { username: string }): Promise<ConnectProfileResult> {
  return { ok: false, code: "not_configured", message: "Em construção." };
}

/** Tela 01 fallback: create the profile without any feed. */
export async function createProfileWithoutFeed(_input: {
  username: string;
}): Promise<ConnectProfileResult> {
  return { ok: false, code: "not_configured", message: "Em construção." };
}

/** Manual import: header fields + avatar file ("avatar") + up to 12 images ("images"). */
export async function manualImport(
  _profileId: string,
  _formData: FormData,
): Promise<ActionResult<{ imported: number }>> {
  return NOT_IMPLEMENTED;
}

/** "Atualizar feed": re-run the automatic import (respects the 24 h cache unless force). */
export async function refreshProfile(
  _profileId: string,
  _opts: { force?: boolean } = {},
): Promise<ActionResult<{ imported: number }>> {
  return NOT_IMPLEMENTED;
}

export async function updateGridRatio(
  _profileId: string,
  _ratio: GridRatio,
): Promise<ActionResult> {
  return NOT_IMPLEMENTED;
}

export async function setImportedPostHidden(
  _importedPostId: string,
  _hidden: boolean,
): Promise<ActionResult> {
  return NOT_IMPLEMENTED;
}

export async function removeProfile(_profileId: string): Promise<ActionResult> {
  return NOT_IMPLEMENTED;
}
