"use client";

import { LogOut, Settings } from "lucide-react";
import Link from "next/link";

import { ProfileAvatar } from "@/components/app/ProfileAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ShellUser = { name?: string | null; email?: string | null; image?: string | null };

export function UserMenu({
  user,
  showName = false,
  className,
}: {
  user?: ShellUser;
  showName?: boolean;
  className?: string;
}) {
  const label = user?.name || user?.email || "Conta";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu da conta"
        className={cn(
          "press focus-visible:ring-ring focus-visible:ring-offset-background flex min-h-11 min-w-11 items-center gap-3 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          showName && "hover:bg-surface-2 w-full p-1 pr-3 text-left",
          className,
        )}
      >
        <ProfileAvatar src={user?.image} name={user?.name || user?.email} size="sm" ring />
        {showName ? (
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-bold">{label}</span>
            {user?.name && user.email ? (
              <span className="text-muted-foreground truncate text-xs">{user.email}</span>
            ) : null}
          </span>
        ) : null}
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
            <Settings strokeWidth={2} />
            Configurações
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          {/* Full navigation to an API route, not a page: plain anchor is intended. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/auth/signout">
            <LogOut strokeWidth={2} />
            Sair
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
