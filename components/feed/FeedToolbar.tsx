"use client";

import { CalendarClock, CheckSquare, Eye, MoreHorizontal, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { GridRatio } from "@/lib/profiles/contracts";
import { refreshProfile, removeProfile, updateGridRatio } from "@/lib/profiles/actions";
import { cn } from "@/lib/utils";

const RATIOS: GridRatio[] = ["1:1", "3:4"];

/** Chip shell shared by toolbar toggles and links (docs/14: rail of pills, active in gradient). */
export const chipClass = (active = false) =>
  cn(
    "press focus-visible:ring-ring focus-visible:ring-offset-background inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-caption font-bold whitespace-nowrap outline-none transition-[background-color,color,box-shadow] duration-(--ap-dur-fast) focus-visible:ring-2 focus-visible:ring-offset-2 [&_svg]:size-4 [&_svg]:shrink-0",
    active
      ? "bg-gradient-brand text-on-brand shadow-glow"
      : "bg-surface-2 text-foreground hover:bg-brand-soft hover:text-brand-ink",
  );

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={chipClass(pressed)}>
      {children}
    </button>
  );
}

/** "Modo cliente": glass toggle with a tiny switch knob (still a pressed-state button). */
function ClientModeToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={cn(
        "press glass focus-visible:ring-ring focus-visible:ring-offset-background text-caption inline-flex h-11 shrink-0 items-center gap-2.5 rounded-full border pr-4 pl-1.5 font-bold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        on ? "border-brand-ink/50 text-brand-ink" : "text-foreground border-white/10",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative flex h-8 w-13 items-center rounded-full p-1 transition-colors duration-(--ap-dur-fast)",
          on ? "bg-gradient-brand shadow-glow" : "bg-surface-2",
        )}
      >
        <span
          className={cn(
            "ease-spring flex size-6 items-center justify-center rounded-full shadow-sm transition-transform duration-(--ap-dur-fast)",
            on ? "bg-on-brand text-brand translate-x-5" : "bg-outline-strong text-surface",
          )}
        >
          <Eye className="size-3.5" strokeWidth={2.5} />
        </span>
      </span>
      Modo cliente
    </button>
  );
}

export function FeedToolbar({
  profileId,
  ratio,
  onRatioChange,
  canRefresh,
  clientMode,
  onClientModeChange,
  hasHidden,
  showHidden,
  onShowHiddenChange,
  selecting,
  onSelectingChange,
}: {
  profileId: string;
  ratio: GridRatio;
  onRatioChange: (r: GridRatio) => void;
  canRefresh: boolean;
  clientMode: boolean;
  onClientModeChange: (v: boolean) => void;
  hasHidden: boolean;
  showHidden: boolean;
  onShowHiddenChange: (v: boolean) => void;
  selecting: boolean;
  onSelectingChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function refresh() {
    startTransition(async () => {
      const res = await refreshProfile(profileId, { force: true });
      if (res.ok) toast.success(`Feed atualizado (${res.data.imported} publicações)`);
      else toast.error(res.message);
      router.refresh();
    });
  }

  function changeRatio(next: GridRatio) {
    if (next === ratio) return;
    const prev = ratio;
    onRatioChange(next);
    startTransition(async () => {
      const res = await updateGridRatio(profileId, next);
      if (!res.ok) {
        onRatioChange(prev);
        toast.error(res.message);
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await removeProfile(profileId);
      if (res.ok) {
        toast.success(
          res.data.mode === "soft"
            ? "Perfil removido. O histórico de aprovações fica guardado."
            : "Perfil removido",
        );
        router.push("/perfis");
      } else {
        toast.error(res.message);
        setConfirmOpen(false);
      }
    });
  }

  return (
    <div className="mx-auto flex w-full items-center gap-2 md:max-w-[430px]">
      <div className="-my-1 flex min-w-0 flex-1 snap-x [scrollbar-width:none] items-center gap-2 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] py-1 pr-6 [&::-webkit-scrollbar]:hidden">
        <ClientModeToggle on={clientMode} onChange={onClientModeChange} />
        {!clientMode ? (
          <Link href={`/perfis/${profileId}/agendadas`} className={chipClass()}>
            <CalendarClock aria-hidden />
            Agendadas
          </Link>
        ) : null}
        {!clientMode ? (
          <Chip pressed={selecting} onClick={() => onSelectingChange(!selecting)}>
            <CheckSquare aria-hidden />
            Selecionar
          </Chip>
        ) : null}
        {hasHidden && !clientMode ? (
          <Chip pressed={showHidden} onClick={() => onShowHiddenChange(!showHidden)}>
            <Eye aria-hidden />
            Mostrar ocultos
          </Chip>
        ) : null}
        <div
          role="group"
          aria-label="Proporção da grade"
          className="bg-surface-2 flex h-11 shrink-0 items-center rounded-full p-1"
        >
          {RATIOS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={ratio === r}
              onClick={() => changeRatio(r)}
              className={cn(
                "focus-visible:ring-ring text-caption relative h-9 min-w-11 rounded-full px-3 font-bold transition-[background-color,color] duration-(--ap-dur-fast) outline-none after:absolute after:-inset-1 after:content-[''] focus-visible:ring-2",
                ratio === r
                  ? "bg-gradient-brand text-on-brand"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={!canRefresh || pending}
          title={canRefresh ? undefined : "Configure a API da Meta para atualizar"}
          className={cn(chipClass(), "disabled:pointer-events-none disabled:opacity-45")}
        >
          <RefreshCw aria-hidden className={cn(pending && "motion-safe:animate-spin")} />
          Atualizar feed
        </button>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Mais ações"
          className="press glass focus-visible:ring-ring flex size-11 shrink-0 items-center justify-center rounded-full border border-white/10 outline-none focus-visible:ring-2"
        >
          <MoreHorizontal aria-hidden className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/perfis/${profileId}/importar`}>Importar manualmente</Link>
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
            Remover perfil
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover perfil?</DialogTitle>
            <DialogDescription>
              O perfil e o feed importado deixam de aparecer neste workspace. Se já houver decisões
              de aprovação de clientes, o histórico delas fica guardado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={pending} onClick={remove}>
              Remover perfil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
