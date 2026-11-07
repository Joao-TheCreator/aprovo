"use client";

import { AlertCircle, Camera, Loader2, Plus, RotateCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { completeUpload } from "@/lib/media/actions";
import { UploadError, uploadFile } from "@/lib/media/client-upload";
import { manualImport } from "@/lib/profiles/actions";
import { MANUAL_IMPORT_MAX_IMAGES as MAX_IMAGES } from "@/lib/profiles/contracts";
import { cn } from "@/lib/utils";

type Defaults = {
  displayName: string;
  biography: string;
  externalUrl: string;
  postsCount: number | null;
  followersCount: number | null;
  followingCount: number | null;
};

type Phase = "uploading" | "processing" | "ready" | "error";

type Pick = {
  id: string;
  file: File;
  src: string;
  phase: Phase;
  progress: number;
  assetId?: string;
  error?: string;
};

const READY_TIMEOUT_MS = 30_000;
const READY_POLL_MS = 1_500;
const PARALLEL_UPLOADS = 3;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Uploads straight to storage; resolves with the asset id once processing says `ready`. */
async function uploadImage(
  profileId: string,
  file: File,
  onProgress: (fraction: number, phase: Phase) => void,
  signal: AbortSignal,
): Promise<string> {
  const res = await uploadFile({
    profileId,
    file,
    kind: "image",
    signal,
    onProgress: (f, p) => onProgress(f, p === "uploading" ? "uploading" : "processing"),
  });
  let status = res.status;
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (status !== "ready") {
    if (status === "failed" || Date.now() > deadline) {
      throw new UploadError(
        "processing_failed",
        "Essa foto demorou demais para ficar pronta. Tente de novo.",
      );
    }
    await wait(READY_POLL_MS);
    const again = await completeUpload({ assetId: res.assetId });
    if (!again.ok) throw new UploadError(again.code, again.message);
    status = again.data.status;
  }
  return res.assetId;
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function Overlay({ pick, size }: { pick: Pick; size: "sm" | "lg" }) {
  if (pick.phase === "ready") return null;
  const pct = Math.round(pick.progress * 100);
  const icon = size === "lg" ? "size-6" : "size-5";
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center gap-0.5 p-1 text-center text-white",
        pick.phase === "error" ? "bg-danger/85" : "bg-black/45",
      )}
    >
      {pick.phase === "uploading" ? (
        <span className="text-xs font-bold">{pct}%</span>
      ) : pick.phase === "processing" ? (
        <Loader2 aria-hidden className={cn(icon, "animate-spin motion-reduce:animate-none")} />
      ) : (
        <>
          <AlertCircle aria-hidden className={icon} />
          <span className="line-clamp-3 text-[10px] leading-3">{pick.error}</span>
        </>
      )}
    </div>
  );
}

function statusLabel(pick: Pick): string {
  if (pick.phase === "uploading") return `Enviando ${Math.round(pick.progress * 100)}%`;
  if (pick.phase === "processing") return "Processando";
  if (pick.phase === "error") return `Erro: ${pick.error ?? ""}`;
  return "Pronta";
}

function RemoveButton({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "focus-visible:ring-ring absolute z-10 flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-2",
        className,
      )}
    >
      <span className="flex size-6 items-center justify-center rounded-full border border-white/15 bg-black/70 text-white backdrop-blur-md">
        <X aria-hidden className="size-4" />
      </span>
    </button>
  );
}

