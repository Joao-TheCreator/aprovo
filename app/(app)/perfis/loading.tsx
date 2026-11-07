"use client";

import { usePathname } from "next/navigation";

import { CardsPageSkeleton, ProfilesListSkeleton } from "@/components/app/PageSkeletons";

/**
 * This boundary also covers nested routes (/perfis/[id]/...) that have no loading.tsx of
 * their own, so only the list itself gets the list-shaped skeleton.
 */
export default function PerfisLoading() {
  const pathname = usePathname();
  if (pathname === "/perfis") return <ProfilesListSkeleton />;
  return <CardsPageSkeleton label="Carregando…" cards={1} />;
}
