"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { CroppedImage, ratioToNumber } from "@/components/media/CroppedImage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import type { GridCrop, GridRatio } from "@/lib/profiles/contracts";
import { updatePostMedia } from "@/lib/posts/actions";
import type { PostMediaItem } from "@/lib/posts/contracts";

const MAX_ZOOM = 3;

type View = { zoom: number; cx: number; cy: number };

/** Crop size in image fractions for a zoom level (1× = largest rect of the grid aspect). */
function cropSize(iw: number, ih: number, aspect: number, zoom: number) {
  const wPx = iw / ih > aspect ? ih * aspect : iw;
  const hPx = wPx / aspect;
  return { w: wPx / zoom / iw, h: hPx / zoom / ih, wPx: wPx / zoom };
}

function clampView(v: View, iw: number, ih: number, aspect: number): View {
  const { w, h } = cropSize(iw, ih, aspect, v.zoom);
  return {
    zoom: v.zoom,
    cx: Math.min(1 - w / 2, Math.max(w / 2, v.cx)),
    cy: Math.min(1 - h / 2, Math.max(h / 2, v.cy)),
  };
}

function initialView(crop: GridCrop | null, iw: number, ih: number, aspect: number): View {
  if (!crop) return { zoom: 1, cx: 0.5, cy: 0.5 };
  const base = cropSize(iw, ih, aspect, 1);
  const cropAspect = (crop.w * iw) / (crop.h * ih);
  if (Math.abs(cropAspect / aspect - 1) > 0.03) return { zoom: 1, cx: 0.5, cy: 0.5 };
  const zoom = Math.min(MAX_ZOOM, Math.max(1, base.w / crop.w));
  return clampView({ zoom, cx: crop.x + crop.w / 2, cy: crop.y + crop.h / 2 }, iw, ih, aspect);
}

/**
 * Pan/zoom editor for the grid thumbnail crop. Persists via updatePostMedia (full items list).
 * The inner component is keyed by the dialog opening so state resets from the stored crop.
 */
export function CropEditor({
  open,
  onOpenChange,
  postId,
  media,
  assetId,
  ratio,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId: string;
  media: PostMediaItem[];
  assetId: string;
  ratio: GridRatio;
}) {
  const item = media.find((m) => m.assetId === assetId) ?? null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[100dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar enquadramento</DialogTitle>
          <DialogDescription>
            Arraste a imagem para posicionar. Só a miniatura na grade é cortada; a mídia completa
            continua inteira.
          </DialogDescription>
        </DialogHeader>
        {open && item ? (
          <CropBody
            postId={postId}
            media={media}
            item={item}
            ratio={ratio}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CropBody({
  postId,
  media,
  item,
  ratio,
  onDone,
}: {
  postId: string;
  media: PostMediaItem[];
  item: PostMediaItem;
  ratio: GridRatio;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const aspect = ratioToNumber(ratio);
  const src = item.previewUrl ?? item.thumbUrl ?? item.posterUrl;
  const [size, setSize] = useState<{ w: number; h: number } | null>(
    item.width && item.height ? { w: item.width, h: item.height } : null,
  );
  const [view, setView] = useState<View | null>(
    size ? initialView(item.gridCrop, size.w, size.h, aspect) : null,
  );
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  function onNaturalSize(w: number, h: number) {
    if (size) return;
    setSize({ w, h });
    setView(initialView(item.gridCrop, w, h, aspect));
  }

  const crop: GridCrop | null =
    size && view
      ? (() => {
          const { w, h } = cropSize(size.w, size.h, aspect, view.zoom);
          return { x: view.cx - w / 2, y: view.cy - h / 2, w, h };
        })()
      : null;

  function onPointerDown(e: React.PointerEvent) {
    if (!view) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const box = boxRef.current;
    if (!d || !size || !view || !box) return;
    const rect = box.getBoundingClientRect();
    // Crop spans cropW image-fractions across the box width (and cropH across its height).
    const { w, h } = cropSize(size.w, size.h, aspect, view.zoom);
    const dxf = ((e.clientX - d.x) / rect.width) * w;
    const dyf = ((e.clientY - d.y) / rect.height) * h;
    setView(clampView({ zoom: view.zoom, cx: d.cx - dxf, cy: d.cy - dyf }, size.w, size.h, aspect));
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (!size || !view) return;
    const { w, h } = cropSize(size.w, size.h, aspect, view.zoom);
    const step = 0.1;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-w * step, 0],
      ArrowRight: [w * step, 0],
      ArrowUp: [0, -h * step],
      ArrowDown: [0, h * step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    setView(clampView({ ...view, cx: view.cx + d[0], cy: view.cy + d[1] }, size.w, size.h, aspect));
  }

  function setZoom(zoom: number) {
    if (!size || !view) return;
    setView(clampView({ ...view, zoom }, size.w, size.h, aspect));
  }

  function apply() {
    if (!crop) return;
    startTransition(async () => {
      const res = await updatePostMedia({
        postId,
        items: media.map((m) => ({
          assetId: m.assetId,
          gridCrop: m.assetId === item.assetId ? crop : (m.gridCrop ?? null),
        })),
      });
      if (res.ok) {
        toast.success("Enquadramento salvo");
        router.refresh();
        onDone();
      } else toast.error(res.message);
    });
  }

  if (!src)
    return <p className="text-body text-muted-foreground">Esta mídia ainda não tem prévia.</p>;

  return (
    <>
      <div
        ref={boxRef}
        role="application"
        tabIndex={0}
        aria-label="Área de enquadramento. Use as setas para mover."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={onKeyDown}
        className="focus-visible:ring-ring focus-visible:ring-offset-background border-outline shadow-card mx-auto w-full max-w-[320px] cursor-grab touch-none overflow-hidden rounded-3xl border outline-none select-none focus-visible:ring-2 focus-visible:ring-offset-2 active:cursor-grabbing"
      >
        {crop ? (
          <CroppedImage
            src={src}
            crop={crop}
            className={ratio === "3:4" ? "aspect-[3/4]" : "aspect-square"}
            imgClassName="pointer-events-none"
          />
        ) : (
          // Natural size unknown yet: load it, then the crop state initializes.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            onLoad={(e) =>
              onNaturalSize(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)
            }
            className="aspect-square w-full object-cover opacity-50"
          />
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="crop-zoom" className="text-caption flex items-center justify-between">
          Zoom
          <span className="text-brand-ink tabular-nums">
            {view ? `${view.zoom.toFixed(1)}×` : ""}
          </span>
        </label>
        <Slider
          id="crop-zoom"
          min={1}
          max={MAX_ZOOM}
          step={0.05}
          value={view?.zoom ?? 1}
          disabled={!view}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={apply} disabled={pending || !crop}>
          Aplicar
        </Button>
      </DialogFooter>
    </>
  );
}
