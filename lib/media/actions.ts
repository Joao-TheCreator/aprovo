"use server";
/** STUB: the backend agent replaces this file. Keep the signatures. */
import type {
  CompleteUploadInput,
  CompleteUploadResult,
  RequestUploadInput,
  RequestUploadResult,
} from "./contracts";

export async function requestUpload(_input: RequestUploadInput): Promise<RequestUploadResult> {
  return { ok: false, code: "not_implemented", message: "Em construção." };
}

export async function completeUpload(_input: CompleteUploadInput): Promise<CompleteUploadResult> {
  return { ok: false, code: "not_implemented", message: "Em construção." };
}
