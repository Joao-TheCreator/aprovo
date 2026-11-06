"use client";

import { LogOut, Settings } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ShellUser = { name?: string | null; email?: string | null; image?: string | null };

function initials(user?: ShellUser) {
  const source = user?.name || user?.email;
  if (!source) return "?";
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function UserMenu({ user, showName = false }: { user?: ShellUser; showName?: boolean }) {
  const label = user?.name || user?.email || "Conta";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu da conta"
        className="focus-visible:ring-ring/50 flex items-center gap-3 rounded-full outline-none focus-visible:ring-[3px]"
      >
        <Avatar>
          {user?.image ? <AvatarImage src={user.image} alt="" /> : null}
          <AvatarFallback>{initials(user)}</AvatarFallback>
        </Avatar>
        {showName ? <span className="truncate text-sm font-semibold">{label}</span> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <span className="block truncate">{label}</span>
          {user?.name && user.email ? (
            <span className="text-muted-foreground block truncate text-xs font-normal">
              {user.email}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/configuracoes">
            <Settings strokeWidth={1.75} />
            Configurações
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          {/* Full navigation to an API route, not a page: plain anchor is intended. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/auth/signout">
            <LogOut strokeWidth={1.75} />
            Sair
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
