"use client";

import { Clapperboard, ImagePlus, Loader2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { PhoneFrame } from "@/components/app/PhoneFrame";
import { MediaStrip, type StripItem } from "@/components/media/MediaStrip";
import { PosterPicker } from "@/components/media/PosterPicker";
import { Button } from "@/components/ui/button";
import { uploadFile, UploadError, validateFile } from "@/lib/media/client-upload";
import { CAROUSEL_MAX, UPLOAD_ERROR_MESSAGES } from "@/lib/media/contracts";
import { createPost } from "@/lib/posts/actions";
import type { PostKind } from "@/lib/posts/contracts";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  file: File;
  previewUrl: string;
  isVideo: boolean;
  status: StripItem["status"];
  progress: number;
  error?: string;
  retryable: boolean;
  assetId?: string;
  durationSec?: number;
  posterTime: number;
};

export function NewPostFlow({ profileId, kind }: { profileId: string; kind: PostKind }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const posterTimes = useRef(new Map<string, number>());
  const urls = useRef(new Set<string>());
  const autoOpened = useRef(false);

  const isVideo = kind === "video";
  const max = isVideo ? 1 : CAROUSEL_MAX;
  const feedHref = `/perfis/${profileId}`;

  const patch = useCallback((id: string, p: Partial<Item>) => {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i)));
  }, []);

  const start = useCallback(
    async (item: Item) => {
      const ctrl = new AbortController();
      controllers.current.set(item.id, ctrl);
      patch(item.id, { status: "uploading", progress: 0, error: undefined, retryable: true });
      try {
        const res = await uploadFile({
          profileId,
          file: item.file,
          kind: item.isVideo ? "video" : "image",
          signal: ctrl.signal,
          onProgress: (progress, phase) =>
            patch(item.id, {
              progress,
              status: phase === "uploading" ? "uploading" : "processing",
            }),
          onMeta: (m) => patch(item.id, { durationSec: m.durationMs / 1000 }),
          posterTime: () => posterTimes.current.get(item.id) ?? 0.5,
        });
        patch(item.id, {
          assetId: res.assetId,
          progress: 1,
          status: res.status === "ready" ? "ready" : "processing",
        });
      } catch (err) {
        if (err instanceof UploadError && err.code === "aborted") return;
        const e = err instanceof UploadError ? err : null;
        patch(item.id, {
          status: "error",
          error: e?.message ?? "Não foi possível enviar o arquivo.",
          retryable: !e?.permanent,
        });
      } finally {
        controllers.current.delete(item.id);
      }
    },
    [patch, profileId],
  );

  function addFiles(list: FileList | File[]) {
    const files = Array.from(list);
    const room = max - items.length;
    if (room <= 0) return;
    if (files.length > room) {
      toast.error(
        isVideo ? "Um vídeo por publicação." : `No máximo ${CAROUSEL_MAX} mídias por post.`,
      );
    }
    const fresh: Item[] = [];
    for (const file of files.slice(0, room)) {
      const code = validateFile(file, isVideo ? "video" : "image");
      if (code) {
        toast.error(`${file.name}: ${UPLOAD_ERROR_MESSAGES[code]}`);
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      urls.current.add(previewUrl);
      fresh.push({
        id: crypto.randomUUID(),
        file,
        previewUrl,
        isVideo,
        status: "uploading",
        progress: 0,
        retryable: true,
        posterTime: 0.5,
      });
    }
    if (!fresh.length) return;
    setItems((cur) => [...cur, ...fresh]);
    fresh.forEach((i) => void start(i));
  }

  // Open the native picker right away (browsers may block it without a user gesture;
  // the visible button is the fallback).
  useEffect(() => {
    if (autoOpened.current) return;
    autoOpened.current = true;
    inputRef.current?.click();
  }, []);

  useEffect(() => {
    const ctrls = controllers.current;
    const objectUrls = urls.current;
    return () => {
      ctrls.forEach((c) => c.abort());
      objectUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  function remove(id: string) {
    controllers.current.get(id)?.abort();
    setItems((cur) => {
      const it = cur.find((i) => i.id === id);
      if (it) {
        URL.revokeObjectURL(it.previewUrl);
        urls.current.delete(it.previewUrl);
      }
      return cur.filter((i) => i.id !== id);
    });
  }

  function retry(id: string) {
    const it = items.find((i) => i.id === id);
    if (it) void start(it);
  }

  const canAdvance =
    items.length > 0 &&
    items.every((i) => (i.status === "processing" || i.status === "ready") && i.assetId);

  function advance() {
    startTransition(async () => {
      const res = await createPost({
        profileId,
        kind,
        assetIds: items.map((i) => i.assetId as string),
      });
      if (res.ok) router.push(`/perfis/${profileId}/posts/${res.data.postId}/editar`);
      else toast.error(res.message);
    });
  }

  const stripItems: StripItem[] = items.map((i) => ({
    id: i.id,
    src: i.isVideo ? null : i.previewUrl,
    videoSrc: i.isVideo ? i.previewUrl : null,
    status: i.status,
    progress: i.progress,
    error: i.error,
    canRetry: i.retryable,
    locked: false,
  }));
  const uploadingVideo = items.find((i) => i.isVideo && i.status === "uploading" && i.durationSec);

  return (
    <PhoneFrame
      className="flex flex-col gap-4"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      <h1 className="font-display text-h1">{isVideo ? "Novo vídeo" : "Novo post"}</h1>

      <input
        ref={inputRef}
        type="file"
        hidden
        multiple={!isVideo}
        accept={isVideo ? "video/mp4,video/quicktime" : "image/*"}
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {items.length === 0 ? (
        <div
          className={cn(
            "relative isolate flex flex-col items-center gap-4 overflow-hidden rounded-4xl border-2 border-dashed p-8 text-center transition-colors duration-(--ap-dur-fast)",
            dragOver ? "border-brand-ink bg-brand-soft" : "border-border bg-card",
          )}
        >
          <span
            aria-hidden
            className="bg-glow pointer-events-none absolute -top-24 left-1/2 -z-10 size-56 -translate-x-1/2 rounded-full opacity-60 blur-3xl"
          />
          <span
            aria-hidden
            className="bg-gradient-brand text-on-brand shadow-glow flex size-16 items-center justify-center rounded-3xl"
          >
            {isVideo ? (
              <Clapperboard className="size-8" strokeWidth={2} />
            ) : (
              <UploadCloud className="size-8" strokeWidth={2} />
            )}
          </span>
          <p className="text-body text-muted-foreground hidden md:block">
            Arraste os arquivos aqui ou
          </p>
          <Button onClick={() => inputRef.current?.click()}>
            <ImagePlus aria-hidden />
            Escolher da galeria
          </Button>
          <p className="text-caption text-muted-foreground font-medium">
            {isVideo
              ? "MP4 ou MOV, até 300 MB e 90 s."
              : `JPG, PNG, WebP ou HEIC, até 30 MB. Até ${CAROUSEL_MAX} fotos.`}
          </p>
        </div>
      ) : (
        <section
          aria-label="Mídias selecionadas"
          className={cn(
            "border-border shadow-card rounded-3xl border p-4 transition-colors duration-(--ap-dur-fast)",
            dragOver ? "bg-brand-soft" : "bg-card",
          )}
        >
          <MediaStrip
            items={stripItems}
            onReorder={(ids) =>
              setItems((cur) => ids.map((id) => cur.find((i) => i.id === id) as Item))
            }
            onRemove={remove}
            onRetry={retry}
            onAdd={items.length < max ? () => inputRef.current?.click() : undefined}
            addLabel="Adicionar mais mídias"
          />
          <p className="text-caption text-muted-foreground font-medium">
            {isVideo
              ? "Um vídeo por publicação."
              : `${items.length}/${CAROUSEL_MAX} · arraste para reordenar.`}
          </p>
        </section>
      )}

      {uploadingVideo?.durationSec ? (
        <div className="bg-card border-border shadow-card rounded-3xl border p-4">
          <PosterPicker
            src={uploadingVideo.previewUrl}
            durationSec={uploadingVideo.durationSec}
            value={uploadingVideo.posterTime}
            onChange={(t) => {
              posterTimes.current.set(uploadingVideo.id, t);
              patch(uploadingVideo.id, { posterTime: t });
            }}
          />
          <p className="text-caption text-muted-foreground mt-1 font-medium">
            A capa é escolhida enquanto o vídeo é enviado.
          </p>
        </div>
      ) : null}

      <div className="glass shadow-sheet sticky bottom-[calc(var(--app-nav-offset,5.25rem)+0.75rem)] z-10 flex gap-2 rounded-4xl border border-white/10 p-2 md:bottom-6">
        <Button variant="outline" className="flex-1" onClick={() => router.push(feedHref)}>
          Cancelar
        </Button>
        <Button className="flex-1" disabled={!canAdvance || pending} onClick={advance}>
          {pending ? <Loader2 aria-hidden className="motion-safe:animate-spin" /> : null}
          Avançar
        </Button>
      </div>
    </PhoneFrame>
  );
}
