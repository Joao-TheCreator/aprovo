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
import { LINK_TTL_DAYS, type IssuedLink } from "@/lib/approvals/contracts";

const noopSubscribe = () => () => {};
const canShareNow = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

function LinkBlock({ link, message }: { link: IssuedLink; message?: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canShare = useSyncExternalStore(noopSubscribe, canShareNow, () => false);
  const { url } = link;
  const text = [message?.trim(), url].filter(Boolean).join("\n\n");
  const name = link.mode === "personal" ? link.recipientName : null;
  const heading = name ?? "Link aberto (para grupos)";

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
      await navigator.share({
        title: "Aprovação de publicações",
        text: message?.trim() || undefined,
        url,
      });
    } catch {
      // user cancelled
    }
  }

  return (
    <li className="bg-background flex flex-col gap-2 rounded-2xl p-3">
      <p className="text-sm font-semibold">{heading}</p>
      <Input
        ref={inputRef}
        readOnly
        value={url}
        aria-label={`Link de aprovação${name ? ` de ${name}` : ""}`}
        onFocus={(e) => e.currentTarget.select()}
      />
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
    </li>
  );
}

export function ShareLinkSheet({
  open,
  onOpenChange,
  links,
  message,
  profileId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** One block per person (personal) or a single block (shared). */
  links: IssuedLink[];
  /** Optional note for the client, prepended to WhatsApp/share text. */
  message?: string | null;
  profileId: string;
}) {
  const personal = links.some((l) => l.mode === "personal");
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] w-full overflow-y-auto md:max-w-[430px]"
      >
        <SheetHeader>
          <SheetTitle>{links.length > 1 ? "Links de aprovação" : "Link de aprovação"}</SheetTitle>
          <SheetDescription>
            {personal
              ? "Envie cada link para a pessoa indicada. Ninguém precisa de login para aprovar."
              : "Envie este link ao grupo. Ninguém precisa de login para aprovar."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-3">
            {links.map((l) => (
              <LinkBlock key={l.linkId} link={l} message={message} />
            ))}
          </ul>
          <p className="text-muted-foreground text-sm">
            {personal
              ? `Cada link vale para uma pessoa e se encerra sozinho quando ela terminar de decidir. Validade máxima: ${LINK_TTL_DAYS} dias.`
              : `Este link serve para quem o receber e vale por até ${LINK_TTL_DAYS} dias.`}
          </p>
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
