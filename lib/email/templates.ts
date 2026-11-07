/**
 * E-mail templates (docs/14, area D). One dark layout for every e-mail: table-based, inline
 * styles only, 600 px wide, Arial/Helvetica (web fonts don't load in mail clients), the logo
 * as a hosted PNG with readable alt text, a gradient bar on top, one big CTA button, the raw
 * link as fallback, and a plain-text alternative. Pure functions: no I/O, no env reads except
 * the APP_URL default for the logo.
 */

export type RenderedEmail = { subject: string; html: string; text: string };

type Tone = "brand" | "success" | "warning" | "danger";

const COLORS = {
  bg: "#0B0816",
  surface: "#151027",
  surface2: "#201838",
  outline: "#2E2550",
  text: "#F5F2FF",
  muted: "#A9A2C4",
  brand: "#6A00FF",
  onBrand: "#FFFFFF",
} as const;

const TONE_COLOR: Record<Tone, string> = {
  brand: "#A77BFF",
  success: "#22E688",
  warning: "#FFC24D",
  danger: "#FF6B85",
};

const FONT = "Arial, Helvetica, sans-serif";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) URLs become links; anything else is dropped. */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

export function appBaseUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export type EmailLayout = {
  /** Hidden preview line shown by mail clients next to the subject. */
  preheader: string;
  /** Small uppercase label above the title. */
  eyebrow: string;
  tone: Tone;
  title: string;
  /** Plain-text paragraphs (escaped on render). */
  paragraphs: string[];
  /** Highlighted quote, e.g. the client's comment or the failure reason. */
  quote?: { label: string; text: string } | null;
  cta?: { label: string; url: string } | null;
  /** Small print under the CTA. */
  footnote?: string;
  /** Base URL for the hosted logo; defaults to APP_URL. */
  baseUrl?: string;
};

