/**
 * Shared contract for Phase 4 (approval links, public page, decisions, realtime).
 */
import { z } from "zod";
import type { ActionResult, FeedItem, GridRatio, PostStatus } from "@/lib/profiles/contracts";
import type { PostMediaItem, PostKind } from "@/lib/posts/contracts";

export const LINK_TTL_DAYS = 30;

export const approvalLinkModeSchema = z.enum(["personal", "shared"]);
export type ApprovalLinkMode = z.infer<typeof approvalLinkModeSchema>;

export const recipientSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome de quem vai aprovar.").max(80),
  contact: z.string().trim().max(120).optional(),
});
export type RecipientInput = z.infer<typeof recipientSchema>;

export const createApprovalRequestSchema = z
  .object({
    profileId: z.string().uuid(),
    postIds: z.array(z.string().uuid()).min(1).max(50),
    title: z.string().trim().max(120).optional(),
    message: z.string().trim().max(1000).optional(),
    /** Free text describing the link (e.g. "grupo do cliente"); mainly useful for `shared` links. */
    label: z.string().trim().max(80).optional(),
    /** `personal`: one link per recipient (1..5). `shared`: one open link (recipients ignored). */
    recipients: z.array(recipientSchema).max(5).default([]),
    mode: approvalLinkModeSchema.default("personal"),
  })
  .refine((d) => d.mode === "shared" || d.recipients.length >= 1, {
    message: "Informe para quem é o link.",
    path: ["recipients"],
  });
export type CreateApprovalRequestInput = z.input<typeof createApprovalRequestSchema>;

export const issuePersonalLinkSchema = recipientSchema;

export type IssuedLink = {
  linkId: string;
  recipientName: string | null;
  mode: ApprovalLinkMode;
  /** Full URL `${APP_URL}/a/<token>`; the clear token is returned once and never stored. */
  url: string;
  expiresAt: Date;
};

export type ApprovalLinkIssued = {
  requestId: string;
  /** First link (backward compatible). */
  linkId: string;
  url: string;
  expiresAt: Date;
  links: IssuedLink[];
};
export type CreateApprovalRequestResult = ActionResult<ApprovalLinkIssued>;

export const decideSchema = z
  .object({
    postId: z.string().uuid(),
    decision: z.enum(["approved", "changes_requested"]),
    comment: z.string().trim().max(2000).optional(),
    approverName: z.string().trim().max(80).optional(),
  })
  .refine((d) => d.decision === "approved" || (d.comment && d.comment.length > 0), {
    message: "Descreva o ajuste que você precisa.",
    path: ["comment"],
  });
export type DecideInput = z.infer<typeof decideSchema>;

export type DecisionRecord = {
  decision: "approved" | "changes_requested";
  comment: string | null;
  approverName: string | null;
  decidedAt: Date;
};

export type DecideResult = ActionResult<{
  status: PostStatus;
  decision: DecisionRecord;
  /** True when this decision closed the (personal) link. */
  linkUsed: boolean;
}>;

export const decideManySchema = z.object({
  decisions: z.array(decideSchema).min(1).max(50),
  approverName: z.string().trim().max(80).optional(),
});
export type DecideManyInput = z.infer<typeof decideManySchema>;

export type DecideManyItemResult = {
  postId: string;
  /** True when this link had already decided the item (nothing was written). */
  skipped: boolean;
  status: PostStatus;
  decision: DecisionRecord;
};
export type DecideManyResult = ActionResult<{
  results: DecideManyItemResult[];
  linkUsed: boolean;
}>;

export type LinkState = "active" | "used" | "expired" | "revoked" | "not_found";

/** Everything the public page /a/[token] needs. Never includes internal notes. */
export type PublicApprovalView = {
  linkState: LinkState;
  /** Name given by the social media to a personal link; null for shared links. */
  recipientName: string | null;
  mode: ApprovalLinkMode;
  /** True for a used link: receipt only, no decision buttons. */
  readOnly: boolean;
  request: {
    id: string;
    title: string | null;
    message: string | null;
    createdAt: Date;
    expiresAt: Date;
    senderName: string;
  } | null;
  profile: {
    igUsername: string;
    displayName: string | null;
    avatarUrl: string | null;
    gridRatio: GridRatio;
  } | null;
  /** Full simulated feed (planned + imported) so the client sees the context; items of this request are flagged. */
  feedItems: FeedItem[];
  items: Array<{
    postId: string;
    kind: PostKind;
    status: PostStatus;
    caption: string | null;
    hashtags: string[];
    scheduledFor: Date | null;
    media: PostMediaItem[];
    decision: DecisionRecord | null;
  }>;
};

export type ApprovalLinkSummary = {
  id: string;
  label: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  openedCount: number;
  lastOpenedAt: Date | null;
  mode: ApprovalLinkMode;
  recipientName: string | null;
  /** Only for workspace members; never on the public page. */
  recipientContact: string | null;
  usedAt: Date | null;
  usedReason: "decided" | "superseded" | null;
  /** Last 20 opens, newest first. */
  opens: Array<{ openedAt: Date; ip: string | null; userAgent: string | null }>;
  decisions: Array<{
    postId: string;
    decision: "approved" | "changes_requested";
    decidedAt: Date;
  }>;
};

export type ApprovalRequestSummary = {
  id: string;
  title: string | null;
  message: string | null;
  status: "open" | "partially_decided" | "decided" | "revoked";
  createdAt: Date;
  profile: { id: string; igUsername: string; avatarUrl: string | null };
  counts: { items: number; approved: number; changes: number; pending: number };
  links: ApprovalLinkSummary[];
  items: Array<{
    postId: string;
    kind: PostKind;
    thumbUrl: string | null;
    caption: string | null;
    status: PostStatus;
    decision: DecisionRecord | null;
    /** Recipient name (personal link) or label (shared link) of the last decision, when any. */
    decidedViaLink: string | null;
  }>;
};

/** Realtime event pushed to the social media's app (SSE) or returned by polling. */
export type LiveEvent =
  | {
      type: "post.status";
      profileId: string;
      postId: string;
      status: PostStatus;
      decision: DecisionRecord | null;
      /** Recipient of the personal link that decided (client decisions only). */
      recipientName?: string | null;
      /** True when the decision closed the link (client decisions only). */
      linkUsed?: boolean;
      at: string;
    }
  | { type: "link.opened"; profileId: string; linkId: string; at: string };

export const APPROVAL_ERROR_MESSAGES: Record<string, string> = {
  no_ready_media: "Alguma publicação ainda está processando a mídia. Aguarde para enviar.",
  published_locked: "Publicações já publicadas no Instagram não podem ser alteradas.",
  invalid_status: "Só rascunhos e publicações com ajustes solicitados podem ser enviados.",
  link_used:
    "Este link já foi utilizado. Para uma nova aprovação, peça um link novo ao seu social media.",
  link_expired: "Este link expirou. Peça um novo link ao seu social media.",
  link_revoked: "Este link foi cancelado pelo seu social media.",
  link_inactive: "Este link não está mais ativo. Peça um novo link ao seu social media.",
  already_decided: "Esta publicação já foi decidida por este link.",
  rate_limited: "Muitas tentativas. Aguarde um minuto e tente de novo.",
  not_found: "Envio não encontrado.",
};
