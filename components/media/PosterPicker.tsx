"use client";

import { useEffect, useRef } from "react";

import { Slider } from "@/components/ui/slider";

/** Scrubber over the video duration to pick the poster frame. `value` is in seconds. */
export function PosterPicker({
  src,
  durationSec,
  value,
  onChange,
}: {
  src: string;
  durationSec: number;
  value: number;
  onChange: (sec: number) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (v && v.readyState >= 1) v.currentTime = value;
  }, [value]);

  return (
    <div className="flex flex-col gap-2">
      <video
        ref={ref}
        src={src}
        muted
        playsInline
        preload="auto"
        onLoadedMetadata={(e) => {
          e.currentTarget.currentTime = value;
        }}
        className="mx-auto max-h-64 rounded-2xl bg-black"
      />
      <label className="text-caption" htmlFor="poster-range">
        Escolher capa
      </label>
      <Slider
        id="poster-range"
        min={0}
        max={Math.max(0.1, Number(durationSec.toFixed(2)))}
        step={0.1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={`${value.toFixed(1)} segundos`}
      />
    </div>
  );
}