/** Renders the shared dark layout into HTML + plain text. */
export function renderEmail(layout: EmailLayout): { html: string; text: string } {
  const base = (layout.baseUrl ?? appBaseUrl()).replace(/\/+$/, "");
  const accent = TONE_COLOR[layout.tone];
  const ctaUrl = safeUrl(layout.cta?.url);
  const e = escapeHtml;

  const paragraphs = layout.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:24px;color:${COLORS.muted};">${e(p)}</p>`,
    )
    .join("");

  const quote = layout.quote
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;">` +
      `<tr><td style="background-color:${COLORS.surface2};border-left:4px solid ${accent};border-radius:12px;padding:16px 18px;">` +
      `<p style="margin:0 0 6px;font-family:${FONT};font-size:11px;line-height:14px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${accent};">${e(layout.quote.label)}</p>` +
      `<p style="margin:0;font-family:${FONT};font-size:16px;line-height:24px;color:${COLORS.text};white-space:pre-line;">${e(layout.quote.text)}</p>` +
      `</td></tr></table>`
    : "";

  const cta =
    ctaUrl && layout.cta
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">` +
        `<tr><td align="center" bgcolor="${COLORS.brand}" style="border-radius:999px;background-color:${COLORS.brand};background-image:linear-gradient(135deg,#6A00FF 0%,#8418FF 50%,#9B3CFF 100%);">` +
        `<a href="${e(ctaUrl)}" target="_blank" rel="noopener" style="display:inline-block;padding:16px 36px;font-family:${FONT};font-size:17px;line-height:20px;font-weight:bold;color:${COLORS.onBrand};text-decoration:none;border-radius:999px;">${e(layout.cta.label)}</a>` +
        `</td></tr></table>` +
        `<p style="margin:0 0 8px;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};">Se o botão não abrir, copie e cole este link no navegador:</p>` +
        `<p style="margin:0 0 16px;font-family:${FONT};font-size:13px;line-height:20px;word-break:break-all;"><a href="${e(ctaUrl)}" target="_blank" rel="noopener" style="color:#A77BFF;text-decoration:underline;">${e(ctaUrl)}</a></p>`
      : "";

  const footnote = layout.footnote
    ? `<p style="margin:8px 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${COLORS.muted};">${e(layout.footnote)}</p>`
    : "";

  const html =
    `<!doctype html><html lang="pt-BR"><head>` +
    `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">` +
    `<title>${e(layout.title)}</title></head>` +
    `<body style="margin:0;padding:0;background-color:${COLORS.bg};">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COLORS.bg};">${e(layout.preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.bg}" style="background-color:${COLORS.bg};">` +
    `<tr><td align="center" style="padding:32px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">` +
    // logo
    `<tr><td style="padding:0 8px 20px;">` +
    `<img src="${e(base)}/brand/aprovo-logo-dark.png" width="128" height="56" alt="APROVO" style="display:block;border:0;outline:none;height:56px;width:128px;font-family:${FONT};font-size:24px;font-weight:bold;color:${COLORS.text};">` +
    `</td></tr>` +
    // card
    `<tr><td bgcolor="${COLORS.surface}" style="background-color:${COLORS.surface};border:1px solid ${COLORS.outline};border-radius:24px;overflow:hidden;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">` +
    `<tr><td height="6" bgcolor="${COLORS.brand}" style="height:6px;line-height:6px;font-size:0;background-color:${COLORS.brand};background-image:linear-gradient(90deg,#6A00FF 0%,#9B3CFF 55%,#22E688 100%);border-radius:24px 24px 0 0;">&nbsp;</td></tr>` +
    `<tr><td style="padding:32px 32px 28px;">` +
    `<p style="margin:0 0 12px;font-family:${FONT};font-size:12px;line-height:16px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:${accent};">${e(layout.eyebrow)}</p>` +
    `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:28px;line-height:34px;font-weight:bold;color:${COLORS.text};">${e(layout.title)}</h1>` +
    paragraphs +
    quote +
    cta +
    footnote +
    `</td></tr></table></td></tr>` +
    // footer
    `<tr><td style="padding:20px 8px 0;">` +
    `<p style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.muted};">APROVO · seu feed planejado, aprovado e publicado.<br>Você recebeu este e-mail porque usa o APROVO.</p>` +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`;

  const textParts = [
    layout.title,
    "",
    ...layout.paragraphs.flatMap((p) => [p, ""]),
    ...(layout.quote ? [`${layout.quote.label}: ${layout.quote.text}`, ""] : []),
    ...(ctaUrl && layout.cta ? [`${layout.cta.label}: ${ctaUrl}`, ""] : []),
    ...(layout.footnote ? [layout.footnote, ""] : []),
    "--",
    "APROVO",
  ];
  return { html, text: textParts.join("\n") };
}

/* ---------- E-mails ---------- */

export function captionTitle(caption: string | null): string {
  return (caption ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || "Publicação sem legenda";
}

export function magicLinkEmail(input: { url: string; baseUrl?: string }): RenderedEmail {
  const { html, text } = renderEmail({
    baseUrl: input.baseUrl,
    preheader: "Seu link de acesso. Vale por 24 horas.",
    eyebrow: "Link de acesso",
    tone: "brand",
    title: "Bora entrar?",
    paragraphs: [
      "Toque no botão para entrar no APROVO. O link vale por 24 horas e só funciona uma vez.",
    ],
    cta: { label: "Entrar no APROVO", url: input.url },
    footnote: "Não pediu esse link? Pode ignorar este e-mail. Ninguém entra sem ele.",
  });
  return { subject: "Seu link de acesso ao APROVO", html, text };
}

export type DecisionTemplateInput = {
  approverName: string | null;
  decision: "approved" | "changes_requested";
  postCaption: string | null;
  profileUsername: string;
  url: string;
  comment?: string | null;
  baseUrl?: string;
};

export function decisionEmail(input: DecisionTemplateInput): RenderedEmail {
  const who = input.approverName?.trim() || "O cliente";
  const title = (input.postCaption ?? "").trim().slice(0, 60) || "Publicação sem legenda";
  const approved = input.decision === "approved";
  const subject = `${who} ${approved ? "aprovou" : "pediu ajustes em"} '${title}' (@${input.profileUsername})`;
  const comment = !approved ? input.comment?.trim() : "";
  const { html, text } = renderEmail({
    baseUrl: input.baseUrl,
    preheader: approved ? `Sinal verde para '${title}'.` : `Tem ajuste pedido em '${title}'.`,
    eyebrow: approved ? "Aprovado" : "Ajustes pedidos",
    tone: approved ? "success" : "warning",
    title: approved ? `${who} aprovou` : `${who} pediu ajustes`,
    paragraphs: approved
      ? [`'${title}' de @${input.profileUsername} recebeu o sim. Agora é só agendar.`]
      : [`'${title}' de @${input.profileUsername} precisa de uns ajustes antes de ir pro ar.`],
    quote: comment ? { label: `Comentário de ${who}`, text: comment } : null,
    cta: { label: approved ? "Abrir o post" : "Ver o pedido", url: input.url },
  });
  return { subject, html, text };
}

export type PublishedTemplateInput = {
  profileUsername: string;
  postCaption: string | null;
  permalink: string | null;
  publishedAt: Date;
  baseUrl?: string;
};

export function publishedEmail(input: PublishedTemplateInput): RenderedEmail {
  const title = captionTitle(input.postCaption);
  const when = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(input.publishedAt);
  const permalink = input.permalink?.startsWith("https://") ? input.permalink : null;
  const { html, text } = renderEmail({
    baseUrl: input.baseUrl,
    preheader: `'${title}' já está no Instagram de @${input.profileUsername}.`,
    eyebrow: "Publicado",
    tone: "success",
    title: "Tá no ar.",
    paragraphs: [`'${title}' foi publicado no Instagram de @${input.profileUsername} em ${when}.`],
    cta: permalink ? { label: "Ver no Instagram", url: permalink } : null,
  });
  return {
    subject: `Publicado no Instagram: '${title}' (@${input.profileUsername})`,
    html,
    text,
  };
}

export type PublishFailedTemplateInput = {
  profileUsername: string;
  postCaption: string | null;
  reason: string | null;
  url: string;
  baseUrl?: string;
};

export function publishFailedEmail(input: PublishFailedTemplateInput): RenderedEmail {
  const title = captionTitle(input.postCaption);
  const reason = input.reason?.trim() || "Tente novamente ou fale com o suporte.";
  const { html, text } = renderEmail({
    baseUrl: input.baseUrl,
    preheader: `'${title}' não foi publicado. Dá pra reagendar.`,
    eyebrow: "Falhou",
    tone: "danger",
    title: "Não rolou publicar",
    paragraphs: [
      `'${title}' não foi publicado no Instagram de @${input.profileUsername}.`,
      "Abra o post para ver o que aconteceu e reagendar.",
    ],
    quote: { label: "Motivo", text: reason },
    cta: { label: "Abrir o post", url: input.url },
  });
  return {
    subject: `Não foi possível publicar '${title}' (@${input.profileUsername})`,
    html,
    text,
  };
}

export type ConnectionLostTemplateReason =
  "expired" | "missing_scope" | "not_professional" | "revoked";

export function connectionLostText(reason: ConnectionLostTemplateReason, username: string): string {
  switch (reason) {
    case "missing_scope":
      return "Reconecte e autorize 'Publicar conteúdo'.";
    case "not_professional":
      return `A conta @${username} deixou de ser profissional. Mude para Criador ou Empresa e reconecte.`;
    case "revoked":
      return `O acesso do APROVO a @${username} foi revogado no Instagram. Reconecte para voltar a publicar.`;
    default:
      return `O Instagram @${username} desconectou. Reconecte para continuar publicando.`;
  }
}

export type ConnectionLostTemplateInput = {
  username: string;
  affected: number;
  reason: ConnectionLostTemplateReason;
  url: string;
  baseUrl?: string;
};

export function connectionLostEmail(input: ConnectionLostTemplateInput): RenderedEmail {
  const count =
    input.affected === 1
      ? "1 publicação agendada não pôde ser publicada e foi marcada como falha."
      : `${input.affected} publicações agendadas não puderam ser publicadas e foram marcadas como falha.`;
  const { html, text } = renderEmail({
    baseUrl: input.baseUrl,
    preheader: `Reconecte @${input.username} para voltar a publicar.`,
    eyebrow: "Conexão perdida",
    tone: "warning",
    title: "O Instagram desconectou",
    paragraphs: [
      connectionLostText(input.reason, input.username),
      ...(input.affected > 0 ? [count] : []),
      "Depois de reconectar, você reagenda tudo em um toque.",
    ],
    cta: { label: "Reconectar agora", url: input.url },
  });
  return { subject: `O Instagram @${input.username} desconectou`, html, text };
}