export function ManualImportForm({
  profileId,
  defaults,
}: {
  profileId: string;
  defaults: Defaults;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [avatar, setAvatar] = useState<Pick | null>(null);
  const [images, setImages] = useState<Pick[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const urls = useRef(new Set<string>());
  const queue = useRef<(() => Promise<void>)[]>([]);
  const running = useRef(0);

  useEffect(() => {
    const ctrls = controllers.current;
    const objectUrls = urls.current;
    return () => {
      ctrls.forEach((c) => c.abort());
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const patch = useCallback((id: string, change: Partial<Pick>) => {
    const apply = (p: Pick) => (p.id === id ? { ...p, ...change } : p);
    setImages((list) => list.map(apply));
    setAvatar((a) => (a ? apply(a) : a));
  }, []);

  function pump() {
    while (running.current < PARALLEL_UPLOADS && queue.current.length > 0) {
      const job = queue.current.shift()!;
      running.current++;
      void job().finally(() => {
        running.current--;
        pump();
      });
    }
  }

  function start(pick: Pick) {
    const ctrl = new AbortController();
    controllers.current.set(pick.id, ctrl);
    patch(pick.id, { phase: "uploading", progress: 0, error: undefined });
    queue.current.push(async () => {
      if (ctrl.signal.aborted) return;
      try {
        const assetId = await uploadImage(
          profileId,
          pick.file,
          (progress, phase) => patch(pick.id, { progress, phase }),
          ctrl.signal,
        );
        patch(pick.id, { phase: "ready", progress: 1, assetId });
      } catch (e) {
        if (ctrl.signal.aborted) return;
        patch(pick.id, {
          phase: "error",
          error: e instanceof Error ? e.message : "Não foi possível enviar a foto.",
        });
      }
    });
    pump();
  }

  function makePick(file: File): Pick {
    const src = URL.createObjectURL(file);
    urls.current.add(src);
    return { id: crypto.randomUUID(), file, src, phase: "uploading", progress: 0 };
  }

  function dispose(pick: Pick) {
    controllers.current.get(pick.id)?.abort();
    controllers.current.delete(pick.id);
    URL.revokeObjectURL(pick.src);
    urls.current.delete(pick.src);
  }

  function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (avatar) dispose(avatar);
    const pick = makePick(file);
    setAvatar(pick);
    start(pick);
  }

  function onImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const room = MAX_IMAGES - images.length;
    if (files.length > room) toast.message(`Cabem só ${MAX_IMAGES} fotos. Pegamos as primeiras.`);
    const picks = files.slice(0, Math.max(0, room)).map(makePick);
    if (picks.length === 0) return;
    setImages((list) => [...list, ...picks]);
    picks.forEach(start);
  }

  function removeImage(pick: Pick) {
    dispose(pick);
    setImages((list) => list.filter((p) => p.id !== pick.id));
  }

  function removeAvatar() {
    if (avatar) dispose(avatar);
    setAvatar(null);
  }

  const all = avatar ? [avatar, ...images] : images;
  const busy = all.some((p) => p.phase === "uploading" || p.phase === "processing");
  const hasError = all.some((p) => p.phase === "error");

  function num(form: FormData, key: string): number | undefined {
    const v = String(form.get(key) ?? "").trim();
    return v === "" ? undefined : Number(v);
  }

  function text(form: FormData, key: string): string | undefined {
    const v = String(form.get(key) ?? "").trim();
    return v === "" ? undefined : v;
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (hasError) {
      toast.error("Tem foto com erro. Tente de novo ou remova antes de importar.");
      return;
    }
    const form = new FormData(e.currentTarget);
    const input = {
      displayName: text(form, "displayName"),
      biography: text(form, "biography"),
      externalUrl: text(form, "externalUrl"),
      postsCount: num(form, "postsCount"),
      followersCount: num(form, "followersCount"),
      followingCount: num(form, "followingCount"),
      avatarAssetId: avatar?.assetId,
      imageAssetIds: images.flatMap((p) => (p.assetId ? [p.assetId] : [])),
    };
    startTransition(async () => {
      const res = await manualImport(profileId, input);
      if (res.ok) {
        toast.success("Feed importado");
        router.push(`/perfis/${profileId}`);
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit}>
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <label
            htmlFor="avatar"
            className="border-brand-ink/40 bg-brand-soft/60 text-brand-ink hover:bg-brand-soft focus-within:ring-ring focus-within:ring-offset-background press relative flex size-28 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed focus-within:ring-2 focus-within:ring-offset-2"
          >
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar.src}
                alt="Foto de perfil escolhida"
                className="size-full object-cover"
              />
            ) : (
              <span className="flex flex-col items-center gap-1 text-xs font-bold">
                <Camera aria-hidden className="size-6" />
                Foto de perfil
              </span>
            )}
            {avatar ? <Overlay pick={avatar} size="lg" /> : null}
            <input
              id="avatar"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={onAvatar}
            />
          </label>
          {avatar ? (
            <RemoveButton
              label="Remover foto de perfil"
              onClick={removeAvatar}
              className="-top-1 -right-1"
            />
          ) : null}
        </div>
        {avatar?.phase === "error" ? (
          <button
            type="button"
            onClick={() => start(avatar)}
            className="text-danger-ink focus-visible:ring-ring flex min-h-11 items-center gap-1 rounded-full px-3 text-xs font-bold outline-none focus-visible:ring-2"
          >
            <RotateCw aria-hidden className="size-3.5" />
            Tentar de novo
          </button>
        ) : null}
      </div>

      <Field id="displayName" label="Nome">
        <Input
          id="displayName"
          name="displayName"
          defaultValue={defaults.displayName}
          maxLength={80}
        />
      </Field>
      <Field id="biography" label="Bio">
        <Textarea
          id="biography"
          name="biography"
          defaultValue={defaults.biography}
          maxLength={300}
          rows={4}
        />
      </Field>
      <Field id="externalUrl" label="Link">
        <Input
          id="externalUrl"
          name="externalUrl"
          type="url"
          inputMode="url"
          autoCapitalize="none"
          defaultValue={defaults.externalUrl}
          placeholder="https://"
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field id="postsCount" label="Posts">
          <Input
            id="postsCount"
            name="postsCount"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={defaults.postsCount ?? ""}
          />
        </Field>
        <Field id="followersCount" label="Seguidores">
          <Input
            id="followersCount"
            name="followersCount"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={defaults.followersCount ?? ""}
          />
        </Field>
        <Field id="followingCount" label="Seguindo">
          <Input
            id="followingCount"
            name="followingCount"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={defaults.followingCount ?? ""}
          />
        </Field>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="feed-photos">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="feed-photos" className="font-display text-h2">
            Fotos do feed
          </h2>
          <span className="text-caption text-muted-foreground">
            {images.length}/{MAX_IMAGES}
          </span>
        </div>
        <p className="text-caption text-muted-foreground">
          A primeira foto fica no topo do feed. Remova as que não quiser.
        </p>
        <ul className="grid grid-cols-3 gap-2">
          {images.map((pick, i) => (
            <li key={pick.id} className="relative">
              <div
                role="img"
                aria-label={`Foto ${i + 1}. ${statusLabel(pick)}`}
                className={cn(
                  "bg-surface-2 relative aspect-square overflow-hidden rounded-2xl",
                  pick.phase === "error" && "ring-danger-ink ring-2",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pick.src} alt="" className="size-full object-cover" />
                <Overlay pick={pick} size="sm" />
              </div>
              {pick.phase === "error" ? (
                <button
                  type="button"
                  onClick={() => start(pick)}
                  className="text-danger-ink focus-visible:ring-ring flex min-h-11 w-full items-center justify-center gap-1 rounded-full text-xs font-bold outline-none focus-visible:ring-2"
                >
                  <RotateCw aria-hidden className="size-3.5" />
                  Tentar de novo
                </button>
              ) : null}
              <RemoveButton
                label={`Remover foto ${i + 1}`}
                onClick={() => removeImage(pick)}
                className="-top-2 -right-2"
              />
            </li>
          ))}
          {images.length < MAX_IMAGES ? (
            <li>
              <label
                htmlFor="images"
                className="border-brand-ink/40 text-brand-ink bg-brand-soft/60 hover:bg-brand-soft focus-within:ring-ring focus-within:ring-offset-background press flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed text-xs font-bold focus-within:ring-2 focus-within:ring-offset-2"
              >
                <Plus aria-hidden className="size-6" />
                Adicionar
                <input
                  id="images"
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={onImages}
                />
              </label>
            </li>
          ) : null}
        </ul>
      </section>

      <Button type="submit" size="lg" disabled={pending || busy}>
        {pending ? "Importando…" : busy ? "Enviando fotos…" : "Importar"}
      </Button>
    </form>
  );
}
