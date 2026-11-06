"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deleteAccountAction } from "./actions";

export function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setText("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive">Excluir conta</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir conta?</DialogTitle>
          <DialogDescription>Esta ação é definitiva e não pode ser desfeita.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 text-sm">
          <p>
            <strong>O que é removido:</strong> seu acesso, seu workspace, a conexão com o Instagram
            e as mídias (originais, prévias e cache).
          </p>
          <p>
            <strong>O que é mantido:</strong> registros de aprovação (decisões e comentários dos
            aprovadores) ficam anonimizados por até 5 anos, como prova.
          </p>
          <label htmlFor="confirm-delete" className="font-medium">
            Digite EXCLUIR para confirmar
          </label>
          <Input
            id="confirm-delete"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={pending || text !== "EXCLUIR"}
            onClick={() => start(() => deleteAccountAction())}
          >
            {pending ? "Excluindo…" : "Excluir definitivamente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
