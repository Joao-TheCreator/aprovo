"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { createProfileWithoutFeed } from "@/lib/profiles/actions";
import { igUsernameSchema, type ConnectErrorCode } from "@/lib/profiles/contracts";

type FormError = { code: ConnectErrorCode; profileId?: string; message: string };

/**
 * Manual path: the user chose "Importar manualmente", so the profile is created right away and
 * the Instagram API is never called. The automatic import lives in the OAuth flow.
 */
export function ConnectProfileForm() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<FormError | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = igUsernameSchema.safeParse(raw);
  const valid = parsed.success;
  const username = parsed.success ? parsed.data : "";
  const showInvalid = raw.trim().length > 0 && !valid;

  function submit() {
    if (!valid) return;
    setError(null);
    startTransition(async () => {
      const res = await createProfileWithoutFeed({ username });
      if (res.ok) {
        router.push(`/perfis/${res.profileId}/importar`);
      } else if (res.code === "already_connected") {
        setError({ code: res.code, profileId: res.profileId, message: res.message });
      } else {
        toast.error(res.message);
      }
    });
  }

  if (pending) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-live="polite">
        <div className="flex items-center gap-4">
          <Skeleton className="size-20 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-0.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-none" />
          ))}
        </div>
        <p className="text-body text-muted-foreground text-center">
          Criando o perfil de @{username}…
        </p>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="handle" className="text-caption">
          @ do Instagram
        </Label>
        <div className="relative">
          <span
            aria-hidden
            className="text-brand-ink font-display pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-base"
          >
            @
          </span>
          <Input
            id="handle"
            name="handle"
            placeholder="perfil"
            className="pl-9"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setError(null);
            }}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            aria-invalid={showInvalid}
            aria-describedby="handle-help"
          />
        </div>
        <p
          id="handle-help"
          className={showInvalid ? "text-danger-ink text-sm" : "text-muted-foreground text-sm"}
        >
          {showInvalid
            ? "Informe um @ válido (letras, números, ponto e _)."
            : "Apenas contas públicas. Não pedimos a senha do cliente."}
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="bg-brand-soft border-outline animate-pop-in flex flex-col gap-3 rounded-3xl border p-4"
        >
          <p className="text-body font-medium">{error.message}</p>
          <Button asChild variant="secondary">
            <Link href={error.profileId ? `/perfis/${error.profileId}` : "/perfis"}>
              Abrir perfil
            </Link>
          </Button>
        </div>
      ) : null}

      <Button type="submit" size="lg" disabled={!valid}>
        Continuar
      </Button>
    </form>
  );
}
