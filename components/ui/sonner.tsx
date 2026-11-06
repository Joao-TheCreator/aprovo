"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      toastOptions={{
        classNames: {
          toast: "rounded-2xl border border-border bg-card text-foreground shadow-md font-sans",
          success: "border-verde",
          error: "border-destructive",
        },
      }}
      {...props}
    />
  );
}
