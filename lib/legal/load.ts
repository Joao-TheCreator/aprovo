import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";

export const LEGAL_DOCS = [
  { slug: "politica-de-privacidade", title: "Política de Privacidade" },
  { slug: "termos-de-uso", title: "Termos de Uso" },
  { slug: "exclusao-de-dados", title: "Exclusão de dados" },
] as const;

export type LegalSlug = (typeof LEGAL_DOCS)[number]["slug"];

export const LEGAL_SLUGS: string[] = LEGAL_DOCS.map((d) => d.slug);

export function isLegalSlug(slug: string): slug is LegalSlug {
  return LEGAL_SLUGS.includes(slug);
}

const DRAFT_MARKER = "revisão de advogado";

/** Reads docs/legal/<slug>.md and renders it. The content is our own repo file (trusted). */
export function loadLegalDoc(slug: LegalSlug): { title: string; html: string; draft: boolean } {
  const file = path.join(process.cwd(), "docs", "legal", `${slug}.md`);
  const md = fs.readFileSync(file, "utf8");
  const title = /^#\s+(.+)$/m.exec(md)?.[1]?.trim() ?? slug;
  const html = marked.parse(md, { async: false });
  return { title, html, draft: md.includes(DRAFT_MARKER) };
}
