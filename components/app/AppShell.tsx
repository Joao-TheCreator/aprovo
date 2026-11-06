"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/app/Logo";
import { NAV_ITEMS } from "@/components/app/nav-items";
import { UserMenu, type ShellUser } from "@/components/app/UserMenu";
import { cn } from "@/lib/utils";

export function AppShell({ user, children }: { user?: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const activeHref = NAV_ITEMS.find((item) => item.match(pathname))?.label;

  return (
    <div className="flex min-h-dvh flex-1 flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="border-border bg-card sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r p-4 md:flex">
        <Link href="/perfis" className="px-2 pt-2">
          <Logo height={32} />
        </Link>
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const active = label === activeHref;
            return (
              <Link
                key={label}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-full px-4 text-sm font-semibold transition-colors",
                  active
                    ? "bg-secondary text-primary"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <Icon className="size-6" strokeWidth={1.75} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto">
          <UserMenu user={user} showName />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="border-border bg-card/95 sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
          <Link href="/perfis">
            <Logo height={28} />
          </Link>
          <UserMenu user={user} />
        </header>

        <main className="flex-1 px-4 py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-8 md:py-8 md:pb-8">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav
          aria-label="Principal"
          className="border-border bg-card fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const active = label === activeHref;
            return (
              <Link
                key={label}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-6" strokeWidth={1.75} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
