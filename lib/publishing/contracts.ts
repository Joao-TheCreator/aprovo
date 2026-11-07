/**
 * Contracts for scheduled Instagram publication (docs/12 section 2).
 * Pure module: safe to import from client and server code.
 */
import { z } from "zod";

export type PublicationStatus = "scheduled" | "publishing" | "published" | "failed" | "cancelled";

/** Internal error codes stored in `publications.last_error_code` (docs/12 sections 2.1 and 4.5). */
export type PublicationErrorCode =
  | "token_expired"
  | "not_professional"
  | "missing_scope"
  | "media_rejected"
  | "daily_limit"
  | "rate_limited"
  | "container_error"
  | "network"
  | "unknown";

/** One friendly line per code. Never include tokens, signed URLs or raw provider bodies. */
export const PUBLICATION_ERROR_MESSAGES: Record<PublicationErrorCode, string> = {
  token_expired: "A conexão com o Instagram expirou. Reconecte a conta para publicar.",
  not_professional: "A conta precisa ser profissional (Business ou Creator) para publicar.",
  missing_scope: "Falta a permissão de publicar. Reconecte a conta e autorize 'Publicar conteúdo'.",
  media_rejected: "O Instagram recusou a mídia. Confira o formato, o tamanho e a proporção.",
  daily_limit: "O limite diário de publicações do Instagram foi atingido. Tente amanhã.",
  rate_limited: "O Instagram pediu para aguardar um pouco. Vamos tentar de novo em breve.",
  container_error: "O Instagram não conseguiu processar a mídia. Vamos tentar de novo.",
  network: "Não foi possível falar com o Instagram agora. Vamos tentar de novo.",
  unknown: "Não foi possível publicar. Tente novamente ou fale com o suporte.",
};

let cachedZones: ReadonlySet<string> | null | undefined;

function supportedZones(): ReadonlySet<string> | null {
  if (cachedZones !== undefined) return cachedZones;
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf;
    cachedZones = typeof fn === "function" ? new Set(fn.call(Intl, "timeZone")) : null;
  } catch {
    cachedZones = null;
  }
  return cachedZones;
}

const IANA_FALLBACK = /^[A-Za-z]+(?:[_+-]?[A-Za-z0-9]+)*(?:\/[A-Za-z0-9_+-]+){0,2}$/;

/** True when `tz` is a known IANA time zone (falls back to a shape check if the runtime cannot list zones). */
export function isValidTimezone(tz: string): boolean {
  if (tz === "UTC") return true;
  const zones = supportedZones();
  if (zones?.has(tz)) return true;
  if (!IANA_FALLBACK.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidTimezone, "Fuso horário inválido.");

const scheduledAtSchema = z.string().datetime({ offset: true });

export const schedulePublicationSchema = z.object({
  postId: z.string().uuid(),
  /** ISO 8601 instant. */
  scheduledAt: scheduledAtSchema,
  timezone: timezoneSchema,
});
export type SchedulePublicationInput = z.infer<typeof schedulePublicationSchema>;

export const reschedulePublicationSchema = schedulePublicationSchema;
export type ReschedulePublicationInput = z.infer<typeof reschedulePublicationSchema>;

export const cancelPublicationSchema = z.object({ postId: z.string().uuid() });
export type CancelPublicationInput = z.infer<typeof cancelPublicationSchema>;
