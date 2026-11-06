"use client";

import { Bookmark, Heart, MessageCircle, MoreHorizontal, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { PhoneFrame } from "@/components/app/PhoneFrame";
import { StatusPill } from "@/components/feed/StatusPill";
import { CropEditor } from "@/components/media/CropEditor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { archivePost, deletePost } from "@/lib/posts/actions";
import type { PostDetail } from "@/lib/posts/contracts";

function formatScheduled(d: Date | string): string {
  const date = new Date(d);
  const day = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(
    date,
  );
  return `${day} às ${time}`;
}

function Carousel({ post }: { post: PostDetail }) {
  const [index, setIndex] = useState(0);
  const ref = useRef<HTMLUListElement>(null);
  return (
    <div className="relative">
      <ul
        ref={ref}
        aria-label="Mídias da publicação"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto motion-safe:scroll-smooth [&::-webkit-scrollbar]:hidden"
      >
        {post.media.map((m, i) => {
          const src = m.previewUrl ?? m.thumbUrl;
          return (
            <li
              key={m.assetId}
              className="flex w-full shrink-0 snap-center items-center justify-center bg-neutral-100"
              aria-label={`Mídia ${i + 1} de ${post.media.length}`}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  alt=""
                  width={m.width ?? undefined}
                  height={m.height ?? undefined}
                  loading={i === 0 ? "eager" : "lazy"}
                  className="max-h-[75dvh] w-full object-contain"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center text-sm text-neutral-500">
                  Processando…
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {post.media.length > 1 ? (
        <>
          <span className="absolute top-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            {index + 1}/{post.media.length}
          </span>
          <div aria-hidden className="flex justify-center gap-1 pt-2">
            {post.media.map((m, i) => (
              <span
                key={m.assetId}
                className={`size-1.5 rounded-full ${i === index ? "bg-[#0095F6]" : "bg-neutral-300"}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Caption({ post }: { post: PostDetail }) {
  const [expanded, setExpanded] = useState(false);
  const caption = post.caption ?? "";
  const long = caption.length > 100 || caption.includes("\n");
  if (!caption && post.hashtags.length === 0) return null;
  return (
    <div className="px-3 text-sm leading-[18px]">
      {caption ? (
        <p className={expanded ? "whitespace-pre-line" : "line-clamp-2 whitespace-pre-line"}>
          <span className="font-bold">@{post.profile.igUsername}</span> {caption}
        </p>
      ) : null}
      {long && !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="min-h-11 text-neutral-500 outline-none focus-visible:underline"
        >
          mais
        </button>
      ) : null}
      {post.hashtags.length ? (
        <p className="text-[#00376B]">{post.hashtags.map((t) => `#${t}`).join(" ")}</p>
      ) : null}
    </div>
  );
}

export function PostDetailView({ post }: { post: PostDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const feedHref = `/perfis/${post.profileId}`;
  const video = post.kind === "video" ? post.media[0] : null;
  const archived = post.archivedAt !== null;

  function toggleArchive() {
    startTransition(async () => {
      const res = await archivePost(post.id, !archived);
      if (res.ok) {
        toast.success(archived ? "Publicação de volta na grade" : "Publicação arquivada");
        router.refresh();
      } else toast.error(res.message);
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deletePost(post.id);
      if (res.ok) {
        toast.success("Publicação excluída");
        router.push(feedHref);
      } else {
        toast.error(res.message);
        setConfirmDelete(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <PhoneFrame className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={post.status} />
          {archived ? (
            <span className="bg-secondary text-secondary-foreground rounded-full px-2.5 py-1 text-xs font-semibold">
              Arquivada
            </span>
          ) : null}
        </div>
        {post.lastClientComment ? (
          <div role="status" className="bg-lavanda rounded-2xl p-3 text-sm">
            <p className="text-roxo font-semibold">Comentário do cliente</p>
            <p className="whitespace-pre-line">{post.lastClientComment}</p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/perfis/${post.profileId}/posts/${post.id}/editar`}>Editar</Link>
          </Button>
          <Button variant="secondary" disabled title="Disponível na Fase 4">
            Enviar para aprovação
          </Button>
          <Button variant="outline" disabled title="Disponível na Fase 4">
            Copiar link
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Mais ações"
              className="bg-secondary text-secondary-foreground focus-visible:ring-ring/50 flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-[3px]"
            >
              <MoreHorizontal aria-hidden className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {post.kind === "post" && post.media[0] ? (
                <DropdownMenuItem onSelect={() => setCropOpen(true)}>
                  Editar enquadramento
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={toggleArchive} disabled={pending}>
                {archived ? "Desarquivar" : "Arquivar"}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PhoneFrame>

      <PhoneFrame className="font-instagram border-border overflow-hidden bg-white pb-4 text-black md:rounded-2xl md:border">
        <div className="flex h-14 items-center gap-3 px-3">
          {post.profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.profile.avatarUrl}
              alt=""
              className="size-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div aria-hidden className="size-8 shrink-0 rounded-full bg-neutral-300" />
          )}
          <span className="flex-1 truncate text-sm font-bold">{post.profile.igUsername}</span>
          <MoreHorizontal aria-hidden className="size-5" />
        </div>

        {video ? (
          <video
            controls
            playsInline
            preload="metadata"
            poster={video.posterUrl ?? undefined}
            src={video.originalUrl ?? undefined}
            className="max-h-[75dvh] w-full bg-black"
          />
        ) : (
          <Carousel post={post} />
        )}

        <div aria-hidden className="flex items-center gap-4 px-3 py-3">
          <Heart className="size-6" strokeWidth={1.75} />
          <MessageCircle className="size-6" strokeWidth={1.75} />
          <Send className="size-6" strokeWidth={1.75} />
          <Bookmark className="ml-auto size-6" strokeWidth={1.75} />
        </div>

        <Caption post={post} />
        {post.scheduledFor ? (
          <p className="px-3 pt-1 text-xs text-neutral-500" suppressHydrationWarning>
            Data prevista: {formatScheduled(post.scheduledFor)}
          </p>
        ) : null}
      </PhoneFrame>

      {cropOpen && post.media[0] ? (
        <CropEditor
          open
          onOpenChange={(o) => {
            if (!o) setCropOpen(false);
          }}
          postId={post.id}
          media={post.media}
          assetId={post.media[0].assetId}
          ratio={post.profile.gridRatio}
        />
      ) : null}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir publicação?</DialogTitle>
            <DialogDescription>
              A publicação e as mídias enviadas deixam de aparecer no feed. Esta ação não pode ser
              desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={pending} onClick={remove}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
