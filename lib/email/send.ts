import { Resend } from "resend";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type DecisionEmailInput = {
  to: string;
  approverName: string | null;
  decision: "approved" | "changes_requested";
  postCaption: string | null;
  profileUsername: string;
  /** Link to the post inside the app. */
  url: string;
  comment?: string | null;
};

/** Best-effort: skips silently without RESEND_API_KEY and never throws. */
export async function sendDecisionEmail(input: DecisionEmailInput): Promise<void> {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key || !input.to) return;
    const who = input.approverName?.trim() || "O cliente";
    const title = (input.postCaption ?? "").trim().slice(0, 60) || "Publicação sem legenda";
    const approved = input.decision === "approved";
    const subject = `${who} ${approved ? "aprovou" : "pediu ajustes em"} '${title}' (@${input.profileUsername})`;
    const comment = !approved && input.comment ? `: ${input.comment}` : "";
    const html =
      `<p>${esc(who)} ${approved ? "aprovou" : "pediu ajustes"} ` +
      `'${esc(title)}' (@${esc(input.profileUsername)})${esc(comment)}</p>` +
      `<p><a href="${esc(input.url)}">Abrir a publicação</a></p>`;
    const resend = new Resend(key);
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Aprovo <onboarding@resend.dev>",
      to: input.to,
      subject,
      html,
    });
  } catch (e) {
    console.warn("[email] decision e-mail failed:", e instanceof Error ? e.message : e);
  }
}

function captionTitle(caption: string | null): string {
  return (caption ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || "Publicação sem legenda";
}

async function deliver(to: string, subject: string, html: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  const resend = new Resend(key);
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Aprovo <onboarding@resend.dev>",
    to,
    subject,
    html,
  });
}

export type PublishedEmailInput = {
  to: string;
  profileUsername: string;
  postCaption: string | null;
  /** Public Instagram URL of the live post, when Meta returned it. */
  permalink: string | null;
  publishedAt: Date;
};

/** "Publicado no Instagram". Best-effort: skips silently without RESEND_API_KEY and never throws. */
export async function sendPublishedEmail(input: PublishedEmailInput): Promise<void> {
  try {
    const title = captionTitle(input.postCaption);
    const when = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(input.publishedAt);
    const link = input.permalink?.startsWith("https://")
      ? `<p><a href="${esc(input.permalink)}">Ver no Instagram</a></p>`
      : "";
    await deliver(
      input.to,
      `Publicado no Instagram: '${title}' (@${input.profileUsername})`,
      `<p>'${esc(title)}' foi publicado no Instagram de @${esc(input.profileUsername)} em ${esc(when)}.</p>${link}`,
    );
  } catch (e) {
    console.warn("[email] published e-mail failed:", e instanceof Error ? e.message : e);
  }
}

export type PublishFailedEmailInput = {
  to: string;
  profileUsername: string;
  postCaption: string | null;
  /** Friendly reason (`publications.last_error`). */
  reason: string | null;
  /** Link to the post inside the app. */
  url: string;
};

/** "Não foi possível publicar". Best-effort, never throws. */
export async function sendPublishFailedEmail(input: PublishFailedEmailInput): Promise<void> {
  try {
    const title = captionTitle(input.postCaption);
    const reason = input.reason?.trim() || "Tente novamente ou fale com o suporte.";
    await deliver(
      input.to,
      `Não foi possível publicar '${title}' (@${input.profileUsername})`,
      `<p>Não foi possível publicar '${esc(title)}' no Instagram de @${esc(input.profileUsername)}.</p>` +
        `<p>${esc(reason)}</p>` +
        `<p><a href="${esc(input.url)}">Abrir a publicação</a></p>`,
    );
  } catch (e) {
    console.warn("[email] publish-failed e-mail failed:", e instanceof Error ? e.message : e);
  }
}

export type ConnectionLostReason = "expired" | "missing_scope" | "not_professional" | "revoked";

export type ConnectionLostEmailInput = {
  to: string;
  username: string;
  /** Scheduled publications that failed because of the lost connection. */
  affected: number;
  reason: ConnectionLostReason;
  /** Link to Configurações. */
  url: string;
};

function connectionLostText(reason: ConnectionLostReason, username: string): string {
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

/** "O Instagram @x desconectou": one e-mail per connection, not per publication. Never throws. */
export async function sendConnectionLostEmail(input: ConnectionLostEmailInput): Promise<void> {
  try {
    const count =
      input.affected === 1
        ? "1 publicação agendada não pôde ser publicada"
        : `${input.affected} publicações agendadas não puderam ser publicadas`;
    await deliver(
      input.to,
      `O Instagram @${input.username} desconectou`,
      `<p>${esc(connectionLostText(input.reason, input.username))}</p>` +
        `<p>${esc(count)} e ${input.affected === 1 ? "foi marcada" : "foram marcadas"} como falha. ` +
        `Depois de reconectar, você pode reagendar em um toque.</p>` +
        `<p><a href="${esc(input.url)}">Abrir Configurações</a></p>`,
    );
  } catch (e) {
    console.warn("[email] connection-lost e-mail failed:", e instanceof Error ? e.message : e);
  }
}
