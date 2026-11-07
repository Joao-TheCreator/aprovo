import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalShell } from "../LegalShell";
import { LEGAL_SLUGS, isLegalSlug, loadLegalDoc } from "@/lib/legal/load";

export const dynamicParams = false;

export function generateStaticParams() {
  return LEGAL_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isLegalSlug(slug)) return {};
  return { title: loadLegalDoc(slug).title };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isLegalSlug(slug)) notFound();
  const doc = loadLegalDoc(slug);
  return (
    <LegalShell current={slug} draft={doc.draft}>
      <div
        className="text-foreground [&_a]:text-brand-ink [&_blockquote]:border-brand-ink [&_blockquote]:text-muted-foreground [&_h1]:font-display [&_h1]:text-h1 [&_h2]:font-display [&_h2]:text-h2 [&_th]:bg-surface-2 [&_td]:border-border [&_th]:border-border [&_li]:text-muted-foreground [&_p]:text-muted-foreground [&_strong]:text-foreground [&_h3]:text-title [&_hr]:border-border [&_code]:bg-surface-2 [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_code]:rounded-md [&_code]:px-1.5 [&_h1]:mb-6 [&_h2]:mt-10 [&_h2]:mb-3 [&_h3]:mt-6 [&_h3]:mb-2 [&_hr]:my-8 [&_li]:my-1 [&_li]:leading-7 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_p]:text-base [&_p]:leading-7 [&_table]:my-4 [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_th]:text-left [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6"
        dangerouslySetInnerHTML={{ __html: doc.html }}
      />
    </LegalShell>
  );
}
