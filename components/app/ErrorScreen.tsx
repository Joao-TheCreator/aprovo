"use client";

import { House, RotateCcw, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/ui/haptics";
import { cn } from "@/lib/utils";

/**
 * Branded error state shared by the error boundaries (app/error.tsx, app/(app)/error.tsx).
 * `fullScreen` centers it on an aurora background (outside the shell).
 */
export function ErrorScreen({
  error,
  retry,
  fullScreen = false,
}: {
  error: unknown;
  retry: () => void;
  fullScreen?: boolean;
}) {
  useEffect(() => {
    console.error(error);
    haptic("error");
  }, [error]);

  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center",
        fullScreen && "bg-aurora min-h-dvh px-4 py-10",
      )}
    >
      <div
        role="alert"
        className="bg-card border-border animate-rise relative isolate flex w-full max-w-md flex-col items-center gap-3 overflow-hidden rounded-4xl border px-6 py-10 text-center"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 -z-10 size-56 -translate-x-1/2 rounded-full bg-[var(--ap-glow-danger)] opacity-70 blur-3xl"
        />
        <span
          aria-hidden
          className="bg-danger text-destructive-foreground shadow-glow-danger mb-1 flex size-16 items-center justify-center rounded-3xl"
        >
          <Zap className="size-8" strokeWidth={2} />
        </span>
        <h1 className="font-display text-h2 max-w-[18ch] text-balance">Deu ruim. Tenta de novo?</h1>
        <p className="text-body text-muted-foreground max-w-[34ch] text-pretty">
          Algo travou do nosso lado. Se continuar, volta pro início e tenta por lá.
        </p>
        <div className="mt-3 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button onClick={() => retry()}>
            <RotateCcw aria-hidden />
            Tentar de novo
          </Button>
          <Button asChild variant="secondary">
            <Link href="/">
              <House aria-hidden />
              Ir para o início
            </Link>
          </Button>
        </div>
        {digest ? (
          <p className="text-micro text-muted-foreground mt-2 uppercase">Código {digest}</p>
        ) : null}
      </div>
    </div>
  );
}
