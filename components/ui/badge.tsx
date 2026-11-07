import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** Badge / chip (docs/14, "Chips"). v1 variants kept; `brand`, `warning`, `glass` added. */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border px-2.5 py-1 text-caption whitespace-nowrap [&>svg]:size-3.5",
  {
    variants: {
      variant: {
        default: "bg-gradient-brand text-on-brand border-transparent",
        secondary: "bg-surface-2 text-foreground border-transparent",
        success: "bg-success text-success-foreground border-transparent",
        destructive: "bg-destructive text-destructive-foreground border-transparent",
        outline: "border-outline-strong text-muted-foreground bg-transparent",
        brand: "bg-brand-soft text-brand-ink border-transparent",
        warning: "bg-warning text-ink border-transparent",
        glass: "glass text-foreground border-white/10",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
