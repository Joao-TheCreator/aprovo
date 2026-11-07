/**
 * Shared contract for Phase 4 (approval links, public page, decisions, realtime).
 */
import { z } from "zod";
import type { ActionResult, FeedItem, GridRatio, PostStatus } from "@/lib/profiles/contracts";
import type { PostMediaItem, PostKind } from "@/lib/posts/contracts";

export const LINK_TTL_DAYS = 30;

export const createApprovalRequestSchema = z.object({
  profileId: z.string().uuid(),
  postIds: z.array(z.string().uuid()).min(1).max(50),
  title: z.string().trim().max(120).optional(),
  message: z.string().trim().max(1000).optional(),
  /** Label of the first link, e.g. "WhatsApp do Carlos". */
  label: z.string().trim().max(80).optional(),
});
export type CreateApprovalRequestInput = z.infer<typeof createApprovalRequestSchema>;

export type ApprovalLinkIssued = {
  requestId: string;
  linkId: string;
  /** Full URL `${APP_URL}/a/<token>`; the clear token is returned once and never stored. */
  url: string;
  expiresAt: Date;
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

export type DecideResult = ActionResult<{ status: PostStatus; decision: DecisionRecord }>;

export type LinkState = "active" | "expired" | "revoked" | "not_found";

/** Everything the public page /a/[token] needs. Never includes internal notes. */
export type PublicApprovalView = {
  linkState: LinkState;
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
    /** Label of the link used for the last decision, when any. */
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
      at: string;
    }
  | { type: "link.opened"; profileId: string; linkId: string; at: string };

export const APPROVAL_ERROR_MESSAGES: Record<string, string> = {
  no_ready_media: "Alguma publicação ainda está processando a mídia. Aguarde para enviar.",
  published_locked: "Publicações já publicadas no Instagram não podem ser alteradas.",
  invalid_status: "Só rascunhos e publicações com ajustes solicitados podem ser enviados.",
  link_inactive: "Este link não está mais ativo. Peça um novo link ao seu social media.",
  already_decided: "Esta publicação já foi decidida por este link.",
  rate_limited: "Muitas tentativas. Aguarde um minuto e tente de novo.",
  not_found: "Envio não encontrado.",
};
