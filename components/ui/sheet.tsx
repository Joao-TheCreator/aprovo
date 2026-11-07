"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "bg-scrim data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in fixed inset-0 z-50 backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Sheet v2 (docs/14, "Sheets"): glass surface, springy entrance, grab handle on the bottom
 * sheet. Same API as v1.
 */
const sheetVariants = cva(
  "glass text-card-foreground shadow-sheet fixed z-50 flex flex-col gap-4 border-white/10 p-6 outline-none",
  {
    variants: {
      side: {
        bottom:
          "data-[state=open]:animate-sheet-in data-[state=closed]:animate-sheet-out inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-4xl border-t pt-8 pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
        right:
          "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out inset-y-0 right-0 h-full w-3/4 max-w-sm border-l",
        left: "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out inset-y-0 left-0 h-full w-3/4 max-w-sm border-r",
        top: "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out inset-x-0 top-0 rounded-b-4xl border-b",
      },
    },
    defaultVariants: { side: "bottom" },
  },
);

function SheetContent({
  className,
  children,
  side,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & VariantProps<typeof sheetVariants>) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        {(side ?? "bottom") === "bottom" ? (
          <span
            aria-hidden
            className="bg-outline-strong/60 absolute top-2.5 left-1/2 h-1.5 w-11 -translate-x-1/2 rounded-full"
          />
        ) : null}
        {children}
        <SheetPrimitive.Close className="press bg-surface-2 text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-4 right-4 flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-2">
          <XIcon className="size-5" strokeWidth={1.75} />
          <span className="sr-only">Fechar</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="sheet-header" className={cn("flex flex-col gap-1.5", className)} {...props} />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-display text-h2 pr-12", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-body", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
