import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** Card v2 (docs/14, "Cards"): chunky radius, hairline outline, soft depth. */
const cardVariants = cva("text-card-foreground flex flex-col gap-4 rounded-3xl p-5", {
  variants: {
    variant: {
      default: "bg-card border-border shadow-card border",
      flat: "bg-surface-2",
      glass: "glass border border-white/10",
      glow: "bg-card shadow-glow border border-transparent",
    },
    interactive: {
      true: "press focus-visible:ring-ring hover:border-outline-strong cursor-pointer transition-[transform,border-color] outline-none focus-visible:ring-2",
      false: "",
    },
  },
  defaultVariants: { variant: "default", interactive: false },
});

function Card({
  className,
  variant,
  interactive,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ variant, interactive }), className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-header" className={cn("flex flex-col gap-1", className)} {...props} />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 data-slot="card-title" className={cn("text-title", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-body text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("flex flex-col gap-3", className)} {...props} />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-footer" className={cn("flex items-center gap-2", className)} {...props} />
  );
}

export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, cardVariants };
