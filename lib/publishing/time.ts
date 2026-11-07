/**
 * Time zone helpers for scheduling (docs/12 section 4.7). Pure: safe for client and server.
 * No date library: everything is derived from `Intl.DateTimeFormat`.
 */

type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Wall-clock parts of an instant in the given zone. */
function zonedParts(ms: number, timeZone: string): Parts {
  const out: Record<string, number> = {};
  for (const p of formatterFor(timeZone).formatToParts(new Date(ms))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour % 24,
    minute: out.minute,
    second: out.second,
  };
}

/** Offset (zone minus UTC) in ms at the given instant. */
function offsetAt(ms: number, timeZone: string): number {
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

/**
 * Converts a local date ("YYYY-MM-DD") and time ("HH:MM") in an IANA zone to the UTC instant.
 * Throws on malformed or impossible input (e.g. 2026-02-30, 25:00) or an unknown zone.
 * Local times that do not exist (DST gap) resolve to the instant right after the gap.
 */
export function zonedDateTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const d = DATE_RE.exec(dateStr);
  const t = TIME_RE.exec(timeStr);
  if (!d || !t) throw new Error("Data ou hora inválida.");
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hour, minute] = [Number(t[1]), Number(t[2])];
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(guess);
  if (
    hour > 23 ||
    minute > 59 ||
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error("Data ou hora inválida.");
  }
  // Throws RangeError for an unknown zone.
  const first = offsetAt(guess, timeZone);
  let utc = guess - first;
  const second = offsetAt(utc, timeZone);
  if (second !== first) utc = guess - second;
  return new Date(utc);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "DD/MM", "DD/MM/YYYY" and "HH:MM" of an instant in the zone. */
export function formatInZone(
  date: Date | string,
  timeZone: string,
): { day: string; full: string; time: string } {
  const p = zonedParts(new Date(date).getTime(), timeZone);
  const day = `${pad(p.day)}/${pad(p.month)}`;
  return { day, full: `${day}/${p.year}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

/** Values for `<input type="date">` and `<input type="time">` of an instant in the zone. */
export function toInputValues(
  date: Date | string,
  timeZone: string,
): { date: string; time: string } {
  const p = zonedParts(new Date(date).getTime(), timeZone);
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/** Friendly zone name: "Brasília" for America/Sao_Paulo, else the city part of the IANA name. */
export function zoneLabel(timeZone: string): string {
  if (timeZone === "America/Sao_Paulo") return "Brasília";
  const city = timeZone.split("/").pop() ?? timeZone;
  return city.replace(/_/g, " ");
}

/** "DD/MM às HH:MM (Brasília)". */
export function describeSchedule(date: Date | string, timeZone: string): string {
  const f = formatInZone(date, timeZone);
  return `${f.day} às ${f.time} (${zoneLabel(timeZone)})`;
}
