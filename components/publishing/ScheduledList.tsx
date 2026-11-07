"use client";

import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  CheckCheck,
  Clapperboard,
  ExternalLink,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/app/EmptyState";
import { ScheduleSheet } from "@/components/publishing/ScheduleSheet";
import { Button } from "@/components/ui/button";
import type { PublicationListItem, PublicationLists } from "@/lib/publishing/contracts";
import { formatInZone, zoneLabel } from "@/lib/publishing/time";
import { cn } from "@/lib/utils";

type Tone = "scheduled" | "published" | "failed";

const TONES: Record<Tone, { dot: string; pill: string; icon: LucideIcon; badge: string }> = {
  scheduled: {
    dot: "bg-status-scheduled",
    pill: "bg-brand-soft text-brand-ink",
    icon: CalendarClock,
    badge: "bg-gradient-brand text-on-brand shadow-glow",
  },
  published: {
    dot: "bg-status-published",
    pill: "bg-surface-2 text-foreground",
    icon: CheckCheck,
    badge: "bg-status-published text-ink",
  },
  failed: {
    dot: "bg-status-failed",
    pill: "bg-danger/15 text-danger-ink",
    icon: AlertTriangle,
    badge: "bg-danger text-destructive-foreground shadow-glow-danger",
  },
};

function Thumb({ item }: { item: PublicationListItem }) {
  return (
    <span className="relative block size-16 shrink-0 overflow-hidden rounded-2xl">
      {item.thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.thumbUrl} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden className="bg-surface-2 block size-full" />
      )}
      {item.kind === "video" ? (
        <Clapperboard
          aria-hidden
          className="absolute top-1 right-1 size-4 text-white drop-shadow"
          strokeWidth={2.25}
        />
      ) : null}
    </span>
  );
}

/** "DD/MM · HH:MM" pill in the profile time zone; the zone goes to the accessible text. */
function TimePill({
  tone,
  prefix,
  date,
  timezone,
}: {
  tone: Tone;
  prefix: string;
  date: Date | string;
  timezone: string;
}) {
  const f = formatInZone(date, timezone);
  const Icon = TONES[tone].icon;
  return (
    <p
      className={cn(
        "text-caption inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 tabular-nums",
        TONES[tone].pill,
      )}
      suppressHydrationWarning
    >
      <Icon aria-hidden className="size-3.5" strokeWidth={2.25} />
      <span className="sr-only">{prefix} </span>
      {f.day} · {f.time}
      <span className="sr-only"> ({zoneLabel(timezone)})</span>
    </p>
  );
}

function Row({
  item,
  profileId,
  tone,
  index,
  children,
}: {
  item: PublicationListItem;
  profileId: string;
  tone: Tone;
  index: number;
  children?: React.ReactNode;
}) {
  return (
    <li
      className="animate-rise relative flex gap-3 pl-6"
      style={{ animationDelay: `${Math.min(index, 7) * 35}ms` }}
    >
      {/* Timeline: rail + status dot. */}
      <span aria-hidden className="bg-outline absolute top-0 bottom-0 left-[7px] w-0.5" />
      <span
        aria-hidden
        className={cn(
          "ring-background absolute top-6 left-0.5 size-3 rounded-full ring-4",
          TONES[tone].dot,
        )}
      />
      <div
        className={cn(
          "bg-card shadow-card flex min-w-0 flex-1 gap-3 rounded-3xl border p-3",
          tone === "failed" ? "border-danger-ink/60" : "border-border",
        )}
      >
        <Link
          href={`/perfis/${profileId}/posts/${item.postId}`}
          className="press focus-visible:ring-ring focus-visible:ring-offset-background self-start rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          aria-label="Abrir publicação"
        >
          <Thumb item={item} />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {children}
          <p className="text-body text-muted-foreground line-clamp-2">
            {item.captionExcerpt || "Sem legenda"}
          </p>
        </div>
      </div>
    </li>
  );
}

