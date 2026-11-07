"use client";

import { CalendarCheck, Clapperboard, Zap } from "lucide-react";
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
import { SuccessBurst } from "@/components/ui/success-burst";
import { scheduleShortcuts } from "@/lib/posts/ui-schedule";
import {
  getPublishingQuota,
  reschedulePublication,
  schedulePublication,
} from "@/lib/publishing/actions";
import { MIN_SCHEDULE_LEAD_MS } from "@/lib/publishing/contracts";
import { formatInZone, toInputValues, zonedDateTimeToUtc, zoneLabel } from "@/lib/publishing/time";
import { haptic } from "@/lib/ui/haptics";
import { cn } from "@/lib/utils";

export type ScheduleTarget =
  | { mode: "schedule"; postId: string }
  | { mode: "reschedule"; publicationId: string; current: Date | string };

const QUOTA_WARN_AT = 90;
const DEFAULT_TIME = "09:00";
/** How long the success burst plays before the sheet closes. */
const SUCCESS_HOLD_MS = 650;

function tomorrowInZone(timeZone: string): string {
  return toInputValues(new Date(Date.now() + 24 * 60 * 60 * 1000), timeZone).date;
}

function QuotaMeter({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const warn = used >= QUOTA_WARN_AT;
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl border p-3",
        warn ? "border-warning/50 bg-warning/10" : "border-border bg-surface-2/60",
      )}
    >
      <div className="text-caption flex items-center justify-between gap-2">
        <span className={cn("flex items-center gap-1.5", warn && "text-warning-ink")}>
          <Zap aria-hidden className="size-4" />
          Hoje: {used} de {total} publicações usadas nesta conta
        </span>
      </div>
      <div
        role="meter"
        aria-label="Cota diária de publicações"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={used}
        className="bg-surface-2 h-2 overflow-hidden rounded-full"
      >
        <div
          className={cn(
            "ease-out-expo h-full rounded-full transition-[width] duration-(--ap-dur-slow)",
            warn ? "bg-warning" : "bg-gradient-brand",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
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
  const [done, setDone] = useState(false);
  // Computed once per opening; the sheet is mounted only while open.
  const [shortcuts] = useState(() => scheduleShortcuts(timezone));

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
      haptic("error");
      return;
    }
    if (when.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) {
      setError("Escolha um horário no futuro.");
      haptic("error");
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
        haptic("error");
        return;
      }
      const f = formatInZone(when, timezone);
      haptic("success");
      setDone(true);
      toast.success(`Agendado para ${f.day} às ${f.time}`);
      router.refresh();
      await new Promise((r) => setTimeout(r, SUCCESS_HOLD_MS));
      onOpenChange(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full gap-5 md:max-w-[430px]">
        <SheetHeader>
          <SheetTitle>{reschedule ? "Reagendar publicação" : "Agendar publicação"}</SheetTitle>
          <SheetDescription>Escolha quando publicar no Instagram.</SheetDescription>
        </SheetHeader>

        {shortcuts.length ? (
          <div role="group" aria-label="Atalhos de horário" className="flex flex-wrap gap-2">
            {shortcuts.map((s) => {
              const active = s.date === date && s.time === time;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setDate(s.date);
                    setTime(s.time);
                    setError(null);
                    haptic("tap");
                  }}
                  className={cn(
                    "press focus-visible:ring-ring focus-visible:ring-offset-background text-caption inline-flex h-11 items-center rounded-full px-4 font-bold outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                    "transition-[background-color,color,box-shadow] duration-(--ap-dur-fast)",
                    active
                      ? "bg-gradient-brand text-on-brand shadow-glow"
                      : "bg-surface-2 text-foreground hover:bg-brand-soft hover:text-brand-ink",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        ) : null}

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
              className="h-14 text-lg font-bold md:text-lg"
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
              className="h-14 text-lg font-bold md:text-lg"
            />
          </div>
        </div>

        {preview ? (
          <p className="text-caption text-muted-foreground -mt-2 font-medium">
            Será publicado às {preview} ({label})
          </p>
        ) : null}
        {kind === "video" ? (
          <p className="bg-brand-soft text-brand-ink text-caption flex items-center gap-2 rounded-2xl px-3 py-2.5">
            <Clapperboard aria-hidden className="size-4 shrink-0" />
            Vídeos são publicados como Reel e aparecem no feed.
          </p>
        ) : null}
        {quota ? <QuotaMeter used={quota.used} total={quota.total} /> : null}

        <div aria-live="polite">
          {error ? (
            <p
              role="alert"
              className="border-danger-ink/50 bg-danger/10 text-danger-ink text-body rounded-2xl border px-4 py-3 font-semibold"
            >
              {error}
            </p>
          ) : null}
        </div>

        <div className="relative">
          <Button
            variant="success"
            size="lg"
            className="w-full"
            onClick={submit}
            disabled={pending || done || !date || !time}
          >
            {done ? <CalendarCheck aria-hidden className="animate-success-pop" /> : null}
            {pending && !done ? "Agendando…" : reschedule ? "Reagendar" : "Agendar"}
          </Button>
          {done ? <SuccessBurst /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
