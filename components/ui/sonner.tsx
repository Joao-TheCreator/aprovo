"use client";

import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Toasts v2 (docs/14, "Toasts"): glass pill on top, colored icon carries the tone. */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      gap={8}
      offset={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
      mobileOffset={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
      icons={{
        success: <CheckCircle2 className="text-success-ink size-5" strokeWidth={2.25} />,
        error: <XCircle className="text-danger-ink size-5" strokeWidth={2.25} />,
        warning: <AlertTriangle className="text-warning-ink size-5" strokeWidth={2.25} />,
        info: <Info className="text-brand-ink size-5" strokeWidth={2.25} />,
        loading: <Loader2 className="text-brand-ink size-5 animate-spin" strokeWidth={2.25} />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "glass shadow-sheet text-foreground font-sans flex w-full items-center gap-3 rounded-3xl border border-white/10 px-4 py-3 text-sm font-semibold",
          title: "font-bold",
          description: "text-muted-foreground font-medium",
          actionButton: "bg-gradient-brand! text-on-brand! rounded-full! font-bold!",
          cancelButton: "bg-surface-2! text-foreground! rounded-full!",
          success: "shadow-glow-success",
          error: "shadow-glow-danger",
        },
      }}
      {...props}
    />
  );
}
