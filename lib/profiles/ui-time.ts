/** Tiny pt-BR relative time ("agora", "há 5 min", "há 3 h", "há 2 d"). */
export function relativeTimePt(date: Date | string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(date).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

export function formatCount(n: number | null | undefined): string {
  return new Intl.NumberFormat("pt-BR").format(n ?? 0);
}
