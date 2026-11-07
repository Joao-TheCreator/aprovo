/**
 * Shared contract for Phase 1 (profile + feed). UI and backend both import from here.
 * Changing a signature here requires updating lib/profiles/actions.ts, queries.ts and the UI.
 */
import { z } from "zod";

/** Instagram username: 1–30 chars, letters, digits, dot, underscore. Leading @ is stripped. */
export const igUsernameSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/^@/, "").toLowerCase())
  .pipe(
    z.string().regex(/^[a-z0-9._]{1,30}$/, "Informe um @ válido (letras, números, ponto e _)."),
  );

export type ImportSource = "graph_api" | "fallback" | "manual";
export type AccountType = "business" | "creator" | "personal" | "unknown";
export type GridRatio = "1:1" | "3:4";
export type ImportedMediaType = "image" | "carousel" | "video";
export type PostStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "changes_requested"
  | "scheduled"
  | "published"
  | "publish_failed";

export type ConnectErrorCode =
  | "invalid_username"
  | "already_connected"
  | "not_found"
  | "private_or_personal"
  | "not_configured"
  | "rate_limited"
  | "provider_down";

export type ConnectProfileResult =
  | { ok: true; profileId: string; imported: number; source: ImportSource | "none" }
  | { ok: false; code: ConnectErrorCode; message: string; profileId?: string };

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; code: string; message: string };

/** Row for the profile list (Tela 00). */
export type ProfileListItem = {
  id: string;
  igUsername: string;
  displayName: string | null;
  avatarUrl: string | null;
  importStatus: "idle" | "importing" | "ok" | "failed";
  lastImportedAt: Date | null;
  counts: Record<PostStatus, number>;
};

/** One cell of the simulated grid. Imported posts come first by publishedAt desc after planned. */
export type FeedItem =
  | {
      kind: "imported";
      id: string;
      mediaType: ImportedMediaType;
      thumbUrl: string | null;
      permalink: string | null;
      caption: string | null;
      publishedAt: Date | null;
      isHidden: boolean;
    }
  | {
      kind: "planned";
      id: string;
      mediaType: ImportedMediaType;
      thumbUrl: string | null;
      status: PostStatus;
      position: number;
      caption: string | null;
      scheduledFor: Date | null;
      /** Phase 2: "post" (photo/carousel) or "video". */
      postKind: "post" | "video";
      /** Phase 2: crop of the first media inside the grid cell (fractions), null = center. */
      gridCrop: GridCrop | null;
      /** Phase 2: number of media items (badge for carousel). */
      mediaCount: number;
    };

/** Fractions of the source image: x,y = top-left, w,h = size. Aspect of w/h follows the grid ratio. */
export type GridCrop = { x: number; y: number; w: number; h: number };

export type ProfileFeed = {
  profile: {
    id: string;
    workspaceId: string;
    igUsername: string;
    displayName: string | null;
    biography: string | null;
    externalUrl: string | null;
    avatarUrl: string | null;
    postsCount: number | null;
    followersCount: number | null;
    followingCount: number | null;
    accountType: AccountType;
    importSource: ImportSource | null;
    importStatus: "idle" | "importing" | "ok" | "failed";
    importError: string | null;
    lastImportedAt: Date | null;
    gridRatio: GridRatio;
    /** Linked Instagram connection; null on manual profiles and after a disconnect. */
    connectionId: string | null;
    /** Health of the linked connection; null without one. Absent in the public approval view. */
    connectionStatus?:
      "active" | "expired" | "missing_scope" | "not_professional" | "revoked" | null;
  };
  items: FeedItem[];
  /** True when the Graph API is configured on the server (controls the "Atualizar feed" button). */
  canRefresh: boolean;
};

export const MANUAL_IMPORT_MAX_IMAGES = 12;

/** Manual import input: files are uploaded straight to storage; only asset ids reach the action. */
export const manualImportSchema = z.object({
  displayName: z.string().trim().max(80).optional(),
  biography: z.string().trim().max(300).optional(),
  externalUrl: z.string().trim().url().optional().or(z.literal("")),
  postsCount: z.number().int().min(0).optional(),
  followersCount: z.number().int().min(0).optional(),
  followingCount: z.number().int().min(0).optional(),
  avatarAssetId: z.string().uuid().optional(),
  imageAssetIds: z.array(z.string().uuid()).max(MANUAL_IMPORT_MAX_IMAGES),
});
export type ManualImportInput = z.input<typeof manualImportSchema>;

/** Shown when the connected token cannot use Business Discovery (legacy Instagram Login). */
export const NO_BUSINESS_DISCOVERY_MESSAGE =
  "Esta conexão só carrega o feed da própria conta conectada. Conecte a conta do cliente em Configurações ou importe manualmente.";

/** Import error of a graph_api profile whose Instagram connection was removed. */
export const ACCOUNT_DISCONNECTED_MESSAGE =
  "Conta do Instagram desconectada. Reconecte em Configurações.";

/** Human messages for Tela 01 error states. */
export const CONNECT_ERROR_MESSAGES: Record<ConnectErrorCode, string> = {
  invalid_username: "Informe um @ válido.",
  already_connected: "Este perfil já está conectado neste workspace.",
  not_found: "Não encontramos esse perfil. Confira o @ e tente de novo.",
  private_or_personal:
    "Não conseguimos carregar o feed automaticamente: a conta é privada ou pessoal. Você pode importar manualmente.",
  not_configured:
    "A importação automática ainda não está configurada. Você pode importar manualmente ou continuar sem feed.",
  rate_limited: "Muitas importações em pouco tempo. Tente novamente em alguns minutos.",
  provider_down: "O Instagram não respondeu. Tente de novo em instantes ou importe manualmente.",
};
