import { describe, expect, it } from "vitest";
import { formatOperationalDate } from "@/lib/dashboard/format-date";

/**
 * formatOperationalDate — pin the operational labels the row uses
 * to surface schedule slippage. The "3 days overdue" wording is the
 * public contract; the page should never regress to "3 days ago" or
 * hide the overdue signal.
 */

const NOW = new Date("2026-08-15T12:00:00.000Z");
const TZ = "Europe/Berlin";

describe("formatOperationalDate", () => {
  it("renders Today with the time", () => {
    const r = formatOperationalDate(new Date("2026-08-15T18:00:00.000Z"), NOW, TZ);
    expect(r.label).toMatch(/^Today · /);
    expect(r.relative).toBe("today");
    expect(r.overdueDays).toBe(0);
  });

  it("renders Tomorrow with the time", () => {
    const r = formatOperationalDate(new Date("2026-08-16T12:00:00.000Z"), NOW, TZ);
    expect(r.label).toMatch(/^Tomorrow · /);
    expect(r.relative).toBe("tomorrow");
  });

  it("renders 'In N days · time' for the 2-3 day window", () => {
    const r = formatOperationalDate(new Date("2026-08-17T12:00:00.000Z"), NOW, TZ);
    expect(r.label).toMatch(/^In 2 days · /);
    expect(r.relative).toBe("future");
  });

  it("renders 'Mon Day' for dates more than 3 days out", () => {
    const r = formatOperationalDate(new Date("2026-08-25T12:00:00.000Z"), NOW, TZ);
    expect(r.label).toBe("Aug 25");
    expect(r.relative).toBe("future");
  });

  it("renders '1 day overdue' for yesterday", () => {
    const r = formatOperationalDate(new Date("2026-08-14T12:00:00.000Z"), NOW, TZ);
    expect(r.label).toBe("1 day overdue");
    expect(r.relative).toBe("yesterday");
    expect(r.overdueDays).toBe(1);
  });

  it("renders '3 days overdue' for a 3-day-old row", () => {
    const r = formatOperationalDate(new Date("2026-08-12T12:00:00.000Z"), NOW, TZ);
    expect(r.label).toBe("3 days overdue");
    expect(r.relative).toBe("past");
    expect(r.overdueDays).toBe(3);
  });

  it("uses singular 'day' for 1-day overdue", () => {
    const r = formatOperationalDate(new Date("2026-08-14T12:00:00.000Z"), NOW, TZ);
    expect(r.label).toMatch(/^1 day /);
  });

  it("uses the workspace timezone for day boundaries", () => {
    const r = formatOperationalDate(
      new Date("2026-08-16T00:30:00.000Z"),
      new Date("2026-08-15T22:30:00.000Z"),
      "Europe/Berlin",
    );
    expect(r.relative).toBe("today");
    expect(r.timeLabel).toBe("02:30");
  });

  it("keeps Arabic date parts localized while retaining Western digits", () => {
    const r = formatOperationalDate(new Date("2026-08-25T12:00:00.000Z"), NOW, TZ, "ar");
    expect(r.monthDayLabel).toContain("أغسطس");
    expect(r.monthDayLabel).toMatch(/25/);
  });
});
