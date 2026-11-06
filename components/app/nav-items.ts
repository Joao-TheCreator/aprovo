import { CheckCircle2, LayoutGrid, Users, type LucideIcon } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  match: (p: string) => boolean;
};

/** The "Feed" item links to the last opened profile (cookie `aprovo_last_profile`) when known. */
export function getNavItems(lastProfileId?: string | null): NavItem[] {
  return NAV_ITEMS.map((item) =>
    item.label === "Feed" && lastProfileId
      ? { ...item, href: `/perfis/${encodeURIComponent(lastProfileId)}` }
      : item,
  );
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Perfis",
    href: "/perfis",
    icon: Users,
    match: (p) => p === "/perfis" || p === "/perfis/novo",
  },
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
