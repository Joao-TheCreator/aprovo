"use client";

import { Check, Copy, Link2, MessageCircle, Share2, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { InitialsAvatar } from "@/components/approvals/bits";
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
import { haptic } from "@/lib/ui/haptics";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};
const canShareNow = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

function LinkBlock({
  link,
  message,
  index,
}: {
  link: IssuedLink;
  message?: string | null;
  index: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canShare = useSyncExternalStore(noopSubscribe, canShareNow, () => false);
  const [copied, setCopied] = useState(false);
  const { url } = link;
  const text = [message?.trim(), url].filter(Boolean).join("\n\n");
  const name = link.mode === "personal" ? link.recipientName : null;

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2200);
    return () => window.clearTimeout(t);
  }, [copied]);

  function markCopied() {
    setCopied(true);
    haptic("tap");
    toast.success("Link copiado");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      markCopied();
    } catch {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.select();
        el.setSelectionRange(0, url.length);
        try {
          if (document.execCommand("copy")) {
            markCopied();
            return;
          }
        } catch {
          // fall through
        }
      }
      toast.info("Link selecionado. Copie pelo menu do celular.");
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
    <li
      className="bg-card border-border shadow-card animate-rise flex flex-col gap-3 rounded-3xl border p-4"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="flex items-center gap-3">
        {name ? (
          <InitialsAvatar name={name} ring className="size-10" />
        ) : (
          <span
            aria-hidden
            className="bg-gradient-brand text-on-brand flex size-11 shrink-0 items-center justify-center rounded-full"
          >
            <Users className="size-5" />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-title truncate">{name ?? "Link aberto (para grupos)"}</p>
          <p className="text-caption text-muted-foreground flex items-center gap-1">
            <Link2 aria-hidden className="size-3.5" />
            {name ? "Link pessoal, só para essa pessoa" : "Qualquer pessoa com o link decide"}
          </p>
        </div>
      </div>
      <Input
        ref={inputRef}
        readOnly
        value={url}
        aria-label={`Link de aprovação${name ? ` de ${name}` : ""}`}
        onFocus={(e) => e.currentTarget.select()}
        className="text-muted-foreground font-mono text-sm md:text-sm"
      />
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="lg"
          variant={copied ? "success" : "default"}
          onClick={() => void copy()}
          className="px-4"
        >
          {copied ? (
            <Check aria-hidden className="animate-success-pop" strokeWidth={3} />
          ) : (
            <Copy aria-hidden />
          )}
          {copied ? "Copiado!" : "Copiar"}
        </Button>
        <Button
          asChild
          size="lg"
          variant="secondary"
          className="text-ink hover:text-ink bg-[#25D366] px-4 hover:bg-[#25D366] hover:brightness-105"
        >
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
          <Button variant="secondary" className="col-span-2" onClick={() => void share()}>
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
      <SheetContent side="bottom" className="mx-auto w-full md:max-w-[430px]">
        <SheetHeader>
          <p className="text-micro text-brand-ink uppercase">
            {links.length > 1 ? `${links.length} links prontos` : "Link pronto"}
          </p>
          <SheetTitle>Agora é só mandar</SheetTitle>
          <SheetDescription>
            {personal
              ? "Cada pessoa recebe o próprio link. Ninguém precisa de login para aprovar."
              : "Mande este link no grupo. Ninguém precisa de login para aprovar."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-3">
            {links.map((l, i) => (
              <LinkBlock key={l.linkId} link={l} message={message} index={i} />
            ))}
          </ul>
          <p className="text-caption text-muted-foreground bg-surface-2/60 rounded-2xl px-4 py-3 font-normal">
            {personal
              ? `Cada link vale para uma pessoa e se encerra sozinho quando ela terminar de decidir. Validade máxima: ${LINK_TTL_DAYS} dias.`
              : `Este link serve para quem o receber e vale por até ${LINK_TTL_DAYS} dias.`}
          </p>
          <Link
            href={`/perfis/${profileId}/aprovacoes`}
            className={cn(
              "text-brand-ink focus-visible:ring-ring flex min-h-11 items-center justify-center rounded-full text-sm font-bold underline-offset-4 outline-none hover:underline focus-visible:ring-2",
            )}
          >
            Ver envios
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
