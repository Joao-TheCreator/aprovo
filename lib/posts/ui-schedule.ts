/**
 * Shortcut chips of the ScheduleSheet (docs/14, area B): "Hoje 18:00", "Amanhã 09:00",
 * "Sáb 11:00", computed as wall-clock times in the profile time zone. Pure and client-safe.
 */
import { MIN_SCHEDULE_LEAD_MS } from "@/lib/publishing/contracts";
import { toInputValues, zonedDateTimeToUtc } from "@/lib/publishing/time";

export type ScheduleShortcut = {
  /** Stable key, also used to tell which chip matches the current inputs. */
  id: "today" | "tomorrow" | "saturday";
  label: string;
  date: string;
  time: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" plus `days`, calendar arithmetic only (no time zone involved). */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** 0 = Sunday ... 6 = Saturday, for a "YYYY-MM-DD" calendar date. */
function weekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Up to three shortcuts, skipping any that is not far enough in the future
 * (`MIN_SCHEDULE_LEAD_MS`) or that falls on a date already covered by an earlier chip.
 */
export function scheduleShortcuts(timeZone: string, now: Date = new Date()): ScheduleShortcut[] {
  let today: string;
  try {
    today = toInputValues(now, timeZone).date;
  } catch {
    return [];
  }
  const tomorrow = addDays(today, 1);
  // Next Saturday after tomorrow (so it never repeats the "Amanhã" date).
  let saturday = addDays(tomorrow, 1);
  while (weekday(saturday) !== 6) saturday = addDays(saturday, 1);

  const candidates: ScheduleShortcut[] = [
    { id: "today", label: "Hoje 18:00", date: today, time: "18:00" },
    { id: "tomorrow", label: "Amanhã 09:00", date: tomorrow, time: "09:00" },
    { id: "saturday", label: "Sáb 11:00", date: saturday, time: "11:00" },
  ];
  const minMs = now.getTime() + MIN_SCHEDULE_LEAD_MS;
  return candidates.filter((c) => {
    try {
      return zonedDateTimeToUtc(c.date, c.time, timeZone).getTime() >= minMs;
    } catch {
      return false;
    }
  });
}
