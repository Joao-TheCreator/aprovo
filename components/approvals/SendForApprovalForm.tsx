"use client";

import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PhoneFrame } from "@/components/app/PhoneFrame";
import { ShareLinkSheet } from "@/components/approvals/ShareLinkSheet";
import { StatusPill } from "@/components/feed/StatusPill";
import { CroppedImage } from "@/components/media/CroppedImage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createApprovalRequest } from "@/lib/approvals/actions";
import { APPROVAL_ERROR_MESSAGES } from "@/lib/approvals/contracts";
import { shortCaption } from "@/lib/approvals/ui-format";
import type { GridCrop, GridRatio, PostStatus } from "@/lib/profiles/contracts";
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
  const [issued, setIssued] = useState<string | null>(null);

  const listHref = `/perfis/${profileId}/aprovacoes`;
  const aspect = ratio === "3:4" ? "aspect-[3/4]" : "aspect-square";

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (selected.size === 0) {
      setError("Selecione ao menos uma publicação.");
      return;
    }
    startTransition(async () => {
      const res = await createApprovalRequest({
        profileId,
        postIds: candidates.filter((c) => selected.has(c.id)).map((c) => c.id),
        title: title.trim() || undefined,
        message: message.trim() || undefined,
        label: label.trim() || undefined,
      });
      if (res.ok) setIssued(res.data.url);
      else setError(APPROVAL_ERROR_MESSAGES[res.code] ?? res.message);
    });
  }

  return (
    <PhoneFrame className="flex flex-col gap-5 pb-8">
      <div>
        <Link
          href={`/perfis/${profileId}`}
          className="text-roxo focus-visible:ring-ring/50 inline-flex min-h-11 items-center rounded text-sm font-semibold outline-none focus-visible:ring-[3px]"
        >
          ← @{igUsername}
        </Link>
        <h1 className="text-2xl leading-8 font-bold">Enviar para aprovação</h1>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">
            Publicações ({selected.size} selecionada{selected.size === 1 ? "" : "s"})
          </legend>
          {candidates.length === 0 ? (
            <p className="bg-card border-border rounded-2xl border p-4 text-sm">
              Não há rascunhos nem publicações com ajustes para enviar.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {candidates.map((c) => {
                const checked = selected.has(c.id);
                return (
                  <li key={c.id}>
                    <label
                      className={cn(
                        "bg-card flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border p-2 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                        checked ? "border-roxo" : "border-border",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(c.id)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                          checked ? "bg-roxo border-roxo text-white" : "border-border bg-white",
                        )}
                      >
                        {checked ? <Check className="size-4" strokeWidth={3} /> : null}
                      </span>
                      <span className="w-14 shrink-0 overflow-hidden rounded-lg">
                        {c.thumbUrl ? (
                          <CroppedImage
                            src={c.thumbUrl}
                            crop={c.gridCrop}
                            ratio={ratio}
                            className={aspect}
                          />
                        ) : (
                          <span className={cn("block bg-neutral-200", aspect)} />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                        <span className="line-clamp-2 text-sm">{shortCaption(c.caption, 90)}</span>
                        <StatusPill status={c.status} />
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>

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
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ap-label">Nome do link</Label>
          <Input
            id="ap-label"
            value={label}
            maxLength={80}
            placeholder="WhatsApp do Carlos"
            onChange={(e) => setLabel(e.target.value)}
            aria-describedby="ap-label-help"
          />
          <p id="ap-label-help" className="text-muted-foreground text-xs">
            Só você vê este nome. Ajuda a saber quem abriu cada link.
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-destructive text-sm font-semibold">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending || candidates.length === 0}>
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
          Gerar link
        </Button>
      </form>

      {issued ? (
        <ShareLinkSheet
          open
          onOpenChange={(o) => {
            if (!o) router.push(listHref);
          }}
          url={issued}
          message={message}
          profileId={profileId}
        />
      ) : null}
    </PhoneFrame>
  );
}
