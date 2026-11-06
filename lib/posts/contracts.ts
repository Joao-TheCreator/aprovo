/**
 * Shared contract for Phase 2 publications (Telas 03, 04, 05).
 */
import { z } from "zod";
import type { ActionResult, GridCrop, GridRatio, PostStatus } from "@/lib/profiles/contracts";
import type { AssetUrls } from "@/lib/media/contracts";

export type PostKind = "post" | "video";

export const gridCropSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().gt(0).max(1),
  h: z.number().gt(0).max(1),
});

export const createPostSchema = z.object({
  profileId: z.string().uuid(),
  kind: z.enum(["post", "video"]),
  /** Ordered asset ids: 1 for video, 1..10 for post. All must be status "ready" or "processing". */
  assetIds: z.array(z.string().uuid()).min(1).max(10),
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

/** Hashtags are stored without "#", lowercase, unique, max 30. */
export const hashtagsSchema = z
  .array(
    z
      .string()
      .trim()
      .transform((t) => t.replace(/^#/, "").toLowerCase()),
  )
  .transform((arr) => Array.from(new Set(arr.filter((t) => /^[\p{L}\p{N}_]{1,100}$/u.test(t)))))
  .pipe(z.array(z.string()).max(30, "No máximo 30 hashtags."));

export const updatePostSchema = z.object({
  postId: z.string().uuid(),
  caption: z.string().max(2200, "A legenda tem no máximo 2.200 caracteres.").optional(),
  hashtags: hashtagsSchema.optional(),
  /** ISO string or null to clear. */
  scheduledFor: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().max(2000).optional(),
});
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const updatePostMediaSchema = z.object({
  postId: z.string().uuid(),
  /** Full desired list, in order. Items missing from it are removed from the post. */
  items: z
    .array(z.object({ assetId: z.string().uuid(), gridCrop: gridCropSchema.nullable().optional() }))
    .min(1)
    .max(10),
});
export type UpdatePostMediaInput = z.infer<typeof updatePostMediaSchema>;

export type PostMediaItem = AssetUrls & { sortOrder: number; gridCrop: GridCrop | null };

export type PostDetail = {
  id: string;
  profileId: string;
  kind: PostKind;
  status: PostStatus;
  position: number;
  caption: string | null;
  hashtags: string[];
  scheduledFor: Date | null;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  media: PostMediaItem[];
  profile: { id: string; igUsername: string; avatarUrl: string | null; gridRatio: GridRatio };
  /** Last client comment when status is changes_requested (Phase 4 fills it; null for now). */
  lastClientComment: string | null;
};

export type CreatePostResult = ActionResult<{ postId: string }>;

export const POST_ERROR_MESSAGES: Record<string, string> = {
  asset_not_ready: "Aguarde o processamento das mídias para continuar.",
  invalid_media_count: "Um post tem de 1 a 10 mídias; um vídeo tem exatamente 1.",
  not_found: "Publicação não encontrada.",
  forbidden: "Você não tem acesso a esta publicação.",
  stale_order: "A grade mudou. Atualize a página e tente de novo.",
};
