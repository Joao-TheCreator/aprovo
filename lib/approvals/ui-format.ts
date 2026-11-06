/** Client-safe formatting helpers for the approval UI (pt-BR, São Paulo time for stable SSR/CSR output). */
const TZ = "America/Sao_Paulo";

export function formatDateBr(d: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TZ,
  }).format(new Date(d));
}

export function formatDayMonth(d: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ }).format(
    new Date(d),
  );
}

export function formatTimeBr(d: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(d));
}

/** "06/11/2026 às 14:32" */
export function formatDateTimeBr(d: Date | string): string {
  return `${formatDateBr(d)} às ${formatTimeBr(d)}`;
}

/** First chars of a caption for toasts and rows. */
export function shortCaption(caption: string | null | undefined, max = 40): string {
  const text = (caption ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "Sem legenda";
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
