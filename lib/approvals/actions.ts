"use server";
/** STUB: the Phase 4 backend agent replaces this file. Keep the signatures. */
import type { ActionResult } from "@/lib/profiles/contracts";
import type { CreateApprovalRequestInput, CreateApprovalRequestResult } from "./contracts";

const NOT_IMPLEMENTED = { ok: false as const, code: "not_implemented", message: "Em construção." };

/** Sends posts for approval: creates the request, moves posts to pending_approval and issues the first link. */
export async function createApprovalRequest(
  _input: CreateApprovalRequestInput,
): Promise<CreateApprovalRequestResult> {
  return NOT_IMPLEMENTED;
}
/** Issues an additional link (e.g. for another contact) for an open request. */
export async function issueApprovalLink(
  _requestId: string,
  _label?: string,
): Promise<CreateApprovalRequestResult> {
  return NOT_IMPLEMENTED;
}
export async function revokeApprovalLink(_linkId: string): Promise<ActionResult> {
  return NOT_IMPLEMENTED;
}
/** Cancels an open request: posts still pending go back to draft. */
export async function cancelApprovalRequest(_requestId: string): Promise<ActionResult> {
  return NOT_IMPLEMENTED;
}
