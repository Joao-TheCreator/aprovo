"use client";

import { ArrowLeft, Check, Link2, Loader2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PhoneFrame } from "@/components/app/PhoneFrame";
import { RecipientsField, newRecipientRow } from "@/components/approvals/RecipientsField";
import { ShareLinkSheet } from "@/components/approvals/ShareLinkSheet";
import { StatusPill } from "@/components/feed/StatusPill";
import { CroppedImage } from "@/components/media/CroppedImage";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createApprovalRequest } from "@/lib/approvals/actions";
import { APPROVAL_ERROR_MESSAGES, type IssuedLink } from "@/lib/approvals/contracts";
import { shortCaption } from "@/lib/approvals/ui-format";
import type { GridCrop, GridRatio, PostStatus } from "@/lib/profiles/contracts";
import { haptic } from "@/lib/ui/haptics";
import { cn } from "@/lib/utils";

export type CandidatePost = {
  id: string;
  thumbUrl: string | null;
  caption: string | null;
  status: PostStatus;
  gridCrop: GridCrop | null;
};

export function SendForApprovalForm({
  profileId,
  igUsername,
  ratio,
  candidates,
  preselected,
}: {
  profileId: string;
  igUsername: string;
  ratio: GridRatio;
  candidates: CandidatePost[];
  preselected: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(preselected));
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState(() => [newRecipientRow()]);
  const [shared, setShared] = useState(false);
  const [issued, setIssued] = useState<IssuedLink[] | null>(null);

  const listHref = `/perfis/${profileId}/aprovacoes`;
  const aspect = ratio === "3:4" ? "aspect-[3/4]" : "aspect-square";
  const allSelected = candidates.length > 0 && selected.size === candidates.length;

  function toggle(id: string) {
    haptic("tap");
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(candidates.map((c) => c.id)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (selected.size === 0) {
      setError("Escolha pelo menos uma publicação.");
      haptic("error");
      return;
    }
    const named = recipients
      .map((r) => ({ name: r.name.trim(), contact: r.contact.trim() }))
      .filter((r) => r.name || r.contact);
    if (!shared && (named.length === 0 || named.some((r) => !r.name))) {
      setError("Falta o nome de quem vai aprovar.");
      haptic("error");
      return;
    }
    startTransition(async () => {
      const res = await createApprovalRequest({
        profileId,
        postIds: candidates.filter((c) => selected.has(c.id)).map((c) => c.id),
        title: title.trim() || undefined,
        message: message.trim() || undefined,
        label: shared ? label.trim() || undefined : undefined,
        mode: shared ? "shared" : "personal",
        recipients: shared
          ? []
          : named.map((r) => ({ name: r.name, contact: r.contact || undefined })),
      });
      if (res.ok) {
        haptic("success");
        setIssued(res.data.links);
      } else {
        haptic("error");
        setError(APPROVAL_ERROR_MESSAGES[res.code] ?? res.message);
      }
    });
  }

  return (
    <PhoneFrame className="flex flex-col gap-6 pb-8">
      <div className="flex flex-col gap-2">
        <Link
          href={`/perfis/${profileId}`}
          className="text-brand-ink focus-visible:ring-ring -ml-1 inline-flex min-h-11 items-center gap-1 self-start rounded-full px-1 text-sm font-bold outline-none focus-visible:ring-2"
        >
          <ArrowLeft aria-hidden className="size-4" />@{igUsername}
        </Link>
        <h1 className="font-display text-h1 text-balance">Enviar para aprovação</h1>
        <p className="text-body text-muted-foreground">
          Escolha os posts, diga para quem e gere o link. O cliente decide sem login.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-3">
          <legend className="text-title">Publicações</legend>
          <div className="-mt-2 flex items-center justify-between gap-2">
            <p className="text-caption text-muted-foreground" aria-live="polite">
              {selected.size} selecionada{selected.size === 1 ? "" : "s"}
            </p>
            {candidates.length > 1 ? (
              <button
                type="button"
                onClick={toggleAll}
                className="text-brand-ink focus-visible:ring-ring min-h-11 rounded-full px-2 text-sm font-bold outline-none focus-visible:ring-2"
              >
                {allSelected ? "Limpar" : "Marcar todas"}
              </button>
            ) : null}
          </div>
          {candidates.length === 0 ? (
            <p className="bg-card border-border text-body rounded-3xl border border-dashed p-5">
              Nada pronto pra enviar. Rascunhos e posts com ajustes aparecem aqui.
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {candidates.map((c, i) => {
                const checked = selected.has(c.id);
                return (
                  <li
                    key={c.id}
                    className="animate-rise"
                    style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                  >
                    <label
                      className={cn(
                        "press has-[:focus-visible]:ring-ring relative block cursor-pointer overflow-hidden rounded-2xl has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2",
                        checked ? "shadow-glow" : "",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(c.id)}
                        className="sr-only"
                      />
                      <span className="sr-only">{shortCaption(c.caption, 90)}</span>
                      <span className={cn("bg-surface-2 block", aspect)}>
                        {c.thumbUrl ? (
                          <CroppedImage
                            src={c.thumbUrl}
                            crop={c.gridCrop}
                            ratio={ratio}
                            className={cn(
                              "transition-opacity duration-(--ap-dur-fast)",
                              aspect,
                              !checked && selected.size > 0 && "opacity-70",
                            )}
                          />
                        ) : null}
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          "pointer-events-none absolute inset-0 rounded-2xl transition-[box-shadow] duration-(--ap-dur-fast)",
                          checked ? "ring-brand-ink ring-[3px] ring-inset" : "",
                        )}
                      />
                      <span
                        aria-hidden
                        className={cn(
                          "absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full border-2 transition-colors duration-(--ap-dur-fast)",
                          checked
                            ? "bg-gradient-brand text-on-brand animate-pop-in border-transparent"
                            : "border-white/90 bg-black/30",
                        )}
                      >
                        {checked ? <Check className="size-4" strokeWidth={3} /> : null}
                      </span>
                      <span className="absolute bottom-1.5 left-1.5">
                        <StatusPill
                          status={c.status}
                          variant="overlay"
                          className="px-2 py-0.5 text-[10px] leading-4"
                        />
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>

        <Card className="gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ap-title">Título</Label>
            <Input
              id="ap-title"
              value={title}
              maxLength={120}
              placeholder="Posts de novembro"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ap-message">Recado para o cliente</Label>
            <Textarea
              id="ap-message"
              value={message}
              maxLength={1000}
              rows={3}
              placeholder="Oi! Separei os posts da semana. Me conta o que achou."
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </Card>

        <section aria-labelledby="ap-who" className="flex flex-col gap-3">
          <h2 id="ap-who" className="text-title">
            Para quem?
          </h2>
          <label className="bg-card border-border has-[:focus-visible]:ring-ring group flex min-h-16 cursor-pointer items-center gap-3 rounded-3xl border p-4 has-[:focus-visible]:ring-2">
            <span
              aria-hidden
              className="bg-brand-soft text-brand-ink flex size-10 shrink-0 items-center justify-center rounded-full"
            >
              {shared ? <Users className="size-5" /> : <Link2 className="size-5" />}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-body font-semibold">Link aberto (para grupos)</span>
              <span className="text-caption text-muted-foreground font-normal">
                Um link só, para quem tiver ele. Não se encerra ao decidir.
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={shared}
              onChange={(e) => setShared(e.target.checked)}
              className="sr-only"
            />
            <span
              aria-hidden
              className="bg-outline-strong/50 group-has-[:checked]:bg-gradient-brand relative h-7 w-12 shrink-0 rounded-full transition-colors duration-(--ap-dur-fast)"
            >
              <span className="ease-spring absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform duration-(--ap-dur-fast) group-has-[:checked]:translate-x-5" />
            </span>
          </label>

          {shared ? (
            <div className="animate-rise flex flex-col gap-1.5">
              <Label htmlFor="ap-label">Nome do link</Label>
              <Input
                id="ap-label"
                value={label}
                maxLength={80}
                placeholder="Grupo do cliente"
                onChange={(e) => setLabel(e.target.value)}
                aria-describedby="ap-label-help"
              />
              <p id="ap-label-help" className="text-caption text-muted-foreground font-normal">
                Só você vê este nome. Ajuda a saber quem abriu o link.
              </p>
            </div>
          ) : (
            <RecipientsField
              rows={recipients}
              onChange={setRecipients}
              idPrefix="ap-rcpt"
              hideLegend
            />
          )}
        </section>

        {error ? (
          <p
            role="alert"
            className="text-danger-ink bg-surface-2 text-body rounded-2xl px-4 py-3 font-semibold"
          >
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending || candidates.length === 0}>
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Link2 aria-hidden />}
          {!shared && recipients.length > 1 ? "Gerar links" : "Gerar link"}
        </Button>
      </form>

      {issued ? (
        <ShareLinkSheet
          open
          onOpenChange={(o) => {
            if (!o) router.push(listHref);
          }}
          links={issued}
          message={message}
          profileId={profileId}
        />
      ) : null}
    </PhoneFrame>
  );
}
