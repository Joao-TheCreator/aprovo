"use client";

import { useState } from "react";

import type { PostMediaItem } from "@/lib/posts/contracts";

export function PublicMedia({ kind, media }: { kind: "post" | "video"; media: PostMediaItem[] }) {
  const [index, setIndex] = useState(0);
  const video = kind === "video" ? media[0] : null;

  if (video) {
    return (
      <video
        controls
        playsInline
        preload="metadata"
        poster={video.posterUrl ?? undefined}
        src={video.originalUrl ?? undefined}
        className="max-h-[75dvh] w-full bg-black"
      />
    );
  }

  return (
    <div className="relative">
      <ul
        aria-label="Mídias da publicação"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="flex snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto motion-safe:scroll-smooth [&::-webkit-scrollbar]:hidden"
      >
        {media.map((m, i) => {
          const src = m.previewUrl ?? m.thumbUrl;
          return (
            <li
              key={m.assetId}
              className="flex w-full shrink-0 snap-center items-center justify-center bg-neutral-100"
              aria-label={`Mídia ${i + 1} de ${media.length}`}
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
                  Mídia indisponível
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {media.length > 1 ? (
        <>
          <span className="absolute top-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            {index + 1}/{media.length}
          </span>
          <div aria-hidden className="flex justify-center gap-1 pt-2">
            {media.map((m, i) => (
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
