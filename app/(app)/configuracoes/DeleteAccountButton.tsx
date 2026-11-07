"use client";

import { Trash2 } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deleteAccountAction } from "./actions";

export function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const confirmed = text.trim().toUpperCase() === "EXCLUIR";
  function run() {
    start(async () => {
      const res = await deleteAccountAction();
      if (res.ok) {
        router.replace("/entrar?deleted=1");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setText("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" className="self-start">
          <Trash2 aria-hidden />
          Excluir conta
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir conta?</DialogTitle>
          <DialogDescription>Esta ação é definitiva e não pode ser desfeita.</DialogDescription>
        </DialogHeader>
        <div className="text-body flex flex-col gap-3">
          <p>
            <strong>O que é removido:</strong> seu acesso, seu workspace, a conexão com o Instagram
            e as mídias (originais, prévias e cache).
          </p>
          <p>
            <strong>O que é mantido:</strong> registros de aprovação (decisões e comentários dos
            aprovadores) ficam anonimizados por até 5 anos, como prova.
          </p>
          <label htmlFor="confirm-delete" className="text-caption mt-1">
            Digite EXCLUIR para confirmar
          </label>
          <Input
            id="confirm-delete"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={pending || !confirmed} onClick={run}>
            {pending ? "Excluindo…" : "Excluir definitivamente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
