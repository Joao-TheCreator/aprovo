import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

const SCALES = {
  sm: "active:scale-[0.98]",
  md: "active:scale-[0.96]",
  lg: "active:scale-[0.92]",
} as const;

/**
 * Press-scale wrapper (docs/14, "Micro-interações"). CSS only: the child shrinks a little on
 * press and springs back. Reduced motion turns the transition off globally. Use `asChild` to
 * apply it to the child (link, card, grid cell) without adding a wrapper element.
 */
export function Press({
  asChild = false,
  scale = "md",
  className,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean; scale?: keyof typeof SCALES }) {
  const Comp = asChild ? Slot : "div";
  return (
    <Comp
      data-slot="press"
      className={cn(
        "ease-spring transition-transform duration-(--ap-dur-fast) select-none motion-reduce:active:scale-100",
        SCALES[scale],
        className,
      )}
      {...props}
    />
  );
}
