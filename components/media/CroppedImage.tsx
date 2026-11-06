"use client";

import { useState } from "react";

import type { GridCrop, GridRatio } from "@/lib/profiles/contracts";
import { cn } from "@/lib/utils";

export function ratioToNumber(ratio: GridRatio): number {
  return ratio === "3:4" ? 3 / 4 : 1;
}

/**
 * Renders an image inside a box (its aspect comes from `className`, e.g. aspect-square) so that
 * the `crop` rectangle (fractions of the image) exactly fills the box.
 *
 * Math: the crop is w*iw by h*ih pixels with the same aspect as the box, so scaling the image to
 * (100%/w) of the box width and (100%/h) of the box height keeps proportions, and offsetting by
 * (-x/w, -y/h) of the box size puts the crop's top-left at the box's top-left. No natural size
 * is needed. When `ratio` is given and the image's natural size shows the stored crop no longer
 * matches that ratio (profile ratio changed), it falls back to centered cover.
 */
export function CroppedImage({
  src,
  crop,
  ratio,
  alt = "",
  className,
  imgClassName,
  width,
  height,
}: {
  src: string;
  crop: GridCrop | null | undefined;
  ratio?: GridRatio;
  alt?: string;
  className?: string;
  imgClassName?: string;
  width?: number | null;
  height?: number | null;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(
    width && height ? { w: width, h: height } : null,
  );

  let useCrop = crop ?? null;
  if (useCrop && ratio && natural) {
    const cropAspect = (useCrop.w * natural.w) / (useCrop.h * natural.h);
    if (Math.abs(cropAspect / ratioToNumber(ratio) - 1) > 0.03) useCrop = null;
  }

  return (
    <div className={cn("relative overflow-hidden bg-neutral-200", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        draggable={false}
        onLoad={(e) => {
          const el = e.currentTarget;
          if (!natural && el.naturalWidth) setNatural({ w: el.naturalWidth, h: el.naturalHeight });
        }}
        className={cn(!useCrop && "absolute inset-0 size-full object-cover", imgClassName)}
        style={
          useCrop
            ? {
                position: "absolute",
                maxWidth: "none",
                width: `${100 / useCrop.w}%`,
                height: `${100 / useCrop.h}%`,
                left: `${(-useCrop.x / useCrop.w) * 100}%`,
                top: `${(-useCrop.y / useCrop.h) * 100}%`,
              }
            : undefined
        }
      />
    </div>
  );
}
