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
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "focus-visible:ring-ring/50 inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold outline-none focus-visible:ring-[3px]",
        pressed ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
      )}
    >
      {children}
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
        toast.success("Perfil removido");
        router.push("/perfis");
      } else {
        toast.error(res.message);
        setConfirmOpen(false);
      }
    });
  }

  return (
    <div className="mx-auto flex w-full flex-wrap items-center gap-2 md:max-w-[430px]">
      <Button
        variant="secondary"
        onClick={refresh}
        disabled={!canRefresh || pending}
        title={canRefresh ? undefined : "Configure a API da Meta para atualizar"}
      >
        <RefreshCw aria-hidden />
        Atualizar feed
      </Button>

      <div
        role="group"
        aria-label="Proporção da grade"
        className="bg-secondary flex rounded-full p-0.5"
      >
        {RATIOS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={ratio === r}
            onClick={() => changeRatio(r)}
            className={cn(
              "focus-visible:ring-ring/50 h-10 min-w-11 rounded-full px-3 text-sm font-semibold outline-none focus-visible:ring-[3px]",
              ratio === r ? "bg-primary text-primary-foreground" : "text-secondary-foreground",
            )}
          >
            {r}
          </button>
        ))}
      </div>

      <Chip pressed={clientMode} onClick={() => onClientModeChange(!clientMode)}>
        Modo cliente
      </Chip>
      {!clientMode ? (
        <Link
          href={`/perfis/${profileId}/agendadas`}
          className="bg-secondary text-secondary-foreground focus-visible:ring-ring/50 inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold outline-none focus-visible:ring-[3px]"
        >
          <CalendarClock aria-hidden className="size-4" />
          Agendadas
        </Link>
      ) : null}
      {!clientMode ? (
        <Chip pressed={selecting} onClick={() => onSelectingChange(!selecting)}>
          <CheckSquare aria-hidden className="size-4" />
          Selecionar
        </Chip>
      ) : null}
      {hasHidden && !clientMode ? (
        <Chip pressed={showHidden} onClick={() => onShowHiddenChange(!showHidden)}>
          <Eye aria-hidden className="size-4" />
          Mostrar ocultos
        </Chip>
      ) : null}

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Mais ações"
          className="bg-secondary text-secondary-foreground focus-visible:ring-ring/50 ml-auto flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-[3px]"
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
              O perfil e o feed importado deixam de aparecer neste workspace.
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
