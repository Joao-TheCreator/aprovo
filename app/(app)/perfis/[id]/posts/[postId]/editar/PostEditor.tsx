"use client";

import { AlertTriangle, CalendarDays, ChevronDown, Loader2, StickyNote } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { PhoneFrame } from "@/components/app/PhoneFrame";
import { ClientComment } from "@/components/feed/ClientComment";
import { StatusPill } from "@/components/feed/StatusPill";
import { CropEditor } from "@/components/media/CropEditor";
import { CroppedImage } from "@/components/media/CroppedImage";
import { HashtagInput } from "@/components/media/HashtagInput";
import { MediaStrip, type StripItem } from "@/components/media/MediaStrip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadFile, UploadError, validateFile } from "@/lib/media/client-upload";
import { CAROUSEL_MAX, UPLOAD_ERROR_MESSAGES } from "@/lib/media/contracts";
import { updatePost, updatePostMedia } from "@/lib/posts/actions";
import type { PostDetail, PostMediaItem } from "@/lib/posts/contracts";
import { cn } from "@/lib/utils";

const CAPTION_MAX = 2200;

type Draft = {
  caption: string;
  hashtags: string[];
  notes: string;
  scheduledFor: string;
  savedAt: number;
};

/** Date → value for <input type="datetime-local"> in local time. */
function toLocalInput(d: Date | string | null): string {
  if (!d) return "";
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

type Pending = {
  id: string;
  src: string;
  progress: number;
  status: StripItem["status"];
  error?: string;
};

/** Live caption counter: a ring that fills up, amber near the limit and red at it. */
function CaptionCounter({ length, max }: { length: number; max: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const ratio = Math.min(1, length / max);
  const near = length > max - 100;
  const full = length >= max;
  const tone = full ? "text-danger-ink" : near ? "text-warning-ink" : "text-brand-ink";
  return (
    <p
      id="caption-count"
      aria-live="polite"
      className={cn(
        "text-caption flex items-center gap-2 tabular-nums",
        near ? tone : "text-muted-foreground",
      )}
    >
      <svg viewBox="0 0 24 24" className={cn("size-6 -rotate-90", tone)} aria-hidden>
        <circle cx="12" cy="12" r={r} fill="none" strokeWidth="3" className="stroke-surface-2" />
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          className="transition-[stroke-dashoffset] duration-(--ap-dur-base)"
        />
      </svg>
      {length}/{max}
    </p>
  );
}

export function PostEditor({ post }: { post: PostDetail }) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [caption, setCaption] = useState(post.caption ?? "");
  const [hashtags, setHashtags] = useState(post.hashtags);
  const [notes, setNotes] = useState(post.notes ?? "");
  const [scheduled, setScheduled] = useState(toLocalInput(post.scheduledFor));
  const [cropAsset, setCropAsset] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<Pending[]>([]);
  const [local, setLocal] = useState<{ base: PostMediaItem[]; list: PostMediaItem[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const draftKey = `aprovo:post-draft:${post.id}`;
  const restored = useRef(false);
  // Notes start open only when there is something in them (collapsible section).
  const [notesInitiallyOpen] = useState(() => Boolean(post.notes));

  // Local media order overrides the server list only until the server list changes (refresh).
  const media = local && local.base === post.media ? local.list : post.media;
  const isVideo = post.kind === "video";
  const ratio = post.profile.gridRatio;
  const anyNotReady = media.some((m) => m.status !== "ready") || pendingUploads.length > 0;
  const canSend =
    (post.status === "draft" || post.status === "changes_requested") &&
    media.length > 0 &&
    !anyNotReady;
  const hasProcessing = media.some((m) => m.status === "uploading" || m.status === "processing");

  // Poll while the backend is still processing derivatives.
  useEffect(() => {
    if (!hasProcessing) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [hasProcessing, router]);

  // Restore a newer local draft (offline note in docs/04).
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw) as Draft;
      if (d.savedAt > new Date(post.updatedAt).getTime()) {
        queueMicrotask(() => {
          setCaption(d.caption);
          setHashtags(d.hashtags);
          setNotes(d.notes);
          setScheduled(d.scheduledFor);
          toast.info("Rascunho local restaurado");
        });
      }
    } catch {
      // storage unavailable
    }
  }, [draftKey, post.updatedAt]);

  // Autosave to localStorage (debounced) once something differs from the server copy.
  useEffect(() => {
    if (!restored.current) return;
    const dirty =
      caption !== (post.caption ?? "") ||
      notes !== (post.notes ?? "") ||
      scheduled !== toLocalInput(post.scheduledFor) ||
      hashtags.join(" ") !== post.hashtags.join(" ");
    if (!dirty) return;
    const t = setTimeout(() => {
      try {
        const draft: Draft = {
          caption,
          hashtags,
          notes,
          scheduledFor: scheduled,
          savedAt: Date.now(),
        };
        localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch {
        // ignore
      }
    }, 600);
    return () => clearTimeout(t);
  }, [caption, hashtags, notes, scheduled, draftKey, post]);

  const stripItems: StripItem[] = [
    ...media.map<StripItem>((m) => ({
      id: m.assetId,
      src: (isVideo ? m.posterUrl : null) ?? m.thumbUrl ?? m.previewUrl,
      crop: isVideo ? null : m.gridCrop,
      status: m.status === "failed" ? "error" : m.status === "ready" ? "ready" : "processing",
      error: m.status === "failed" ? UPLOAD_ERROR_MESSAGES.processing_failed : undefined,
      canRetry: false,
      removable: !isVideo && media.length > 1,
    })),
    ...pendingUploads.map<StripItem>((p) => ({
      id: p.id,
      src: p.src,
      status: p.status,
      progress: p.progress,
      error: p.error,
      canRetry: false,
      removable: p.status === "error",
      locked: true,
    })),
  ];

  async function persistMedia(list: PostMediaItem[]) {
    const previous = media;
    setLocal({ base: post.media, list });
    const res = await updatePostMedia({
      postId: post.id,
      items: list.map((m) => ({ assetId: m.assetId, gridCrop: m.gridCrop })),
    });
    if (res.ok) router.refresh();
    else {
      setLocal({ base: post.media, list: previous });
      toast.error(res.message);
    }
  }

  function reorder(ids: string[]) {
    const byId = new Map(media.map((m) => [m.assetId, m]));
    const next = ids.flatMap((id) => (byId.has(id) ? [byId.get(id) as PostMediaItem] : []));
    if (next.length === media.length) void persistMedia(next);
  }

  function remove(id: string) {
    if (pendingUploads.some((p) => p.id === id)) {
      setPendingUploads((cur) => cur.filter((p) => p.id !== id));
      return;
    }
    if (media.length <= 1) return;
    void persistMedia(media.filter((m) => m.assetId !== id));
  }

  async function addFiles(files: File[]) {
    const room = CAROUSEL_MAX - media.length - pendingUploads.length;
    if (files.length > room) toast.error(`No máximo ${CAROUSEL_MAX} mídias por post.`);
    const accepted = files.slice(0, Math.max(0, room)).filter((f) => {
      const code = validateFile(f, "image");
      if (code) toast.error(`${f.name}: ${UPLOAD_ERROR_MESSAGES[code]}`);
      return !code;
    });
    await Promise.all(
      accepted.map(async (file) => {
        const id = crypto.randomUUID();
        const src = URL.createObjectURL(file);
        const upd = (p: Partial<Pending>) =>
          setPendingUploads((cur) => cur.map((x) => (x.id === id ? { ...x, ...p } : x)));
        setPendingUploads((cur) => [...cur, { id, src, progress: 0, status: "uploading" }]);
        try {
          const res = await uploadFile({
            profileId: post.profileId,
            file,
            kind: "image",
            onProgress: (progress, phase) =>
              upd({ progress, status: phase === "uploading" ? "uploading" : "processing" }),
          });
          const items = [
            ...media.map((m) => ({ assetId: m.assetId, gridCrop: m.gridCrop })),
            { assetId: res.assetId, gridCrop: null },
          ];
          const saved = await updatePostMedia({ postId: post.id, items });
          if (!saved.ok) throw new UploadError("save", saved.message);
          setPendingUploads((cur) => cur.filter((x) => x.id !== id));
          router.refresh();
        } catch (err) {
          upd({
            status: "error",
            error: err instanceof Error ? err.message : "Falha no envio.",
          });
        } finally {
          URL.revokeObjectURL(src);
        }
      }),
    );
  }

  function save() {
    startSave(async () => {
      const res = await updatePost({
        postId: post.id,
        caption,
        hashtags,
        notes,
        scheduledFor: scheduled ? new Date(scheduled).toISOString() : null,
      });
      if (res.ok) {
        try {
          localStorage.removeItem(draftKey);
        } catch {
          // ignore
        }
        toast.success("Rascunho salvo");
        router.push(`/perfis/${post.profileId}/posts/${post.id}`);
      } else toast.error(res.message);
    });
  }

  const first = media[0];
  const previewSrc = first ? ((isVideo ? first.posterUrl : null) ?? first.thumbUrl) : null;
  const cellAspect = ratio === "3:4" ? "aspect-[3/4]" : "aspect-square";

  return (
    <PhoneFrame className="flex flex-col gap-5 pb-44 md:pb-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-h2">Editar publicação</h1>
        <StatusPill status={post.status} />
      </div>

      {post.status === "approved" ? (
        <p
          role="status"
          className="border-warning/40 bg-warning/10 text-body flex items-center gap-3 rounded-3xl border p-4 font-semibold"
        >
          <span
            aria-hidden
            className="bg-warning text-ink flex size-9 shrink-0 items-center justify-center rounded-2xl"
          >
            <AlertTriangle className="size-4.5" strokeWidth={2.25} />
          </span>
          Editar vai exigir nova aprovação.
        </p>
      ) : null}
      {post.status === "changes_requested" && post.lastClientComment ? (
        <ClientComment comment={post.lastClientComment} />
      ) : null}

      <section
        aria-label="Mídias"
        className="bg-card border-border shadow-card rounded-3xl border p-4"
      >
        <MediaStrip
          items={stripItems}
          ratio={ratio}
          onReorder={reorder}
          onRemove={remove}
          onSelect={(id) => {
            if (!isVideo && media.some((m) => m.assetId === id)) setCropAsset(id);
          }}
          onAdd={
            !isVideo && stripItems.length < CAROUSEL_MAX
              ? () => fileRef.current?.click()
              : undefined
          }
          addLabel="Adicionar mais fotos"
        />
        <p className="text-caption text-muted-foreground font-medium">
          {isVideo
            ? "Vídeo único. A capa é o frame escolhido no envio."
            : "Toque numa foto para ajustar o enquadramento na grade."}
        </p>
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          accept="image/*"
          onChange={(e) => {
            if (e.target.files) void addFiles(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      </section>

      <div className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-2">
          <Label htmlFor="caption">Legenda</Label>
          <CaptionCounter length={caption.length} max={CAPTION_MAX} />
        </div>
        <Textarea
          id="caption"
          value={caption}
          maxLength={CAPTION_MAX}
          rows={6}
          placeholder="Escreva a legenda do post"
          onChange={(e) => setCaption(e.target.value)}
          aria-describedby="caption-count"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="hashtags">Hashtags</Label>
        <HashtagInput id="hashtags" value={hashtags} onChange={setHashtags} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="scheduled">Data prevista</Label>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <CalendarDays
              aria-hidden
              className="text-brand-ink pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2"
            />
            <Input
              id="scheduled"
              type="datetime-local"
              value={scheduled}
              onChange={(e) => setScheduled(e.target.value)}
              className="pl-12"
            />
          </div>
          <Button variant="ghost" onClick={() => setScheduled("")} disabled={!scheduled}>
            Limpar
          </Button>
        </div>
      </div>

      <details
        open={notesInitiallyOpen}
        className="group bg-surface-2/60 border-border rounded-3xl border"
      >
        <summary className="focus-visible:ring-ring flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-3xl px-4 outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
          <StickyNote aria-hidden className="text-brand-ink size-5" />
          <span className="text-title flex-1">Observações internas</span>
          {notes ? <span aria-hidden className="bg-brand-ink size-2 rounded-full" /> : null}
          <ChevronDown
            aria-hidden
            className="text-muted-foreground ease-spring size-5 transition-transform duration-(--ap-dur-fast) group-open:rotate-180"
          />
        </summary>
        <div className="flex flex-col gap-1.5 px-4 pb-4">
          <Label htmlFor="notes" className="sr-only">
            Observações internas
          </Label>
          <Textarea
            id="notes"
            value={notes}
            maxLength={2000}
            rows={3}
            onChange={(e) => setNotes(e.target.value)}
            aria-describedby="notes-help"
          />
          <p id="notes-help" className="text-caption text-muted-foreground font-medium">
            Não aparece para o cliente
          </p>
        </div>
      </details>

      <section aria-labelledby="feed-preview-title" className="flex flex-col gap-3">
        <h2 id="feed-preview-title" className="text-title">
          Como fica no feed
        </h2>
        {/* Instagram simulation: light island so it looks like the app in dark mode too. */}
        <div
          data-theme="light"
          className="shadow-card mx-auto w-full max-w-[330px] overflow-hidden rounded-3xl border border-neutral-200 bg-white p-2"
        >
          <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-2xl">
            {Array.from({ length: 9 }).map((_, i) =>
              i === 0 && previewSrc ? (
                <div key={i} className="relative">
                  <CroppedImage
                    src={previewSrc}
                    crop={isVideo ? null : first?.gridCrop}
                    ratio={ratio}
                    className={cellAspect}
                  />
                  <span
                    aria-hidden
                    className="ring-brand-ink pointer-events-none absolute inset-0 ring-2 ring-inset"
                  />
                </div>
              ) : (
                <div key={i} aria-hidden className={cn("bg-neutral-100", cellAspect)} />
              ),
            )}
          </div>
        </div>
      </section>

      <div className="fixed inset-x-3 bottom-[calc(var(--app-nav-offset,5.25rem)+0.75rem)] z-20 md:sticky md:inset-x-auto md:bottom-6">
        <div className="glass shadow-sheet mx-auto flex w-full gap-2 rounded-4xl border border-white/10 p-2 md:max-w-[430px]">
          <Button variant="secondary" className="flex-1" onClick={save} disabled={saving}>
            {saving ? <Loader2 aria-hidden className="motion-safe:animate-spin" /> : null}
            Salvar rascunho
          </Button>
          {canSend ? (
            <Button asChild className="flex-1">
              <Link href={`/perfis/${post.profileId}/aprovacoes/novo?posts=${post.id}`}>
                Enviar para aprovação
              </Link>
            </Button>
          ) : post.status === "pending_approval" ? (
            <Button asChild variant="outline" className="flex-1">
              <Link href={`/perfis/${post.profileId}/aprovacoes`}>Ver envio</Link>
            </Button>
          ) : (
            <Button
              className="flex-1"
              disabled
              title={anyNotReady ? "Aguarde o processamento das mídias" : "Publicação já aprovada"}
            >
              Enviar para aprovação
            </Button>
          )}
        </div>
      </div>

      {cropAsset ? (
        <CropEditor
          open
          onOpenChange={(o) => {
            if (!o) setCropAsset(null);
          }}
          postId={post.id}
          media={media}
          assetId={cropAsset}
          ratio={ratio}
        />
      ) : null}
    </PhoneFrame>
  );
}
