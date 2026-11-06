import { CheckCircle2, LayoutGrid, Users, type LucideIcon } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  match: (p: string) => boolean;
};

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Perfis",
    href: "/perfis",
    icon: Users,
    match: (p) => p === "/perfis" || p === "/perfis/novo",
  },
  // TODO: point to /perfis/[current] once the current profile is known (Phase 1).
  {
    label: "Feed",
    href: "/perfis",
    icon: LayoutGrid,
    match: (p) => /^\/perfis\/[^/]+/.test(p) && p !== "/perfis/novo",
  },
  {
    label: "Aprovações",
    href: "/aprovacoes",
    icon: CheckCircle2,
    match: (p) => p.startsWith("/aprovacoes"),
  },
];
