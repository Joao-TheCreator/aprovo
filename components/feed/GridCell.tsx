import { Copy, EyeOff, Play } from "lucide-react";

import { CroppedImage } from "@/components/media/CroppedImage";
import { StatusPill } from "@/components/feed/StatusPill";
import type { FeedItem } from "@/lib/profiles/contracts";
import { cn } from "@/lib/utils";

const MEDIA_LABEL = { image: "Foto", carousel: "Carrossel", video: "Vídeo" } as const;

export function GridCell({
  item,
  ratio,
  showStatus,
  onOpen,
}: {
  item: FeedItem;
  ratio: "1:1" | "3:4";
  showStatus: boolean;
  onOpen: (item: FeedItem) => void;
}) {
  const hidden = item.kind === "imported" && item.isHidden;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={`${MEDIA_LABEL[item.mediaType]}${hidden ? " oculta da grade" : ""}: abrir detalhes`}
      className={cn(
        "focus-visible:ring-ring/60 relative block w-full overflow-hidden bg-neutral-200 outline-none focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-inset",
        ratio === "3:4" ? "aspect-[3/4]" : "aspect-square",
      )}
    >
      {item.thumbUrl ? (
        item.kind === "planned" ? (
          <CroppedImage
            src={item.thumbUrl}
            crop={item.gridCrop}
            ratio={ratio}
            className="size-full"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbUrl}
            alt=""
            loading="lazy"
            className={cn("size-full object-cover", hidden && "opacity-40")}
          />
        )
      ) : (
        <span className={cn("block size-full", hidden && "opacity-40")} />
      )}
      {(
        item.kind === "planned"
          ? item.mediaCount > 1 && item.postKind !== "video"
          : item.mediaType === "carousel"
      ) ? (
        <Copy
          aria-hidden
          className="absolute top-2 right-2 size-5 text-white drop-shadow"
          strokeWidth={2}
        />
      ) : null}
      {(item.kind === "planned" ? item.postKind === "video" : item.mediaType === "video") ? (
        <Play
          aria-hidden
          className="absolute top-2 right-2 size-5 fill-white text-white drop-shadow"
          strokeWidth={2}
        />
      ) : null}
      {hidden ? (
        <EyeOff
          aria-hidden
          className="absolute bottom-2 left-2 size-5 text-black drop-shadow"
          strokeWidth={2}
        />
      ) : null}
      {item.kind === "planned" && showStatus ? (
        <StatusPill
          status={item.status}
          className="absolute bottom-1.5 left-1.5 px-2 py-0.5 text-[10px] leading-4"
        />
      ) : null}
    </button>
  );
}
