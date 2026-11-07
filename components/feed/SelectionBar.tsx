"use client";

import { Archive, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Floating glass bar shown while multi-selecting planned posts (above the mobile nav). */
export function SelectionBar({
  profileId,
  selectedIds,
  pending,
  onArchive,
  onDelete,
  onCancel,
}: {
  profileId: string;
  selectedIds: string[];
  pending: boolean;
  onArchive: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const n = selectedIds.length;
  const none = n === 0;
  return (
    <>
      <div
        role="region"
        aria-label="Ações da seleção"
        className="animate-sheet-in fixed inset-x-3 bottom-[calc(var(--app-nav-offset,5.25rem)+0.75rem)] z-40 md:inset-x-0 md:bottom-6"
      >
        <div className="glass shadow-sheet mx-auto flex max-w-[430px] flex-col gap-3 rounded-3xl border border-white/10 p-3">
          <div className="flex items-center gap-3 px-1">
            <p className="mr-auto flex items-baseline gap-2" aria-live="polite">
              <span className="font-display text-h2 tabular-nums">{n}</span>
              <span className="text-caption text-muted-foreground">
                {n === 1 ? "selecionada" : "selecionadas"}
              </span>
            </p>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
          <div className="flex gap-2">
            {none ? (
              <Button size="sm" className="flex-1" disabled>
                Enviar para aprovação
              </Button>
            ) : (
              <Button asChild size="sm" className="flex-1">
                <Link href={`/perfis/${profileId}/aprovacoes/novo?posts=${selectedIds.join(",")}`}>
                  Enviar para aprovação
                </Link>
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={none || pending}
              onClick={onArchive}
              aria-label="Arquivar"
            >
              <Archive aria-hidden />
              <span className="max-[380px]:sr-only">Arquivar</span>
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={none || pending}
              onClick={() => setConfirmOpen(true)}
              aria-label="Excluir"
            >
              <Trash2 aria-hidden />
              <span className="max-[380px]:sr-only">Excluir</span>
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Excluir {n} {n === 1 ? "publicação" : "publicações"}?
            </DialogTitle>
            <DialogDescription>Essa ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setConfirmOpen(false);
                onDelete();
              }}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
