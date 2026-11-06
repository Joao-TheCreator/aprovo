import { GraphBusinessDiscoveryProvider } from "./graph";
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

export function isGraphConfigured(): boolean {
  return !!process.env.META_GRAPH_ACCESS_TOKEN && !!process.env.META_IG_USER_ID;
}

export function getInstagramProvider(): InstagramProvider {
  const token = process.env.META_GRAPH_ACCESS_TOKEN;
  const userId = process.env.META_IG_USER_ID;
  if (token && userId) return new GraphBusinessDiscoveryProvider(userId, token);
  return new NotConfiguredProvider();
}
