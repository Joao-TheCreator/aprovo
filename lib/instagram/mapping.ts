import { z } from "zod";
import type { ImportedMediaType } from "@/lib/profiles/contracts";
import type { IgMedia, IgMediaPage, IgProfile } from "./types";

const child = z.object({
  media_type: z.string().optional(),
  media_url: z.string().optional(),
  thumbnail_url: z.string().optional(),
});

const media = z.object({
  id: z.string(),
  media_type: z.string(),
  media_url: z.string().optional(),
  thumbnail_url: z.string().optional(),
  permalink: z.string().optional(),
  caption: z.string().optional(),
  timestamp: z.string().optional(),
  children: z.object({ data: z.array(child) }).optional(),
});

export const businessDiscoverySchema = z.object({
  business_discovery: z.object({
    username: z.string(),
    name: z.string().optional(),
    biography: z.string().optional(),
    website: z.string().optional(),
    profile_picture_url: z.string().optional(),
    followers_count: z.number().optional(),
    follows_count: z.number().optional(),
    media_count: z.number().optional(),
    media: z
      .object({
        data: z.array(media),
        paging: z
          .object({ cursors: z.object({ after: z.string().optional() }).optional() })
          .optional(),
      })
      .optional(),
  }),
});

export type BusinessDiscoveryResponse = z.infer<typeof businessDiscoverySchema>;

const TYPE_MAP: Record<string, ImportedMediaType> = {
  IMAGE: "image",
  CAROUSEL_ALBUM: "carousel",
  VIDEO: "video",
};

export function mapMediaType(t: string): ImportedMediaType {
  return TYPE_MAP[t] ?? "image";
}

type RawMedia = z.infer<typeof media>;

export function mapMedia(m: RawMedia): IgMedia {
  const mediaType = mapMediaType(m.media_type);
  let thumbnailUrl: string | null;
  if (mediaType === "video") {
    thumbnailUrl = m.thumbnail_url ?? null;
  } else if (mediaType === "carousel") {
    const first = m.children?.data[0];
    thumbnailUrl =
      (first && (first.media_type === "VIDEO" ? first.thumbnail_url : first.media_url)) ??
      first?.thumbnail_url ??
      m.media_url ??
      null;
  } else {
    thumbnailUrl = m.media_url ?? m.thumbnail_url ?? null;
  }
  const ts = m.timestamp ? new Date(m.timestamp) : null;
  return {
    id: m.id,
    mediaType,
    thumbnailUrl,
    permalink: m.permalink ?? null,
    caption: m.caption ?? null,
    publishedAt: ts && !Number.isNaN(ts.getTime()) ? ts : null,
  };
}

export function mapMediaPage(bd: BusinessDiscoveryResponse["business_discovery"]): IgMediaPage {
  return {
    media: (bd.media?.data ?? []).map(mapMedia),
    nextCursor: bd.media?.paging?.cursors?.after ?? null,
  };
}

export function mapProfile(bd: BusinessDiscoveryResponse["business_discovery"]): IgProfile {
  const page = mapMediaPage(bd);
  return {
    username: bd.username.toLowerCase(),
    displayName: bd.name || null,
    biography: bd.biography || null,
    externalUrl: bd.website || null,
    avatarUrl: bd.profile_picture_url ?? null,
    followersCount: bd.followers_count ?? null,
    followingCount: bd.follows_count ?? null,
    mediaCount: bd.media_count ?? null,
    media: page.media,
    nextCursor: page.nextCursor,
  };
}