function Section({
  title,
  tone,
  count,
  empty,
  children,
}: {
  title: string;
  tone: Tone;
  count: number;
  empty: React.ReactNode;
  children: React.ReactNode;
}) {
  const Icon = TONES[tone].icon;
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-2xl",
            TONES[tone].badge,
          )}
        >
          <Icon className="size-5" strokeWidth={2} />
        </span>
        <h2 className="font-display text-h2 flex-1">{title}</h2>
        <span
          className={cn(
            "font-display text-h2 tabular-nums",
            tone === "failed" && count > 0 ? "text-danger-ink" : "text-muted-foreground",
          )}
        >
          {count}
        </span>
      </div>
      {count === 0 ? empty : <ul className="flex flex-col gap-3">{children}</ul>}
    </section>
  );
}

export function ScheduledList({
  profileId,
  lists,
}: {
  profileId: string;
  lists: PublicationLists;
}) {
  const [rescheduling, setRescheduling] = useState<PublicationListItem | null>(null);

  return (
    <div className="flex flex-col gap-10">
      <Section
        title="Agendadas"
        tone="scheduled"
        count={lists.scheduled.length}
        empty={
          <EmptyState
            icon={CalendarClock}
            title="Agenda livre."
            description="Aprove um post e escolha a hora. A gente publica."
          >
            <Button asChild variant="secondary">
              <Link href={`/perfis/${profileId}`}>Ver o feed</Link>
            </Button>
          </EmptyState>
        }
      >
        {lists.scheduled.map((item, i) => (
          <Row key={item.id} item={item} profileId={profileId} tone="scheduled" index={i}>
            <div className="flex flex-wrap items-center gap-2">
              <TimePill
                tone="scheduled"
                prefix="Agendada para"
                date={item.scheduledAt}
                timezone={item.timezone}
              />
              {item.status === "publishing" ? (
                <span className="text-caption text-brand-ink inline-flex items-center gap-1">
                  <Loader2 aria-hidden className="size-3.5 motion-safe:animate-spin" />
                  Publicando agora…
                </span>
              ) : null}
            </div>
          </Row>
        ))}
      </Section>

      <Section
        title="Publicadas"
        tone="published"
        count={lists.published.length}
        empty={
          <p className="bg-surface-2/60 text-body text-muted-foreground rounded-3xl px-4 py-5 text-center">
            Nada publicado automaticamente ainda.
          </p>
        }
      >
        {lists.published.map((item, i) => (
          <Row key={item.id} item={item} profileId={profileId} tone="published" index={i}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <TimePill
                tone="published"
                prefix="Publicada em"
                date={item.publishedAt ?? item.scheduledAt}
                timezone={item.timezone}
              />
              {item.permalink ? (
                <a
                  href={item.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-ink text-caption focus-visible:ring-ring inline-flex min-h-11 items-center gap-1.5 rounded-full outline-none hover:underline focus-visible:ring-2"
                >
                  Abrir no Instagram
                  <ExternalLink aria-hidden className="size-3.5" />
                </a>
              ) : null}
            </div>
          </Row>
        ))}
      </Section>

      <Section
        title="Falhas"
        tone="failed"
        count={lists.failed.length}
        empty={
          <p className="bg-surface-2/60 text-body text-muted-foreground flex items-center justify-center gap-2 rounded-3xl px-4 py-5">
            <CalendarCheck aria-hidden className="text-success-ink size-5" />
            Nenhuma falha.
          </p>
        }
      >
        {lists.failed.map((item, i) => (
          <Row key={item.id} item={item} profileId={profileId} tone="failed" index={i}>
            <TimePill
              tone="failed"
              prefix="Era para"
              date={item.scheduledAt}
              timezone={item.timezone}
            />
            <p role="alert" className="text-danger-ink text-caption">
              {item.lastError ?? "Não foi possível publicar. Tente novamente."}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() => setRescheduling(item)}
            >
              <CalendarClock aria-hidden />
              Reagendar
            </Button>
          </Row>
        ))}
      </Section>

      {rescheduling ? (
        <ScheduleSheet
          open
          onOpenChange={(o) => {
            if (!o) setRescheduling(null);
          }}
          target={{
            mode: "reschedule",
            publicationId: rescheduling.id,
            current: rescheduling.scheduledAt,
          }}
          profileId={profileId}
          timezone={rescheduling.timezone}
          kind={rescheduling.kind}
        />
      ) : null}
    </div>
  );
}
