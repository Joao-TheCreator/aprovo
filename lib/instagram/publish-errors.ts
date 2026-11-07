/**
 * Classification of Content Publishing API failures (docs/12 §4.5).
 * Pure functions: no I/O. Messages are fixed pt-BR text and never echo the Meta message,
 * because that text can contain media URLs or tokens.
 */
import { stripTokens } from "./errors";

export type PublishErrorCode =
  | "token_expired"
  | "not_professional"
  | "missing_scope"
  | "media_rejected"
  | "daily_limit"
  | "rate_limited"
  | "container_error"
  | "network"
  | "unknown"
  | "media_not_ready";

export type PublishError = {
  code: PublishErrorCode;
  retryable: boolean;
  /** pt-BR, safe to show to the user: no token, no URL. */
  message: string;
  /** Meta body with tokens and signed URLs stripped. */
  raw: unknown | null;
  httpStatus: number;
};

/** Strips tokens and signed/query URLs from a single string. */
function sanitizeString(text: string): string {
  return stripTokens(text)
    .replace(/X-Amz-[A-Za-z-]+=[^&\s"']*/gi, "X-Amz-[redacted]")
    .replace(/https?:\/\/[^\s"']*\?[^\s"']*/gi, "[url]");
}

/** Deep copy of a Meta body with tokens and signed URLs removed from every string. */
export function sanitizeRaw(body: unknown): unknown {
  if (typeof body === "string") return sanitizeString(body);
  if (Array.isArray(body)) return body.map(sanitizeRaw);
  if (typeof body === "object" && body !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      out[key] = /token/i.test(key) ? "[redacted]" : sanitizeRaw(value);
    }
    return out;
  }
  return body;
}

function readError(body: unknown): { code?: number; subcode?: number; message: string } {
  if (typeof body !== "object" || body === null) return { message: "" };
  const err = (body as { error?: unknown }).error;
  if (typeof err !== "object" || err === null) return { message: "" };
  const { code, error_subcode, message } = err as {
    code?: unknown;
    error_subcode?: unknown;
    message?: unknown;
  };
  return {
    code: typeof code === "number" ? code : undefined,
    subcode: typeof error_subcode === "number" ? error_subcode : undefined,
    message: typeof message === "string" ? message : "",
  };
}

export function classifyPublishError(status: number, body: unknown): PublishError {
  const { code, subcode, message } = readError(body);
  const lower = message.toLowerCase();
  const raw = body === undefined || body === null ? null : sanitizeRaw(body);
  const make = (errCode: PublishErrorCode, retryable: boolean, text: string): PublishError => ({
    code: errCode,
    retryable,
    message: text,
    raw,
    httpStatus: status,
  });

  if (code === 190) {
    return make(
      "token_expired",
      false,
      "Token do Instagram expirado ou revogado. Reconecte a conta.",
    );
  }
  // Media still processing: the caller treats it as IN_PROGRESS.
  if (code === 9007 || subcode === 2207027) {
    return make("media_not_ready", true, "A mídia ainda está sendo processada pelo Instagram.");
  }
  // [confirmar] Meta has no documented stable code for "account is no longer professional";
  // same heuristic as classifyGraphError (code 100 + message mentioning business/professional/creator).
  if (
    code === 100 &&
    (lower.includes("not a business") ||
      lower.includes("professional") ||
      lower.includes("creator"))
  ) {
    return make("not_professional", false, "A conta deixou de ser profissional no Instagram.");
  }
  if (code === 10 || code === 200) {
    return make(
      "missing_scope",
      false,
      "Permissão para publicar ausente. Reconecte o Instagram e autorize a publicação.",
    );
  }
  if (code === 9) {
    return make("daily_limit", true, "Limite diário de publicações do Instagram atingido.");
  }
  if (code === 4 || code === 17 || code === 32 || code === 613 || status === 429) {
    return make("rate_limited", true, "Limite de requisições do Instagram. Tentaremos novamente.");
  }
  // [confirmar] 36000-36999 and error_subcode 2207xxx cover invalid media; verify on real responses.
  if (
    (code !== undefined && code >= 36000 && code <= 36999) ||
    (subcode !== undefined && subcode >= 2207000 && subcode < 2208000)
  ) {
    return make(
      "media_rejected",
      false,
      "O Instagram recusou a mídia (formato, tamanho ou proporção).",
    );
  }
  if (status === 0 || status >= 500) {
    return make("network", true, `Instagram indisponível (HTTP ${status}).`);
  }
  return make("unknown", true, `Erro desconhecido ao publicar (HTTP ${status}).`);
}
