"use client";

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

/** Fixed bar shown while multi-selecting planned posts (above the mobile nav). */
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
        className="border-border bg-card fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t shadow-lg md:bottom-0 md:left-auto md:mx-auto"
      >
        <div className="mx-auto flex max-w-[430px] flex-wrap items-center gap-2 px-4 py-3">
          <p className="mr-auto text-sm font-semibold" aria-live="polite">
            {n} {n === 1 ? "selecionada" : "selecionadas"}
          </p>
          {none ? (
            <Button size="sm" disabled>
              Enviar para aprovação
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link href={`/perfis/${profileId}/aprovacoes/novo?posts=${selectedIds.join(",")}`}>
                Enviar para aprovação
              </Link>
            </Button>
          )}
          <Button size="sm" variant="secondary" disabled={none || pending} onClick={onArchive}>
            Arquivar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={none || pending}
            onClick={() => setConfirmOpen(true)}
          >
            Excluir
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
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
