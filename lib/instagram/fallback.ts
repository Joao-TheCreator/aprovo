import type { IgError, IgMediaPage, IgProfile, InstagramProvider } from "./types";

/** True only when IG_FALLBACK_PROVIDER is set to something other than "none". Off by default. */
export function isFallbackEnabled(): boolean {
  const v = process.env.IG_FALLBACK_PROVIDER?.trim().toLowerCase();
  return !!v && v !== "none";
}

/**
 * PLACEHOLDER for a managed scraping provider (docs/07 section 6). Intentionally not implemented:
 * enabling it requires a product decision (ToS/LGPD). Always reports provider_down for now.
 */
export class ScrapingProvider implements InstagramProvider {
  private unavailable(): IgError {
    return {
      code: "provider_down",
      message: isFallbackEnabled()
        ? "Provedor de fallback ainda não implementado."
        : "Provedor de fallback desligado.",
    };
  }
  async fetchProfile(): Promise<IgProfile | IgError> {
    return this.unavailable();
  }
  async fetchMedia(): Promise<IgMediaPage | IgError> {
    return this.unavailable();
  }
}
