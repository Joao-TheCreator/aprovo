import type { ImportedMediaType } from "@/lib/profiles/contracts";

export type IgProfile = {
  username: string;
  displayName: string | null;
  biography: string | null;
  externalUrl: string | null;
  avatarUrl: string | null;
  followersCount: number | null;
  followingCount: number | null;
  mediaCount: number | null;
  /** First page of media returned together with the profile (Business Discovery does this). */
  media: IgMedia[];
  nextCursor: string | null;
};

export type IgMedia = {
  id: string;
  mediaType: ImportedMediaType;
  /** Best image URL to build the grid thumbnail (video: thumbnail; carousel: first child). */
  thumbnailUrl: string | null;
  permalink: string | null;
  caption: string | null;
  publishedAt: Date | null;
};

export type IgMediaPage = { media: IgMedia[]; nextCursor: string | null };

export type IgError =
  | { code: "not_found" }
  | { code: "private_or_personal" }
  | { code: "rate_limited"; retryAfterSec: number }
  | { code: "provider_down"; message: string }
  | { code: "not_configured" };

export interface InstagramProvider {
  fetchProfile(username: string): Promise<IgProfile | IgError>;
  fetchMedia(username: string, cursor?: string): Promise<IgMediaPage | IgError>;
}

export function isIgError(v: IgProfile | IgMediaPage | IgError): v is IgError {
  return "code" in v;
}
