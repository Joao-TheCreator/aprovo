"use client";

import { Unplug } from "lucide-react";
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
import { disconnectInstagram } from "./actions";

export function DisconnectButton({
  connectionId,
  username,
}: {
  connectionId: string;
  username: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="hover:border-danger-ink hover:text-danger-ink">
          <Unplug aria-hidden />
          Desconectar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desconectar @{username}?</DialogTitle>
          <DialogDescription>
            A conta @{username} deixa de ser usada para carregar feeds. Os perfis e posts já
            importados continuam no APROVO.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => start(() => disconnectInstagram(connectionId))}
          >
            {pending ? "Desconectando…" : "Desconectar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
