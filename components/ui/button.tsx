import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Button v2 (docs/14, "Botões"). Same variants/sizes as v1 plus `glass` and `link`;
 * every variant scales down on press (springy) and has a 2px ring + offset on focus.
 */
const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-bold whitespace-nowrap outline-none select-none transition-[transform,background-color,box-shadow,color,opacity] duration-(--ap-dur-fast) ease-spring active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-brand text-on-brand shadow-glow hover:brightness-110 active:shadow-none",
        secondary: "bg-surface-2 text-foreground hover:bg-brand-soft hover:text-brand-ink",
        success:
          "bg-gradient-success text-success-foreground shadow-glow-success hover:brightness-105",
        destructive:
          "bg-destructive text-destructive-foreground shadow-glow-danger hover:brightness-110",
        outline:
          "border-outline-strong bg-transparent text-foreground hover:border-brand-ink hover:text-brand-ink border-[1.5px]",
        ghost: "text-foreground hover:bg-surface-2",
        glass: "glass text-foreground border border-white/10 hover:bg-surface-2",
        link: "text-brand-ink h-auto rounded-md px-0 underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-12 px-6",
        sm: "h-10 px-4 after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']",
        lg: "h-14 px-8 text-base",
        icon: "size-11",
        "icon-lg": "size-14",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? "default"}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
