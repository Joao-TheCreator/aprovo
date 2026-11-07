import { FACEBOOK_GRAPH_HOST, GraphBusinessDiscoveryProvider, INSTAGRAM_GRAPH_HOST } from "./graph";
import { decryptToken, listConnections, refreshIfNeeded } from "./oauth";
import type { InstagramConnection } from "@/db/schema";
import type { IgError, IgMediaPage, IgProfile, InstagramProvider } from "./types";

export * from "./types";

class NotConfiguredProvider implements InstagramProvider {
  async fetchProfile(): Promise<IgProfile | IgError> {
    return { code: "not_configured" };
  }
  async fetchMedia(): Promise<IgMediaPage | IgError> {
    return { code: "not_configured" };
  }
}

/** Env-only check (manual bridge token). Use isGraphConfiguredForWorkspace to include OAuth. */
export function isGraphConfigured(): boolean {
  return !!process.env.META_GRAPH_ACCESS_TOKEN && !!process.env.META_IG_USER_ID;
}

export async function isGraphConfiguredForWorkspace(workspaceId: string): Promise<boolean> {
  if (isGraphConfigured()) return true;
  return (await listConnections(workspaceId)).length > 0;
}

function envProvider(): InstagramProvider {
  const token = process.env.META_GRAPH_ACCESS_TOKEN;
  const userId = process.env.META_IG_USER_ID;
  if (token && userId) {
    return new GraphBusinessDiscoveryProvider({
      host: FACEBOOK_GRAPH_HOST,
      igUserId: userId,
      accessToken: token,
    });
  }
  return new NotConfiguredProvider();
}

/** Env-only provider (no workspace); kept for tests and scripts. */
export function getInstagramProvider(): InstagramProvider {
  return envProvider();
}

/** Provider for one stored connection; falls back to the env bridge token if it is unusable. */
export async function getInstagramProviderForConnection(
  stored: InstagramConnection | null,
): Promise<InstagramProvider> {
  if (stored) {
    try {
      const connection = await refreshIfNeeded(stored);
      return new GraphBusinessDiscoveryProvider({
        host: connection.provider === "facebook" ? FACEBOOK_GRAPH_HOST : INSTAGRAM_GRAPH_HOST,
        igUserId: connection.igUserId,
        accessToken: decryptToken(connection),
        ownUsername: connection.username,
      });
    } catch (e) {
      console.error("[instagram] connection unusable:", e instanceof Error ? e.message : e);
    }
  }
  return envProvider();
}

/**
 * Provider for a profile of a workspace. Until T2 adds profiles.connection_id there is no
 * explicit link, so pick the workspace connection whose username matches the profile's
 * ig_username (case-insensitive), else the first (oldest) connection. Then env, then not configured.
 */
export async function getInstagramProviderForProfile(profile: {
  workspaceId: string;
  igUsername: string;
}): Promise<InstagramProvider> {
  const connections = await listConnections(profile.workspaceId);
  const wanted = profile.igUsername.toLowerCase();
  const chosen = connections.find((c) => c.username.toLowerCase() === wanted) ?? connections[0];
  return getInstagramProviderForConnection(chosen ?? null);
}
