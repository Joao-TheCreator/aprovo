/**
 * Classification of Graph API failures for connection health (docs/12 §4.5 and §7).
 * Pure functions: no I/O, no token handling. Messages never include access tokens.
 */

export type GraphErrorCode =
  "token_expired" | "not_professional" | "missing_scope" | "rate_limited" | "network" | "unknown";

export type ClassifiedGraphError = {
  code: GraphErrorCode;
  message: string;
  retryable: boolean;
};

/** Removes anything that looks like an access token from text that may be stored or logged. */
export function stripTokens(text: string): string {
  return text
    .replace(/access_token=[^&\s"']*/gi, "access_token=[redacted]")
    .replace(/\b(?:IG|EA)[A-Za-z0-9_-]{20,}/g, "[redacted]");
}

function readError(body: unknown): { code?: number; message: string } {
  if (typeof body !== "object" || body === null) return { message: "" };
  const err = (body as { error?: unknown }).error;
  if (typeof err !== "object" || err === null) return { message: "" };
  const { code, message } = err as { code?: unknown; message?: unknown };
  return {
    code: typeof code === "number" ? code : undefined,
    message: typeof message === "string" ? message : "",
  };
}

export function classifyGraphError(status: number, body: unknown): ClassifiedGraphError {
  const { code, message: raw } = readError(body);
  const msg = stripTokens(raw).slice(0, 200);
  const lower = msg.toLowerCase();
  const detail = (text: string) => (msg ? `${text}: ${msg}` : text);

  if (code === 190) {
    return {
      code: "token_expired",
      message: detail("Token expirado ou revogado"),
      retryable: false,
    };
  }
  // [confirmar] Meta does not document a stable code for "account is no longer professional".
  // We assume code 100 with a message mentioning business/professional/creator; verify against a
  // real response (convert a test account back to personal) and adjust.
  if (
    code === 100 &&
    (lower.includes("not a business") ||
      lower.includes("professional") ||
      lower.includes("creator"))
  ) {
    return {
      code: "not_professional",
      message: detail("Conta deixou de ser profissional"),
      retryable: false,
    };
  }
  if (code === 10 || code === 200 || lower.includes("permission")) {
    return { code: "missing_scope", message: detail("Permissão ausente"), retryable: false };
  }
  if (code === 4 || code === 17 || code === 32 || code === 613 || status === 429) {
    return { code: "rate_limited", message: detail("Limite de requisições"), retryable: true };
  }
  if (status === 0 || status >= 500) {
    return {
      code: "network",
      message: detail(`Instagram indisponível (HTTP ${status})`),
      retryable: true,
    };
  }
  return {
    code: "unknown",
    message: detail(`Erro desconhecido (HTTP ${status})`),
    retryable: true,
  };
}
