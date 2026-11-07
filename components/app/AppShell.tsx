"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { Logo } from "@/components/app/Logo";
import { getNavItems, NAV_ITEMS } from "@/components/app/nav-items";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { UserMenu, type ShellUser } from "@/components/app/UserMenu";
import { cn } from "@/lib/utils";

/** Title shown in the mobile top bar once the page scrolls past its own heading. */
function pageTitle(pathname: string, activeLabel?: string): string {
  if (pathname === "/perfis/novo") return "Conectar";
  if (pathname.startsWith("/configuracoes")) return "Configurações";
  return activeLabel ?? "APROVO";
}

function subscribeScroll(onChange: () => void): () => void {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}
const readScrolled = () => window.scrollY > 12;
const serverScrolled = () => false;

const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/**
 * App shell v2 (docs/14, "Navegação inferior + FAB"). Mobile: glass top bar + floating glass
 * bottom nav. Desktop: glass sidebar. Exposes `--app-nav-offset` (space taken by the bottom
 * nav, incl. safe area; 0 on desktop) so fixed bars/FABs of other areas can sit above it.
 */
export function AppShell({
  user,
  lastProfileId,
  workspaceName,
  children,
}: {
  user?: ShellUser;
  lastProfileId?: string | null;
  workspaceName?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const navItems = getNavItems(lastProfileId);
  const activeLabel = NAV_ITEMS.find((item) => item.match(pathname))?.label;
  const scrolled = useSyncExternalStore(subscribeScroll, readScrolled, serverScrolled);
  const title = pageTitle(pathname, activeLabel);

  return (
    <div className="relative isolate flex min-h-dvh flex-1 flex-col [--app-nav-offset:calc(5.25rem+env(safe-area-inset-bottom))] md:flex-row md:[--app-nav-offset:0px]">
      <div
        aria-hidden
        className="bg-aurora pointer-events-none fixed inset-x-0 top-0 -z-10 h-96 opacity-40"
      />

      {/* Desktop sidebar */}
      <aside className="glass border-outline sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r p-4 md:flex">
        <Link
          href="/perfis"
          aria-label="APROVO, ir para perfis"
          className={cn("flex h-11 items-center self-start rounded-2xl px-2", FOCUS)}
        >
          <Logo height={32} />
        </Link>
        {workspaceName ? (
          <div className="bg-surface-2 flex flex-col gap-0.5 rounded-2xl px-3 py-2.5">
            <span className="text-micro text-muted-foreground uppercase">Workspace</span>
            <span className="truncate text-sm font-bold">{workspaceName}</span>
          </div>
        ) : null}
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = label === activeLabel;
            return (
              <Link
                key={label}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "press flex h-12 items-center gap-3 rounded-full px-2 text-sm font-semibold transition-colors duration-(--ap-dur-instant)",
                  FOCUS,
                  active
                    ? "text-foreground font-bold"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "ease-spring flex size-9 items-center justify-center rounded-full transition-[background-color,box-shadow,color] duration-(--ap-dur-base)",
                    active && "bg-brand-soft text-brand-ink shadow-glow",
                  )}
                >
                  <Icon aria-hidden className="size-5" strokeWidth={2} />
                </span>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <ThemeToggle compact className="self-start" />
          <UserMenu user={user} showName />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header
          className={cn(
            "glass sticky top-0 z-30 border-b pt-[env(safe-area-inset-top)] transition-colors duration-(--ap-dur-base) md:hidden",
            scrolled ? "border-outline" : "border-transparent",
          )}
        >
          <div className="relative flex h-14 items-center justify-between px-4">
            <Link
              href="/perfis"
              aria-label="APROVO, ir para perfis"
              className={cn("flex h-11 items-center rounded-2xl", FOCUS)}
            >
              <Logo height={28} />
            </Link>
            <span
              aria-hidden
              className={cn(
                "font-display text-title pointer-events-none absolute left-1/2 max-w-[45%] -translate-x-1/2 truncate transition-[opacity,transform] duration-(--ap-dur-base) ease-out",
                scrolled ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
              )}
            >
              {title}
            </span>
            <UserMenu user={user} />
          </div>
        </header>

        <main className="flex-1 px-4 pt-5 pb-[calc(var(--app-nav-offset)+1.5rem)] md:px-8 md:py-10">
          {children}
        </main>

        {/* Mobile bottom nav: floating glass pill */}
        <nav
          aria-label="Principal"
          className="glass border-outline shadow-sheet fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 mx-auto grid max-w-md grid-cols-3 gap-1 rounded-full border p-1.5 md:hidden"
        >
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = label === activeLabel;
            return (
              <Link
                key={label}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "press flex h-14 flex-col items-center justify-center gap-0.5 rounded-full",
                  FOCUS,
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "ease-spring flex h-8 w-14 items-center justify-center rounded-full transition-[background-color,box-shadow,color,transform] duration-(--ap-dur-base)",
                    active ? "bg-brand-soft text-brand-ink shadow-glow scale-105" : "scale-100",
                  )}
                >
                  <Icon aria-hidden className="size-6" strokeWidth={2} />
                </span>
                <span className="text-micro">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
