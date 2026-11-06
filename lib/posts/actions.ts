"use server";
/** STUB: the backend agent replaces this file. Keep the signatures. */
import type { ActionResult } from "@/lib/profiles/contracts";
import type {
  CreatePostInput,
  CreatePostResult,
  UpdatePostInput,
  UpdatePostMediaInput,
} from "./contracts";

const NOT_IMPLEMENTED = { ok: false as const, code: "not_implemented", message: "Em construção." };

export async function createPost(_input: CreatePostInput): Promise<CreatePostResult> {
  return NOT_IMPLEMENTED;
}
export async function updatePost(_input: UpdatePostInput): Promise<ActionResult> {
  return NOT_IMPLEMENTED;
}
export async function updatePostMedia(_input: UpdatePostMediaInput): Promise<ActionResult> {
  return NOT_IMPLEMENTED;
}
export async function archivePost(_postId: string, _archived: boolean): Promise<ActionResult> {
  return NOT_IMPLEMENTED;
}
export async function deletePost(_postId: string): Promise<ActionResult> {
  return NOT_IMPLEMENTED;
}
