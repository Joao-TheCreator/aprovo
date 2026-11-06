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
        className="[&_a]:text-primary [&_blockquote]:border-border [&_blockquote]:text-muted-foreground [&_a]:underline [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:leading-9 [&_h1]:font-bold [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_p]:leading-7 [&_table]:my-4 [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6"
        dangerouslySetInnerHTML={{ __html: doc.html }}
      />
    </LegalShell>
  );
}
