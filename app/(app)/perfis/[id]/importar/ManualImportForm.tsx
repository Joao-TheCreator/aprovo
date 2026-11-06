"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { manualImport } from "@/lib/profiles/actions";

const MAX_IMAGES = 12;

type Defaults = {
  displayName: string;
  biography: string;
  externalUrl: string;
  postsCount: number | null;
  followersCount: number | null;
  followingCount: number | null;
};

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function ManualImportForm({
  profileId,
  defaults,
}: {
  profileId: string;
  defaults: Defaults;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [images, setImages] = useState<File[]>([]);
  const previews = useMemo(() => images.map((f) => URL.createObjectURL(f)), [images]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const fd = new FormData();
    for (const key of [
      "displayName",
      "biography",
      "externalUrl",
      "postsCount",
      "followersCount",
      "followingCount",
    ]) {
      fd.append(key, String(form.get(key) ?? ""));
    }
    const avatar = form.get("avatar");
    if (avatar instanceof File && avatar.size > 0) fd.append("avatar", avatar);
    for (const file of images) fd.append("images", file);

    startTransition(async () => {
      const res = await manualImport(profileId, fd);
      if (res.ok) {
        toast.success("Feed importado");
        router.push(`/perfis/${profileId}`);
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <Field id="displayName" label="Nome">
        <Input
          id="displayName"
          name="displayName"
          defaultValue={defaults.displayName}
          maxLength={80}
        />
      </Field>
      <Field id="biography" label="Bio">
        <Textarea
          id="biography"
          name="biography"
          defaultValue={defaults.biography}
          maxLength={300}
          rows={4}
        />
      </Field>
      <Field id="externalUrl" label="Link">
        <Input
          id="externalUrl"
          name="externalUrl"
          type="url"
          inputMode="url"
          autoCapitalize="none"
          defaultValue={defaults.externalUrl}
          placeholder="https://"
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field id="postsCount" label="Posts">
          <Input
            id="postsCount"
            name="postsCount"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={defaults.postsCount ?? ""}
          />
        </Field>
        <Field id="followersCount" label="Seguidores">
          <Input
            id="followersCount"
            name="followersCount"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={defaults.followersCount ?? ""}
          />
        </Field>
        <Field id="followingCount" label="Seguindo">
          <Input
            id="followingCount"
            name="followingCount"
            type="number"
            min={0}
            inputMode="numeric"
            defaultValue={defaults.followingCount ?? ""}
          />
        </Field>
      </div>
      <Field id="avatar" label="Avatar">
        <Input id="avatar" name="avatar" type="file" accept="image/*" className="h-auto py-2.5" />
      </Field>
      <Field id="images" label="Fotos do feed">
        <Input
          id="images"
          type="file"
          accept="image/*"
          multiple
          className="h-auto py-2.5"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > MAX_IMAGES)
              toast.message(`Usamos apenas as primeiras ${MAX_IMAGES} fotos.`);
            setImages(files.slice(0, MAX_IMAGES));
          }}
        />
        <p className="text-muted-foreground text-sm">
          Até {MAX_IMAGES} imagens; a primeira fica no topo.
        </p>
        {previews.length > 0 ? (
          <ul className="grid grid-cols-3 gap-0.5">
            {previews.map((src, i) => (
              <li key={src} className="bg-secondary aspect-square overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Foto ${i + 1} selecionada`}
                  className="size-full object-cover"
                />
              </li>
            ))}
          </ul>
        ) : null}
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Importando…" : "Importar"}
      </Button>
    </form>
  );
}
