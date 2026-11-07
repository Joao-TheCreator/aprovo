import { FACEBOOK_GRAPH_HOST, GraphBusinessDiscoveryProvider, INSTAGRAM_GRAPH_HOST } from "./graph";
import { decryptToken, getWorkspaceConnection, refreshIfNeeded } from "./oauth";
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
  return !!(await getWorkspaceConnection(workspaceId));
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

/** Order: workspace OAuth connection, then env bridge token, then not configured. */
export async function getInstagramProviderForWorkspace(
  workspaceId: string,
): Promise<InstagramProvider> {
  const stored = await getWorkspaceConnection(workspaceId);
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
