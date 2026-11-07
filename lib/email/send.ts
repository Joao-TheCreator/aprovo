import { Resend } from "resend";
import {
  connectionLostEmail,
  decisionEmail,
  magicLinkEmail,
  publishFailedEmail,
  publishedEmail,
  type ConnectionLostTemplateReason,
  type RenderedEmail,
} from "./templates";

const DEFAULT_FROM = "Aprovo <onboarding@resend.dev>";

async function deliver(to: string, email: RenderedEmail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  const resend = new Resend(key);
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? DEFAULT_FROM,
    to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

export type MagicLinkEmailInput = {
  to: string;
  /** Auth.js callback URL with the verification token. Never logged. */
  url: string;
  /** Provider config (lib/auth/config.ts); falls back to the env. */
  apiKey?: string;
  from?: string;
};

/**
 * Login link (Auth.js `sendVerificationRequest`). Unlike the notification e-mails this one
 * THROWS on failure, so Auth.js redirects to /entrar?error=EmailSignin.
 */
export async function sendMagicLinkEmail(input: MagicLinkEmailInput): Promise<void> {
  const key = input.apiKey ?? process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set; cannot send the sign-in e-mail");
  const email = magicLinkEmail({ url: input.url });
  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from: input.from ?? process.env.EMAIL_FROM ?? DEFAULT_FROM,
    to: input.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
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
    if (!process.env.RESEND_API_KEY || !input.to) return;
    await deliver(input.to, decisionEmail(input));
  } catch (e) {
    console.warn("[email] decision e-mail failed:", e instanceof Error ? e.message : e);
  }
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
    await deliver(input.to, publishedEmail(input));
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
    await deliver(input.to, publishFailedEmail(input));
  } catch (e) {
    console.warn("[email] publish-failed e-mail failed:", e instanceof Error ? e.message : e);
  }
}

export type ConnectionLostReason = ConnectionLostTemplateReason;

export type ConnectionLostEmailInput = {
  to: string;
  username: string;
  /** Scheduled publications that failed because of the lost connection. */
  affected: number;
  reason: ConnectionLostReason;
  /** Link to Configurações. */
  url: string;
};

/** "O Instagram @x desconectou": one e-mail per connection, not per publication. Never throws. */
export async function sendConnectionLostEmail(input: ConnectionLostEmailInput): Promise<void> {
  try {
    await deliver(input.to, connectionLostEmail(input));
  } catch (e) {
    console.warn("[email] connection-lost e-mail failed:", e instanceof Error ? e.message : e);
  }
}
