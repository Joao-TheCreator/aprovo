/** STUB: the Phase 4 backend agent replaces this file. Keep the signatures. */
import type { ApprovalRequestSummary, PublicApprovalView } from "./contracts";

/** Public, token-based (server only). Increments opened_count when `recordOpen` is true. */
export async function getPublicApproval(
  _token: string,
  _opts: { recordOpen?: boolean } = {},
): Promise<PublicApprovalView> {
  return { linkState: "not_found", request: null, profile: null, feedItems: [], items: [] };
}
/** Requests of one profile (or of all profiles in the workspace when profileId is omitted), newest first. */
export async function listApprovalRequests(_profileId?: string): Promise<ApprovalRequestSummary[]> {
  return [];
}
export async function getApprovalRequest(
  _requestId: string,
): Promise<ApprovalRequestSummary | null> {
  return null;
}
