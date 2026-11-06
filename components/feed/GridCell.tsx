import {
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  Copy,
  EyeOff,
  MoreHorizontal,
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
  /** Accessible reorder menu ("⋯"); only for planned cells when reordering is allowed. */
  menu?: CellMenu;
  /** Set while in selection mode, for planned cells. */
  selection?: { selected: boolean };
  overlay?: boolean;
}) {
  const hidden = item.kind === "imported" && item.isHidden;
  const label = `${MEDIA_LABEL[item.mediaType]}${hidden ? " oculta da grade" : ""}`;
  return (
    <div
      ref={sortable?.setNodeRef}
      style={sortable?.style}
      className={cn(
        "group relative",
        sortable?.isDragging && "opacity-30",
        overlay && "scale-105 shadow-2xl",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(item)}
        aria-label={
          selection
            ? `${label}: ${selection.selected ? "selecionada" : "não selecionada"}`
            : `${label}: abrir detalhes`
        }
        aria-pressed={selection ? selection.selected : undefined}
        {...sortable?.buttonProps}
        className={cn(
          "focus-visible:ring-ring/60 relative block w-full touch-manipulation overflow-hidden bg-neutral-200 outline-none focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-inset",
          ratio === "3:4" ? "aspect-[3/4]" : "aspect-square",
          selection?.selected && "ring-primary ring-4 ring-inset",
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
        {selection ? (
          <span
            aria-hidden
            className={cn(
              "absolute top-1.5 left-1.5 flex size-6 items-center justify-center rounded-full border-2 border-white shadow",
              selection.selected ? "bg-primary text-primary-foreground" : "bg-black/30",
            )}
          >
            {selection.selected ? <Check className="size-4" strokeWidth={3} /> : null}
          </span>
        ) : null}
      </button>
      {menu && !selection ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Mover publicação"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="focus-visible:ring-ring/60 absolute top-1 left-1 z-10 flex size-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 outline-none group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:ring-[3px] [@media(hover:none)]:opacity-100"
          >
            <MoreHorizontal aria-hidden className="size-4" />
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
