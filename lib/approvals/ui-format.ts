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
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TZ,
  }).format(new Date(d));
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

/** "03/11 14:32" (São Paulo time). */
export function formatDayMonthTime(d: Date | string): string {
  return `${formatDayMonth(d)} ${formatTimeBr(d)}`;
}

/** Tiny user agent summary for the audit list: "Chrome · Android". Falls back to "Navegador". */
export function shortUserAgent(ua: string | null | undefined): string {
  const s = ua ?? "";
  let browser: string | null = null;
  if (/\b(Edg|EdgA|EdgiOS|Edge)\//.test(s)) browser = "Edge";
  else if (/\b(Firefox|FxiOS)\//.test(s)) browser = "Firefox";
  else if (/\b(Chrome|CriOS)\//.test(s)) browser = "Chrome";
  else if (/\bSafari\//.test(s)) browser = "Safari";
  let os: string | null = null;
  if (/iPhone/.test(s)) os = "iPhone";
  else if (/iPad/.test(s)) os = "iPad";
  else if (/Android/.test(s)) os = "Android";
  else if (/Windows/.test(s)) os = "Windows";
  else if (/Macintosh|Mac OS X/.test(s)) os = "Mac";
  const name = browser ?? "Navegador";
  return os ? `${name} · ${os}` : name;
}

type RoundLike = {
  startedAt: Date | string;
  decisions: Array<{
    postId: string;
    recipientName: string | null;
    decision: "approved" | "changes_requested";
    decidedAt: Date | string;
  }>;
};

function verbBy(decision: "approved" | "changes_requested"): string {
  return decision === "approved" ? "aprovado" : "ajustes";
}

/** "Rodada 1 · enviada 03/11 · ajustes por Carlos em 03/11" (one entry per round). */
export function roundSummaries(rounds: RoundLike[]): string[] {
  return rounds.map((r, i) => {
    const groups = new Map<
      string,
      { name: string; decision: "approved" | "changes_requested"; at: Date }
    >();
    for (const d of r.decisions) {
      const name = d.recipientName?.trim() || "Cliente";
      const key = `${name}\u0000${d.decision}`;
      const at = new Date(d.decidedAt);
      const cur = groups.get(key);
      if (!cur || at > cur.at) groups.set(key, { name, decision: d.decision, at });
    }
    const parts = [`Rodada ${i + 1}`, `enviada ${formatDayMonth(r.startedAt)}`];
    if (groups.size === 0) parts.push("aguardando");
    for (const g of groups.values()) {
      parts.push(`${verbBy(g.decision)} por ${g.name} em ${formatDayMonth(g.at)}`);
    }
    return parts.join(" · ");
  });
}

/** "Rodada 1: ajustes por Carlos em 03/11" for the latest decision of a post, or null. */
export function lastRoundNote(rounds: RoundLike[], postId: string): string | null {
  for (let i = rounds.length - 1; i >= 0; i--) {
    const mine = rounds[i].decisions.filter((d) => d.postId === postId);
    if (mine.length === 0) continue;
    const last = mine.reduce((a, b) => (new Date(b.decidedAt) >= new Date(a.decidedAt) ? b : a));
    const name = last.recipientName?.trim() || "Cliente";
    return `Rodada ${i + 1}: ${verbBy(last.decision)} por ${name} em ${formatDayMonth(last.decidedAt)}`;
  }
  return null;
}
