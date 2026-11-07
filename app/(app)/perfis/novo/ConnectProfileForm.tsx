"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CONNECT_ERROR_MESSAGES,
  igUsernameSchema,
  type ConnectErrorCode,
} from "@/lib/profiles/contracts";
import { connectProfile, createProfileWithoutFeed } from "@/lib/profiles/actions";

type FormError = { code: ConnectErrorCode; profileId?: string; message?: string };

const FALLBACK_CODES: ConnectErrorCode[] = [
  "private_or_personal",
  "not_configured",
  "not_found",
  "provider_down",
];

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
      const res = await connectProfile({ username });
      if (res.ok) {
        toast.success("Perfil conectado");
        router.push(`/perfis/${res.profileId}`);
      } else {
        setError({ code: res.code, profileId: res.profileId, message: res.message });
      }
    });
  }

  function withoutFeed(next: "profile" | "import") {
    startTransition(async () => {
      let id = error?.profileId;
      if (!id) {
        const res = await createProfileWithoutFeed({ username });
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        id = res.profileId;
      }
      router.push(next === "import" ? `/perfis/${id}/importar` : `/perfis/${id}`);
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
          Carregando o feed de @{username}…
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
          <p className="text-body font-medium">
            {error.message ?? CONNECT_ERROR_MESSAGES[error.code]}
          </p>
          {error.code === "already_connected" ? (
            error.profileId ? (
              <Button asChild variant="secondary">
                <Link href={`/perfis/${error.profileId}`}>Abrir perfil</Link>
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <Link href="/perfis">Abrir perfil</Link>
              </Button>
            )
          ) : error.code === "rate_limited" ? (
            <Button type="button" onClick={submit}>
              Tentar de novo
            </Button>
          ) : FALLBACK_CODES.includes(error.code) ? (
            <div className="flex flex-col gap-2">
              <Button type="button" onClick={submit}>
                Tentar de novo
              </Button>
              <Button type="button" variant="outline" onClick={() => withoutFeed("import")}>
                Importar manualmente
              </Button>
              <Button type="button" variant="ghost" onClick={() => withoutFeed("profile")}>
                Continuar sem feed
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" size="lg" disabled={!valid}>
        Continuar
      </Button>
    </form>
  );
}
