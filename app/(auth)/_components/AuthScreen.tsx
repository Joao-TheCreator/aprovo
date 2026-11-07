import { CalendarClock, LayoutGrid, Link2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/app/Logo";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { Card } from "@/components/ui/card";
import { LEGAL_DOCS } from "@/lib/legal/load";

const VALUES: { icon: LucideIcon; title: string; text: string; tone: string }[] = [
  {
    icon: LayoutGrid,
    title: "Monte o feed",
    text: "Veja a grade exatamente como vai ficar no Instagram do cliente.",
    tone: "bg-gradient-brand text-on-brand",
  },
  {
    icon: Link2,
    title: "Mande um link",
    text: "O cliente aprova pelo celular, sem login e sem planilha.",
    tone: "bg-brand-soft text-brand-ink",
  },
  {
    icon: CalendarClock,
    title: "A gente publica",
    text: "Aprovou? Escolha a hora e o post sai sozinho.",
    tone: "bg-gradient-success text-ink",
  },
];

/**
 * Login "mini landing" (docs/14, area D): aurora background, display headline, three value
 * bullets and the auth card on glass. Shared by /entrar and /verificar; the card content
 * comes from the page. Expects `app/(auth)/layout.tsx` to be a passthrough.
 */
export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background text-foreground relative isolate flex min-h-dvh flex-col overflow-hidden">
      <div aria-hidden className="bg-aurora pointer-events-none absolute inset-0 -z-10" />
      <div
        aria-hidden
        className="bg-glow pointer-events-none absolute -top-32 -right-24 -z-10 size-80 rounded-full opacity-60 blur-3xl"
      />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] md:px-8">
        <Link href="/entrar" aria-label="APROVO, início" className="flex rounded-md">
          <Logo height={32} />
        </Link>
        <ThemeToggle compact />
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 py-8 md:px-8 lg:grid-cols-[1.1fr_1fr] lg:grid-rows-[auto_auto] lg:gap-x-16 lg:gap-y-10 lg:py-16">
        <section className="animate-rise lg:col-start-1 lg:row-start-1 lg:self-end">
          <p className="text-micro text-brand-ink mb-4 uppercase">Feed planejado e aprovado</p>
          <p className="font-display text-display" role="presentation">
            Seu feed.
            <br />
            <span className="text-gradient-brand">Aprovado.</span>
            <br />
            Publicado.
          </p>
          <p className="text-body text-muted-foreground mt-4 max-w-md md:text-base">
            Monte o feed do cliente, mande um link e receba o sim. O resto é com a gente.
          </p>
        </section>

        <div
          className="animate-rise lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center"
          style={{ animationDelay: "80ms" }}
        >
          <Card variant="glass" className="shadow-sheet mx-auto w-full max-w-md gap-5 p-6 md:p-8">
            {children}
          </Card>
        </div>

        <ul className="grid gap-4 sm:grid-cols-3 lg:col-start-1 lg:row-start-2 lg:grid-cols-1 lg:self-start">
          {VALUES.map(({ icon: Icon, title, text, tone }, i) => (
            <li
              key={title}
              className="animate-rise flex items-start gap-3"
              style={{ animationDelay: `${140 + i * 40}ms` }}
            >
              <span
                aria-hidden
                className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${tone}`}
              >
                <Icon className="size-5" strokeWidth={2} />
              </span>
              <span>
                <span className="text-title block">{title}</span>
                <span className="text-body text-muted-foreground block">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-8">
        <nav
          aria-label="Documentos legais"
          className="text-caption text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-2 font-medium"
        >
          {LEGAL_DOCS.map((d) => (
            <Link
              key={d.slug}
              href={`/legal/${d.slug}`}
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              {d.title}
            </Link>
          ))}
          <span className="sm:ml-auto">© {new Date().getFullYear()} APROVO</span>
        </nav>
      </footer>
    </div>
  );
}

/** Google "G" (brand colours are fixed by Google's guidelines). */
export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={className}>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
