"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  getPublishingQuota,
  reschedulePublication,
  schedulePublication,
} from "@/lib/publishing/actions";
import { MIN_SCHEDULE_LEAD_MS } from "@/lib/publishing/contracts";
import { formatInZone, toInputValues, zonedDateTimeToUtc, zoneLabel } from "@/lib/publishing/time";

export type ScheduleTarget =
  | { mode: "schedule"; postId: string }
  | { mode: "reschedule"; publicationId: string; current: Date | string };

const QUOTA_WARN_AT = 90;
const DEFAULT_TIME = "09:00";

function tomorrowInZone(timeZone: string): string {
  return toInputValues(new Date(Date.now() + 24 * 60 * 60 * 1000), timeZone).date;
}

export function ScheduleSheet({
  open,
  onOpenChange,
  target,
  profileId,
  timezone,
  kind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ScheduleTarget;
  profileId: string;
  timezone: string;
  kind: "post" | "video";
}) {
  const router = useRouter();
  const reschedule = target.mode === "reschedule";
  const currentKey = target.mode === "reschedule" ? new Date(target.current).toISOString() : "";
  const [pending, startTransition] = useTransition();
  const initial = useMemo(
    () =>
      currentKey
        ? toInputValues(currentKey, timezone)
        : { date: tomorrowInZone(timezone), time: DEFAULT_TIME },
    [currentKey, timezone],
  );
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ used: number; total: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getPublishingQuota(profileId).then((q) => {
      if (!cancelled) setQuota(q);
    });
    return () => {
      cancelled = true;
    };
  }, [open, profileId]);

  const label = zoneLabel(timezone);
  const preview = useMemo(() => {
    if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
    return time;
  }, [time]);
  const minDate = useMemo(() => toInputValues(new Date(), timezone).date, [timezone]);

  function submit() {
    setError(null);
    let when: Date;
    try {
      when = zonedDateTimeToUtc(date, time, timezone);
    } catch {
      setError("Informe uma data e uma hora válidas.");
      return;
    }
    if (when.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) {
      setError("Escolha um horário no futuro.");
      return;
    }
    const scheduledAt = when.toISOString();
    startTransition(async () => {
      const res =
        target.mode === "schedule"
          ? await schedulePublication({ postId: target.postId, scheduledAt, timezone })
          : await reschedulePublication({
              publicationId: target.publicationId,
              scheduledAt,
              timezone,
            });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      const f = formatInZone(when, timezone);
      toast.success(`Agendado para ${f.day} às ${f.time}`);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full md:max-w-[430px]">
        <SheetHeader>
          <SheetTitle>{reschedule ? "Reagendar publicação" : "Agendar publicação"}</SheetTitle>
          <SheetDescription>Escolha quando publicar no Instagram.</SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="schedule-date">Data</Label>
            <Input
              id="schedule-date"
              type="date"
              value={date}
              min={minDate}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={error ? true : undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="schedule-time">Hora</Label>
            <Input
              id="schedule-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-invalid={error ? true : undefined}
            />
          </div>
        </div>

        {preview ? (
          <p className="text-muted-foreground text-sm">
            Será publicado às {preview} ({label})
          </p>
        ) : null}
        {kind === "video" ? (
          <p className="text-muted-foreground text-sm">
            Vídeos são publicados como Reel e aparecem no feed.
          </p>
        ) : null}
        {quota ? (
          <p
            className={
              quota.used >= QUOTA_WARN_AT
                ? "bg-lavanda text-roxo rounded-xl px-3 py-2 text-sm font-semibold"
                : "text-muted-foreground text-sm"
            }
          >
            Hoje: {quota.used} de {quota.total} publicações usadas nesta conta
          </p>
        ) : null}

        <div aria-live="polite">
          {error ? (
            <p
              role="alert"
              className="bg-destructive/10 text-destructive rounded-xl px-4 py-3 text-sm"
            >
              {error}
            </p>
          ) : null}
        </div>

        <Button onClick={submit} disabled={pending || !date || !time}>
          {pending ? "Agendando…" : reschedule ? "Reagendar" : "Agendar"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
