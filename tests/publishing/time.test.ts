import { describe, expect, it } from "vitest";
import {
  describeSchedule,
  formatInZone,
  toInputValues,
  zonedDateTimeToUtc,
  zoneLabel,
} from "@/lib/publishing/time";

describe("zonedDateTimeToUtc", () => {
  it("converts Sao Paulo (UTC-03:00)", () => {
    expect(zonedDateTimeToUtc("2026-12-01", "14:00", "America/Sao_Paulo").toISOString()).toBe(
      "2026-12-01T17:00:00.000Z",
    );
  });

  it("handles DST in America/New_York", () => {
    expect(zonedDateTimeToUtc("2026-07-01", "09:00", "America/New_York").toISOString()).toBe(
      "2026-07-01T13:00:00.000Z",
    );
    expect(zonedDateTimeToUtc("2026-12-01", "09:00", "America/New_York").toISOString()).toBe(
      "2026-12-01T14:00:00.000Z",
    );
  });

  it("handles the day of a DST change", () => {
    // 2026-03-08 02:00 EST jumps to 03:00 EDT; 12:00 local is already EDT (UTC-4).
    expect(zonedDateTimeToUtc("2026-03-08", "12:00", "America/New_York").toISOString()).toBe(
      "2026-03-08T16:00:00.000Z",
    );
    expect(zonedDateTimeToUtc("2026-03-08", "01:30", "America/New_York").toISOString()).toBe(
      "2026-03-08T06:30:00.000Z",
    );
  });

  it("supports UTC and half-hour zones", () => {
    expect(zonedDateTimeToUtc("2026-12-01", "00:00", "UTC").toISOString()).toBe(
      "2026-12-01T00:00:00.000Z",
    );
    expect(zonedDateTimeToUtc("2026-12-01", "10:00", "Asia/Kolkata").toISOString()).toBe(
      "2026-12-01T04:30:00.000Z",
    );
  });

  it("throws on invalid input", () => {
    expect(() => zonedDateTimeToUtc("2026-02-30", "10:00", "UTC")).toThrow();
    expect(() => zonedDateTimeToUtc("2026-12-01", "25:00", "UTC")).toThrow();
    expect(() => zonedDateTimeToUtc("2026-12-01", "10:60", "UTC")).toThrow();
    expect(() => zonedDateTimeToUtc("01/12/2026", "10:00", "UTC")).toThrow();
    expect(() => zonedDateTimeToUtc("2026-12-01", "", "UTC")).toThrow();
    expect(() => zonedDateTimeToUtc("2026-12-01", "10:00", "Not/AZone")).toThrow();
  });
});

describe("formatting", () => {
  const instant = new Date("2026-12-01T17:00:00Z");

  it("formats an instant in the zone", () => {
    expect(formatInZone(instant, "America/Sao_Paulo")).toEqual({
      day: "01/12",
      full: "01/12/2026",
      time: "14:00",
    });
    expect(formatInZone("2026-12-01T02:30:00Z", "America/Sao_Paulo").day).toBe("30/11");
  });

  it("round-trips through input values", () => {
    const v = toInputValues(instant, "America/Sao_Paulo");
    expect(v).toEqual({ date: "2026-12-01", time: "14:00" });
    expect(zonedDateTimeToUtc(v.date, v.time, "America/Sao_Paulo").getTime()).toBe(
      instant.getTime(),
    );
  });

  it("labels zones", () => {
    expect(zoneLabel("America/Sao_Paulo")).toBe("Brasília");
    expect(zoneLabel("America/New_York")).toBe("New York");
    expect(zoneLabel("UTC")).toBe("UTC");
    expect(describeSchedule(instant, "America/Sao_Paulo")).toBe("01/12 às 14:00 (Brasília)");
  });
});
