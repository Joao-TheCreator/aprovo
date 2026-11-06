/**
 * Read queries for profiles (Phase 1). STUB: the backend agent replaces this file.
 * All functions require an authenticated member; they call requireUser/requireWorkspace* inside.
 */
import type { ProfileFeed, ProfileListItem } from "./contracts";

export async function listProfiles(): Promise<ProfileListItem[]> {
  return [];
}

/** Returns null when the profile does not exist or the user is not a member (caller does notFound()). */
export async function getProfileFeed(_profileId: string): Promise<ProfileFeed | null> {
  return null;
}
