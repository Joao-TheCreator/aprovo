import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

export type GlowTone = "brand" | "success" | "danger" | "aurora";

const TONES: Record<GlowTone, string> = {
  brand: "before:from-[#6a00ff] before:via-[#9b3cff] before:to-[#c78bff]",
  success: "before:from-[#22e688] before:via-[#7dffb9] before:to-[#22e688]",
  danger: "before:from-[#ff6b85] before:via-[#c70d31] before:to-[#ff6b85]",
  aurora: "before:from-[#6a00ff] before:via-[#9b3cff] before:to-[#22e688]",
};

/**
 * Gradient glow wrapper (docs/14, "Glow"). Paints a blurred gradient halo behind its child.
 * `active={false}` hides it (use for "selected"/"just approved" states); `pulse` breathes
 * slowly (disabled under reduced motion by the global rule). Pass `asChild` to put the halo
 * on the child element itself instead of adding a wrapper div.
 */
export function Glow({
  tone = "brand",
  intensity = "soft",
  active = true,
  pulse = false,
  asChild = false,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  tone?: GlowTone;
  intensity?: "soft" | "strong";
  active?: boolean;
  pulse?: boolean;
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot : "div";
  return (
    <Comp
      data-slot="glow"
      data-active={active || undefined}
      className={cn(
        "relative isolate",
        "before:pointer-events-none before:absolute before:-inset-1 before:-z-10 before:rounded-[inherit] before:bg-linear-to-r before:blur-xl before:transition-opacity before:duration-(--ap-dur-slow) before:content-['']",
        TONES[tone],
        intensity === "strong" ? "before:-inset-2 before:blur-2xl" : "",
        active
          ? intensity === "strong"
            ? "before:opacity-80"
            : "before:opacity-50"
          : "before:opacity-0",
        active && pulse ? "before:animate-glow-pulse" : "",
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}
