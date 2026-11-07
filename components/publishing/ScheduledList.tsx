"use client";

import Link from "next/link";
import { useState } from "react";

import { StatusPill } from "@/components/feed/StatusPill";
import { ScheduleSheet } from "@/components/publishing/ScheduleSheet";
import { Button } from "@/components/ui/button";
import type { PublicationListItem, PublicationLists } from "@/lib/publishing/contracts";
import { describeSchedule } from "@/lib/publishing/time";

function Thumb({ item }: { item: PublicationListItem }) {
  return item.thumbUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.thumbUrl} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
  ) : (
    <div aria-hidden className="bg-secondary size-16 shrink-0 rounded-lg" />
  );
}

function Row({
  item,
  profileId,
  children,
  when,
}: {
  item: PublicationListItem;
  profileId: string;
  when: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="bg-card border-border flex gap-3 rounded-2xl border p-3">
      <Link
        href={`/perfis/${profileId}/posts/${item.postId}`}
        className="focus-visible:ring-ring/50 rounded-lg outline-none focus-visible:ring-[3px]"
        aria-label="Abrir publicação"
      >
        <Thumb item={item} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-sm font-semibold" suppressHydrationWarning>
          {when}
        </p>
        <p className="text-muted-foreground line-clamp-2 text-sm">
          {item.captionExcerpt || "Sem legenda"}
        </p>
        {children}
      </div>
    </li>
  );
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-lg leading-6 font-semibold">
        {title} <span className="text-muted-foreground text-sm font-normal">({count})</span>
      </h2>
      {count === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">{children}</ul>
      )}
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
    <div className="flex flex-col gap-6">
      <Section
        title="Agendadas"
        count={lists.scheduled.length}
        empty="Nenhuma publicação agendada. Abra uma publicação aprovada e toque em Agendar."
      >
        {lists.scheduled.map((item) => (
          <Row
            key={item.id}
            item={item}
            profileId={profileId}
            when={describeSchedule(item.scheduledAt, item.timezone)}
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status="scheduled" />
              {item.status === "publishing" ? (
                <span className="text-muted-foreground text-xs">Publicando agora…</span>
              ) : null}
            </div>
          </Row>
        ))}
      </Section>

      <Section
        title="Publicadas"
        count={lists.published.length}
        empty="Nada publicado automaticamente ainda."
      >
        {lists.published.map((item) => (
          <Row
            key={item.id}
            item={item}
            profileId={profileId}
            when={`Publicada em ${describeSchedule(item.publishedAt ?? item.scheduledAt, item.timezone)}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status="published" />
              {item.permalink ? (
                <a
                  href={item.permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-roxo focus-visible:ring-ring/50 inline-flex min-h-11 items-center rounded text-sm font-semibold underline outline-none focus-visible:ring-[3px]"
                >
                  Abrir no Instagram
                </a>
              ) : null}
            </div>
          </Row>
        ))}
      </Section>

      <Section title="Falhas" count={lists.failed.length} empty="Nenhuma falha.">
        {lists.failed.map((item) => (
          <Row
            key={item.id}
            item={item}
            profileId={profileId}
            when={`Era para ${describeSchedule(item.scheduledAt, item.timezone)}`}
          >
            <StatusPill status="publish_failed" className="self-start" />
            <p role="alert" className="text-destructive text-sm">
              {item.lastError ?? "Não foi possível publicar. Tente novamente."}
            </p>
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => setRescheduling(item)}
            >
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
