import {
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  Copy,
  EyeOff,
  GripVertical,
  Play,
} from "lucide-react";
import type { CSSProperties, HTMLAttributes, Ref } from "react";

import { CroppedImage } from "@/components/media/CroppedImage";
import { StatusPill } from "@/components/feed/StatusPill";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Press } from "@/components/ui/press";
import type { FeedItem } from "@/lib/profiles/contracts";
import type { MoveDirection } from "@/lib/posts/reorder";
import { cn } from "@/lib/utils";

const MEDIA_LABEL = { image: "Foto", carousel: "Carrossel", video: "Vídeo" } as const;

/** Wiring injected by the sortable wrapper (dnd-kit); absent for static cells and the drag overlay. */
export type CellSortable = {
  setNodeRef: Ref<HTMLDivElement>;
  style: CSSProperties;
  isDragging: boolean;
  buttonProps: HTMLAttributes<HTMLButtonElement>;
};

export type CellMenu = {
  canUp: boolean;
  canDown: boolean;
  onMove: (dir: MoveDirection) => void;
};

/**
 * One cell of the simulated Instagram grid. Lives inside the light theme island of the feed
 * (docs/14 section 2): no radius, 2 px gaps from the parent grid. The APROVO layers on top
 * (status pill, selection, reorder handle) are glass/gradient and stay dark over photos.
 */
export function GridCell({
  item,
  ratio,
  showStatus,
  onOpen,
  sortable,
  menu,
  selection,
  overlay,
}: {
  item: FeedItem;
  ratio: "1:1" | "3:4";
  showStatus: boolean;
  onOpen: (item: FeedItem) => void;
  sortable?: CellSortable;
  /** Accessible reorder menu; only for planned cells when reordering is allowed. */
  menu?: CellMenu;
  /** Set while in selection mode, for planned cells. */
  selection?: { selected: boolean };
  overlay?: boolean;
}) {
  const hidden = item.kind === "imported" && item.isHidden;
  const label = `${MEDIA_LABEL[item.mediaType]}${hidden ? " oculta da grade" : ""}`;
  const selected = selection?.selected ?? false;
  const isCarousel =
    item.kind === "planned"
      ? item.mediaCount > 1 && item.postKind !== "video"
      : item.mediaType === "carousel";
  const isVideo = item.kind === "planned" ? item.postKind === "video" : item.mediaType === "video";

  return (
    <div
      ref={sortable?.setNodeRef}
      style={sortable?.style}
      className={cn(
        "group relative",
        sortable?.isDragging && "opacity-30",
        overlay && "shadow-glow z-30 scale-[1.04] cursor-grabbing",
      )}
    >
      <Press asChild scale="sm">
        <button
          type="button"
          onClick={() => onOpen(item)}
          aria-label={
            selection
              ? `${label}: ${selected ? "selecionada" : "não selecionada"}`
              : `${label}: abrir detalhes`
          }
          aria-pressed={selection ? selected : undefined}
          {...sortable?.buttonProps}
          className={cn(
            "focus-visible:ring-ring relative block w-full touch-manipulation overflow-hidden bg-neutral-200 outline-none focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-inset",
            ratio === "3:4" ? "aspect-[3/4]" : "aspect-square",
            selected && "bg-gradient-brand",
          )}
        >
          {/* Media layer: shrinks inside a gradient frame when selected (gradient ring). */}
          <span
            className={cn(
              "ease-spring absolute inset-0 block overflow-hidden transition-[inset,border-radius] duration-(--ap-dur-fast)",
              selected && "inset-[3px] rounded-[4px]",
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
              <span className={cn("block size-full bg-neutral-200", hidden && "opacity-40")} />
            )}
            {selection && !selected ? (
              <span aria-hidden className="absolute inset-0 bg-black/10" />
            ) : null}
          </span>

          {isCarousel ? (
            <Copy
              aria-hidden
              className="absolute top-2 right-2 size-5 text-white drop-shadow"
              strokeWidth={2}
            />
          ) : null}
          {isVideo ? (
            <Play
              aria-hidden
              className="absolute top-2 right-2 size-5 fill-white text-white drop-shadow"
              strokeWidth={2}
            />
          ) : null}
          {hidden ? (
            <span
              aria-hidden
              className="absolute bottom-1.5 left-1.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md"
            >
              <EyeOff className="size-4" strokeWidth={2} />
            </span>
          ) : null}
          {item.kind === "planned" && showStatus ? (
            <StatusPill
              status={item.status}
              variant="overlay"
              short
              className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-0.75rem)] gap-1 py-0.5 pr-2 pl-1.5 text-[10px] leading-4"
            />
          ) : null}
          {selection ? (
            <span
              aria-hidden
              className={cn(
                "absolute top-1.5 left-1.5 flex size-6 items-center justify-center rounded-full border-2 border-white shadow transition-colors duration-(--ap-dur-fast)",
                selected ? "bg-gradient-brand text-on-brand shadow-glow" : "bg-black/30",
              )}
            >
              {selected ? (
                <Check className="animate-success-pop size-3.5" strokeWidth={3.5} />
              ) : null}
            </span>
          ) : null}
        </button>
      </Press>
      {menu && !selection ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Mover publicação"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="focus-visible:ring-ring absolute top-1 left-1 z-10 flex size-7 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white opacity-0 backdrop-blur-md transition-opacity duration-(--ap-dur-instant) outline-none group-focus-within:opacity-100 group-hover:opacity-100 after:absolute after:-inset-2 after:content-[''] focus-visible:ring-2 [@media(hover:none)]:opacity-100"
          >
            <GripVertical aria-hidden className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem disabled={!menu.canUp} onSelect={() => menu.onMove("up")}>
              <ChevronUp aria-hidden /> Mover para cima
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!menu.canDown} onSelect={() => menu.onMove("down")}>
              <ChevronDown aria-hidden /> Mover para baixo
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!menu.canUp} onSelect={() => menu.onMove("top")}>
              <ChevronsUp aria-hidden /> Mover para o topo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
