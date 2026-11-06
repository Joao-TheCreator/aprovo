"use client";

import { Clapperboard, Grid3x3, Plus, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const OPTIONS: { kind: "post" | "video"; title: string; subtitle: string; icon: LucideIcon }[] = [
  { kind: "post", title: "Post", subtitle: "Foto ou carrossel de até 10", icon: Grid3x3 },
  { kind: "video", title: "Vídeo", subtitle: "Um vídeo de até 90 s", icon: Clapperboard },
];

/** Floating "+" that opens the "Adicionar" bottom sheet (Tela 03, step 1). */
export function AddPostFab({ profileId }: { profileId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Adicionar publicação"
        onClick={() => setOpen(true)}
        className="bg-primary text-primary-foreground focus-visible:ring-ring/50 fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 flex size-14 items-center justify-center rounded-full shadow-lg outline-none focus-visible:ring-[3px] md:right-8 md:bottom-8"
      >
        <Plus aria-hidden className="size-7" strokeWidth={2.25} />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="mx-auto w-full md:max-w-[430px]">
          <SheetHeader>
            <SheetTitle>Adicionar</SheetTitle>
            <SheetDescription>O que você quer publicar?</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {OPTIONS.map(({ kind, title, subtitle, icon: Icon }) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(`/perfis/${profileId}/posts/novo?kind=${kind}`);
                }}
                className="bg-secondary focus-visible:ring-ring/50 flex min-h-16 items-center gap-4 rounded-2xl p-4 text-left outline-none focus-visible:ring-[3px]"
              >
                <span className="bg-primary text-primary-foreground flex size-11 shrink-0 items-center justify-center rounded-full">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span className="flex flex-col">
                  <span className="text-base font-bold">{title}</span>
                  <span className="text-muted-foreground text-sm">{subtitle}</span>
                </span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
