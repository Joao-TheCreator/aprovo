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
