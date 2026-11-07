"use client";

import { ArrowRight, ExternalLink, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { StatusPill } from "@/components/feed/StatusPill";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { FeedItem } from "@/lib/profiles/contracts";
import { setImportedPostHidden } from "@/lib/profiles/actions";

export function PostSheet({
  item,
  profileId,
  onClose,
}: {
  item: FeedItem | null;
  profileId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggleHidden(hidden: boolean) {
    if (!item) return;
    startTransition(async () => {
      const res = await setImportedPostHidden(item.id, hidden);
      if (res.ok) {
        toast.success(hidden ? "Publicação oculta da grade" : "Publicação de volta na grade");
        onClose();
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <Sheet open={item !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent side="bottom" className="mx-auto w-full overflow-y-auto md:max-w-[430px]">
        {item?.kind === "imported" ? (
          <>
            <SheetHeader>
              <SheetTitle>Publicação importada</SheetTitle>
              <SheetDescription>
                {item.publishedAt
                  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(
                      new Date(item.publishedAt),
                    )
                  : "Sem data"}
              </SheetDescription>
            </SheetHeader>
            {item.thumbUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.thumbUrl}
                alt=""
                className="bg-surface-2 max-h-[50dvh] w-full rounded-3xl object-contain"
              />
            ) : null}
            {item.caption ? <p className="text-body whitespace-pre-line">{item.caption}</p> : null}
            {item.permalink ? (
              <Button asChild variant="outline">
                <a href={item.permalink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden />
                  Abrir no Instagram
                </a>
              </Button>
            ) : null}
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => toggleHidden(!item.isHidden)}
            >
              {item.isHidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
              {item.isHidden ? "Mostrar na grade" : "Ocultar da grade"}
            </Button>
          </>
        ) : item ? (
          <>
            <SheetHeader>
              <SheetTitle>Publicação planejada</SheetTitle>
              <SheetDescription>
                {item.postKind === "video" ? "Vídeo" : "Post"}
                {item.mediaCount > 1 ? ` · ${item.mediaCount} fotos` : ""}
              </SheetDescription>
            </SheetHeader>
            <StatusPill status={item.status} className="self-start" />
            {item.caption ? (
              <p className="text-body line-clamp-4 whitespace-pre-line">{item.caption}</p>
            ) : null}
            <Button asChild>
              <Link href={`/perfis/${profileId}/posts/${item.id}`}>
                Abrir publicação
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </>
        ) : (
          <SheetHeader>
            <SheetTitle>Publicação</SheetTitle>
          </SheetHeader>
        )}
      </SheetContent>
    </Sheet>
  );
}
