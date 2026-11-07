import { describe, expect, it } from "vitest";
import {
  connectionLostEmail,
  decisionEmail,
  escapeHtml,
  magicLinkEmail,
  publishFailedEmail,
  publishedEmail,
  renderEmail,
  type RenderedEmail,
} from "@/lib/email/templates";

const BASE = "https://app.aprovo.test";

function expectClean(email: RenderedEmail) {
  for (const part of [email.subject, email.html, email.text]) {
    expect(part).not.toContain("undefined");
    expect(part).not.toContain("null");
    expect(part).not.toContain("[object Object]");
  }
  expect(email.html).toContain(`${BASE}/brand/aprovo-logo-dark.png`);
  expect(email.html).toContain('alt="APROVO"');
}

describe("email templates", () => {
  it("magic link: CTA url in html and text", () => {
    const url = "https://app.aprovo.test/api/auth/callback/resend?token=abc&email=a%40b.c";
    const email = magicLinkEmail({ url, baseUrl: BASE });
    expectClean(email);
    expect(email.html).toContain(`href="${escapeHtml(url)}"`);
    expect(email.text).toContain(url);
    expect(email.html).toContain("Entrar no APROVO");
  });

  it("decision (approved) keeps the subject format and links the post", () => {
    const email = decisionEmail({
      approverName: "Carla",
      decision: "approved",
      postCaption: "Promo de verão",
      profileUsername: "loja",
      url: "https://app.aprovo.test/perfis/p1/posts/x",
      baseUrl: BASE,
    });
    expectClean(email);
    expect(email.subject).toBe("Carla aprovou 'Promo de verão' (@loja)");
    expect(email.html).toContain('href="https://app.aprovo.test/perfis/p1/posts/x"');
  });

  it("decision (changes) escapes user text in html", () => {
    const email = decisionEmail({
      approverName: "<b>Eve</b>",
      decision: "changes_requested",
      postCaption: `Post "x" <script>alert(1)</script>`,
      profileUsername: "loja",
      url: "https://app.aprovo.test/p",
      comment: "Troca a foto & a cor <img src=x onerror=alert(1)>",
      baseUrl: BASE,
    });
    expectClean(email);
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).not.toContain("<b>Eve</b>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("Troca a foto &amp; a cor");
    expect(email.text).toContain("Troca a foto & a cor");
  });

  it("published: Instagram CTA only with an https permalink", () => {
    const withLink = publishedEmail({
      profileUsername: "loja",
      postCaption: null,
      permalink: "https://www.instagram.com/p/abc/",
      publishedAt: new Date("2026-01-02T13:00:00Z"),
      baseUrl: BASE,
    });
    expectClean(withLink);
    expect(withLink.subject).toBe("Publicado no Instagram: 'Publicação sem legenda' (@loja)");
    expect(withLink.html).toContain('href="https://www.instagram.com/p/abc/"');

    const without = publishedEmail({
      profileUsername: "loja",
      postCaption: "Oi",
      permalink: null,
      publishedAt: new Date("2026-01-02T13:00:00Z"),
      baseUrl: BASE,
    });
    expectClean(without);
    expect(without.html).not.toContain("Ver no Instagram");
  });

  it("publish failed shows the reason and the post link", () => {
    const email = publishFailedEmail({
      profileUsername: "loja",
      postCaption: "Oi",
      reason: "Mídia inválida",
      url: "https://app.aprovo.test/p",
      baseUrl: BASE,
    });
    expectClean(email);
    expect(email.html).toContain("Mídia inválida");
    expect(email.html).toContain('href="https://app.aprovo.test/p"');
  });

  it("connection lost links to settings", () => {
    const email = connectionLostEmail({
      username: "loja",
      affected: 2,
      reason: "expired",
      url: "https://app.aprovo.test/configuracoes",
      baseUrl: BASE,
    });
    expectClean(email);
    expect(email.subject).toBe("O Instagram @loja desconectou");
    expect(email.html).toContain('href="https://app.aprovo.test/configuracoes"');
    expect(email.text).toContain("2 publicações agendadas");
  });

  it("drops non-http CTA urls", () => {
    const { html } = renderEmail({
      baseUrl: BASE,
      preheader: "p",
      eyebrow: "e",
      tone: "brand",
      title: "t",
      paragraphs: [],
      cta: { label: "Clique", url: "javascript:alert(1)" },
    });
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("Clique");
  });
});
