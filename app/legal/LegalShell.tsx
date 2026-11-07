import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/app/Logo";
import { LEGAL_DOCS } from "@/lib/legal/load";

/**
 * Legal pages (docs/14 v2): readable column on `surface`, glass top bar with the logo,
 * links in `brand-ink`, light/dark via tokens.
 */
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
    <div className="bg-background text-foreground relative isolate min-h-dvh">
      <div
        aria-hidden
        className="bg-aurora pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 opacity-70"
      />
      <header className="glass border-border sticky top-0 z-10 border-b pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-[72ch] items-center justify-between gap-4 px-4 py-3">
          <Link href="/" aria-label="APROVO, início" className="flex rounded-md">
            <Logo height={28} />
          </Link>
          <Link
            href="/legal"
            className="text-caption text-brand-ink inline-flex min-h-11 items-center gap-1 underline-offset-4 hover:underline"
          >
            {current ? <ArrowLeft className="size-4" aria-hidden /> : null}
            Documentos legais
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[72ch] px-4 py-8 md:py-12">
        <div className="bg-card border-border shadow-card rounded-3xl border p-5 md:p-10">
          {draft ? (
            <p className="bg-warning text-ink text-caption mb-6 inline-block rounded-full px-3 py-1">
              Rascunho em revisão
            </p>
          ) : null}
          {children}
        </div>
      </main>
      <footer>
        <nav
          aria-label="Outros documentos"
          className="text-caption text-muted-foreground mx-auto flex max-w-[72ch] flex-wrap gap-x-6 gap-y-2 px-4 pb-[max(2rem,env(safe-area-inset-bottom))]"
        >
          {others.map((d) => (
            <Link
              key={d.slug}
              href={`/legal/${d.slug}`}
              className="hover:text-foreground underline underline-offset-4"
            >
              {d.title}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
