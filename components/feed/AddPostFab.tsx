"use client";

import { ChevronRight, Clapperboard, Grid3x3, Plus, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { cardVariants } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { haptic } from "@/lib/ui/haptics";
import { cn } from "@/lib/utils";

const OPTIONS: { kind: "post" | "video"; title: string; subtitle: string; icon: LucideIcon }[] = [
  { kind: "post", title: "Post", subtitle: "Foto ou carrossel de até 10", icon: Grid3x3 },
  { kind: "video", title: "Vídeo", subtitle: "Um vídeo de até 90 s", icon: Clapperboard },
];

/** Floating "+" that opens the "Adicionar" bottom sheet (Tela 03, step 1; docs/14 FAB). */
export function AddPostFab({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Adicionar publicação"
        aria-expanded={open}
        onClick={() => {
          haptic("tap");
          setOpen(true);
        }}
        className="press bg-gradient-brand text-on-brand shadow-glow focus-visible:ring-ring focus-visible:ring-offset-background fixed right-4 bottom-[calc(var(--app-nav-offset,5.25rem)+0.75rem)] z-20 flex size-14 items-center justify-center rounded-full outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-offset-2 md:right-8 md:bottom-8"
      >
        <Plus
          aria-hidden
          className={cn(
            "ease-spring size-7 transition-transform duration-(--ap-dur-base)",
            open && "rotate-45",
          )}
          strokeWidth={2.5}
        />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="mx-auto w-full md:max-w-[430px]">
          <SheetHeader>
            <SheetTitle>Adicionar</SheetTitle>
            <SheetDescription>O que você quer publicar?</SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3">
            {OPTIONS.map(({ kind, title, subtitle, icon: Icon }, i) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(`/perfis/${profileId}/posts/novo?kind=${kind}`);
                }}
                style={{ animationDelay: `${i * 40}ms` }}
                className={cn(
                  cardVariants({ variant: "default", interactive: true }),
                  "animate-rise focus-visible:ring-offset-background min-h-40 items-start justify-between gap-6 text-left focus-visible:ring-offset-2",
                )}
              >
                <span className="flex w-full items-start justify-between">
                  <span
                    aria-hidden
                    className="bg-gradient-brand text-on-brand shadow-glow flex size-12 items-center justify-center rounded-2xl"
                  >
                    <Icon className="size-6" strokeWidth={2} />
                  </span>
                  <ChevronRight aria-hidden className="text-muted-foreground size-5" />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="font-display text-h2">{title}</span>
                  <span className="text-muted-foreground text-caption font-medium">{subtitle}</span>
                </span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
