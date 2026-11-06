import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL_DOCS } from "@/lib/legal/load";

export function LegalShell({
  children,
  current,
  draft,
}: {
  children: ReactNode;
  current?: string;
  draft?: boolean;
}) {
  const others = LEGAL_DOCS.filter((d) => d.slug !== current);
  return (
    <div className="bg-background text-foreground min-h-dvh">
      <header className="border-border border-b">
        <div className="mx-auto flex max-w-[72ch] items-center justify-between px-4 py-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            APROVO
          </Link>
          <Link href="/legal" className="text-muted-foreground text-sm underline">
            Documentos legais
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[72ch] px-4 py-8">
        {draft ? (
          <p className="bg-secondary mb-6 inline-block rounded-full px-3 py-1 text-xs font-medium">
            Rascunho em revisão
          </p>
        ) : null}
        {children}
      </main>
      <footer className="border-border border-t">
        <nav
          aria-label="Outros documentos"
          className="mx-auto flex max-w-[72ch] flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm"
        >
          {others.map((d) => (
            <Link key={d.slug} href={`/legal/${d.slug}`} className="underline">
              {d.title}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
