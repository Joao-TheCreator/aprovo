"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertCircle, Loader2, Plus, RotateCw, X } from "lucide-react";
import { useRef } from "react";

import { CroppedImage } from "@/components/media/CroppedImage";
import type { GridCrop, GridRatio } from "@/lib/profiles/contracts";
import { cn } from "@/lib/utils";

export type StripStatus = "uploading" | "processing" | "ready" | "error";

export type StripItem = {
  id: string;
  /** Image URL (object URL, thumb or poster). */
  src: string | null;
  /** Local video file URL when there is no poster yet. */
  videoSrc?: string | null;
  crop?: GridCrop | null;
  status: StripStatus;
  /** 0..1, only for "uploading". */
  progress?: number;
  error?: string;
  /** Hide "Tentar de novo" for permanent errors. */
  canRetry?: boolean;
  removable?: boolean;
  /** Excluded from reordering (e.g. still uploading in the editor). */
  locked?: boolean;
};

const STATUS_TEXT: Record<StripStatus, string> = {
  uploading: "Enviando",
  processing: "Processando",
  ready: "Pronto",
  error: "Erro",
};

function ProgressRing({ value }: { value: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 44 44" className="size-11 -rotate-90" aria-hidden>
      <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="4" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
      />
    </svg>
  );
}

function Tile({
  item,
  index,
  total,
  ratio,
  onRemove,
  onRetry,
  onSelect,
  shouldIgnoreClick,
}: {
  item: StripItem;
  index: number;
  total: number;
  ratio: GridRatio;
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
  onSelect?: (id: string) => void;
  shouldIgnoreClick: () => boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: item.locked,
  });
  const aspect = ratio === "3:4" ? "aspect-[3/4]" : "aspect-square";
  const pct = Math.round((item.progress ?? 0) * 100);
  const label = `Mídia ${index + 1} de ${total}. ${STATUS_TEXT[item.status]}${
    item.status === "uploading" ? ` ${pct}%` : ""
  }${item.status === "error" && item.error ? `: ${item.error}` : ""}`;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative w-24 shrink-0", isDragging && "z-20 opacity-80")}
    >
      <div
        {...attributes}
        {...(item.locked ? {} : listeners)}
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-roledescription={item.locked ? undefined : "item reordenável"}
        onClick={() => {
          if (!shouldIgnoreClick()) onSelect?.(item.id);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onSelect) onSelect(item.id);
          else
            (
              listeners as { onKeyDown?: (e: React.KeyboardEvent) => void } | undefined
            )?.onKeyDown?.(e);
        }}
        className={cn(
          "focus-visible:ring-ring/60 relative block touch-pan-x overflow-hidden rounded-xl outline-none focus-visible:ring-[3px]",
          item.status === "error" && "ring-destructive ring-2",
          aspect,
        )}
      >
        {item.src ? (
          <CroppedImage
            src={item.src}
            crop={item.crop}
            ratio={ratio}
            className="size-full"
            imgClassName="pointer-events-none"
          />
        ) : item.videoSrc ? (
          <video
            src={`${item.videoSrc}#t=0.5`}
            muted
            playsInline
            preload="metadata"
            className="pointer-events-none size-full object-cover"
          />
        ) : (
          <div className="size-full bg-neutral-200" />
        )}

        {item.status === "uploading" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/45 text-white">
            <ProgressRing value={item.progress ?? 0} />
            <span className="text-[11px] font-semibold">{pct}%</span>
          </div>
        ) : null}
        {item.status === "processing" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
            <Loader2 aria-hidden className="size-6 animate-spin motion-reduce:animate-none" />
          </div>
        ) : null}
        {item.status === "error" ? (
          <div className="bg-destructive/85 absolute inset-0 flex flex-col items-center justify-center gap-1 p-1 text-center text-white">
            <AlertCircle aria-hidden className="size-5" />
            {item.canRetry === false ? (
              <span className="line-clamp-4 text-[10px] leading-3">{item.error}</span>
            ) : null}
          </div>
        ) : null}
      </div>

      {item.status === "error" && item.canRetry !== false && onRetry ? (
        <button
          type="button"
          onClick={() => onRetry(item.id)}
          className="text-destructive focus-visible:ring-ring/50 mt-1 flex min-h-11 w-full items-center justify-center gap-1 rounded-lg text-xs font-semibold outline-none focus-visible:ring-[3px]"
        >
          <RotateCw aria-hidden className="size-3.5" />
          Tentar de novo
        </button>
      ) : (
        <p
          className={cn(
            "mt-1 text-center text-[11px]",
            item.status === "error" ? "text-destructive font-semibold" : "text-muted-foreground",
          )}
        >
          {STATUS_TEXT[item.status]}
        </p>
      )}

      {item.removable !== false && onRemove ? (
        <button
          type="button"
          aria-label={`Remover mídia ${index + 1}`}
          onClick={() => onRemove(item.id)}
          onKeyDown={(e) => e.stopPropagation()}
          className="focus-visible:ring-ring/60 absolute -top-2 -right-2 z-10 flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-[3px]"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-black/75 text-white">
            <X aria-hidden className="size-4" />
          </span>
        </button>
      ) : null}
    </li>
  );
}

export function MediaStrip({
  items,
  ratio = "1:1",
  onReorder,
  onRemove,
  onRetry,
  onSelect,
  onAdd,
  addLabel = "Adicionar mídia",
}: {
  items: StripItem[];
  ratio?: GridRatio;
  /** Receives the full new id order. */
  onReorder: (ids: string[]) => void;
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
  onSelect?: (id: string) => void;
  /** Shows the "+" tile when set. */
  onAdd?: () => void;
  addLabel?: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const suppressClick = useRef(false);
  const aspect = ratio === "3:4" ? "aspect-[3/4]" : "aspect-square";

  function handleDragEnd(e: DragEndEvent) {
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 80);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={horizontalListSortingStrategy}>
        <ul
          aria-label="Mídias da publicação"
          className="-mx-4 flex gap-3 overflow-x-auto px-4 pt-3 pb-2"
        >
          {items.map((item, i) => (
            <Tile
              key={item.id}
              item={item}
              index={i}
              total={items.length}
              ratio={ratio}
              onRemove={onRemove}
              onRetry={onRetry}
              onSelect={onSelect}
              shouldIgnoreClick={() => suppressClick.current}
            />
          ))}
          {onAdd ? (
            <li className="w-24 shrink-0">
              <button
                type="button"
                onClick={onAdd}
                aria-label={addLabel}
                className={cn(
                  "border-primary/40 text-primary bg-lavanda/50 focus-visible:ring-ring/60 flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-xs font-semibold outline-none focus-visible:ring-[3px]",
                  aspect,
                )}
              >
                <Plus aria-hidden className="size-6" />
                Adicionar
              </button>
            </li>
          ) : null}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
