"use client";

import { Copy, MessageCircle, Share2 } from "lucide-react";
import Link from "next/link";
import { useRef, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LINK_TTL_DAYS } from "@/lib/approvals/contracts";

const noopSubscribe = () => () => {};
const canShareNow = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

export function ShareLinkSheet({
  open,
  onOpenChange,
  url,
  message,
  profileId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  /** Optional note for the client, prepended to WhatsApp/share text. */
  message?: string | null;
  profileId: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canShare = useSyncExternalStore(noopSubscribe, canShareNow, () => false);
  const text = [message?.trim(), url].filter(Boolean).join("\n\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.select();
        el.setSelectionRange(0, url.length);
        try {
          if (document.execCommand("copy")) {
            toast.success("Link copiado");
            return;
          }
        } catch {
          // fall through
        }
      }
      toast.info("Link selecionado. Use o menu do celular para copiar.");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "Aprovação de publicações", text: message?.trim() || undefined, url });
    } catch {
      // user cancelled
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full md:max-w-[430px]">
        <SheetHeader>
          <SheetTitle>Link de aprovação</SheetTitle>
          <SheetDescription>
            Envie este link ao cliente. Ele não precisa de login para aprovar.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3">
          <Input
            ref={inputRef}
            readOnly
            value={url}
            aria-label="Link de aprovação"
            onFocus={(e) => e.currentTarget.select()}
          />
          <p className="text-muted-foreground text-sm">Válido por {LINK_TTL_DAYS} dias</p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={copy}>
              <Copy aria-hidden />
              Copiar
            </Button>
            <Button asChild variant="success">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(text)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle aria-hidden />
                WhatsApp
              </a>
            </Button>
            {canShare ? (
              <Button variant="secondary" className="col-span-2" onClick={share}>
                <Share2 aria-hidden />
                Compartilhar
              </Button>
            ) : null}
          </div>
          <Link
            href={`/perfis/${profileId}/aprovacoes`}
            className="text-roxo focus-visible:ring-ring/50 flex min-h-11 items-center justify-center rounded-full text-sm font-semibold underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
          >
            Ver envios
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
