import { describe, expect, it } from "vitest";
import { formatDateInTimeZoneForInput, parseInputAsWorkspaceDate } from "@/lib/utils/date";

/**
 * Audit recipe (commit memo):
 *  - Form's `<input type="datetime-local">` interprets the
 *    value in the *browser's local clock*.
 *  - The previous helper (`formatDateForInput`) also read
 *    `Date#getHours()` etc., which return the **browser's**
 *    local clock — so a planner in NY editing a Berlin-
 *    timezone item saw a different wall-clock reading on
 *    the form than the UI metadata displayed, and the
 *    value sent to the server on submit was a different
 *    `YYYY-MM-DDTHH:mm` than what they saw.
 *  - Fix: format & parse in the **workspace** IANA TZ so
 *    "9 AM Berlin" round-trips as the same Berlin wall-
 *    clock no matter which browser-local clock the planner
 *    is currently in.
 *
 * These tests assert both the format (wall-clock in workspace
 * TZ, NOT browser TZ) and the parse (an input value typed
 * by the user is interpreted as a workspace-local instant,
 * not a browser-local one).
 */

describe("formatDateInTimeZoneForInput", () => {
  it("formats a UTC instant as the *workspace* wall-clock, not the browser's", () => {
    // 2026-09-30T07:00:00Z = 09:00 Europe/Berlin (CEST, UTC+2).
    // A user in NY (UTC-4) would see "03:00" if we naively
    // sliced the ISO string; the workspace-aware helper must
    // emit "09:00" regardless.
    const instant = new Date("2026-09-30T07:00:00Z");
    expect(formatDateInTimeZoneForInput(instant, "Europe/Berlin")).toBe("2026-09-30T09:00");
  });

  it("returns the same input value across DST boundaries (winter CET vs summer CEST)", () => {
    // 2026-02-15T08:00:00Z = 09:00 Europe/Berlin (CET, UTC+1) in winter.
    const winterInstant = new Date("2026-02-15T08:00:00Z");
    expect(formatDateInTimeZoneForInput(winterInstant, "Europe/Berlin")).toBe("2026-02-15T09:00");

    // 2026-08-29T07:00:00Z = 09:00 Europe/Berlin (CEST, UTC+2) in summer.
    const summerInstant = new Date("2026-08-29T07:00:00Z");
    expect(formatDateInTimeZoneForInput(summerInstant, "Europe/Berlin")).toBe("2026-08-29T09:00");
  });

  it("respects the requested IANA timezone instead of the runtime's UTC default", () => {
    // Same instant, but render in three different zones — the
    // output must vary accordingly. `formatInTimeZone` is
    // canonical; the helper delegates to it.
    const instant = new Date("2026-09-30T15:00:00Z");
    expect(formatDateInTimeZoneForInput(instant, "UTC")).toBe("2026-09-30T15:00");
    expect(formatDateInTimeZoneForInput(instant, "America/New_York")).toBe("2026-09-30T11:00");
    expect(formatDateInTimeZoneForInput(instant, "Asia/Tokyo")).toBe("2026-10-01T00:00");
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(formatDateInTimeZoneForInput("2026-09-30T07:00:00Z", "Europe/Berlin")).toBe(
      "2026-09-30T09:00",
    );
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatDateInTimeZoneForInput(new Date(NaN), "Europe/Berlin")).toBe("");
    expect(formatDateInTimeZoneForInput("not-a-date", "Europe/Berlin")).toBe("");
  });
});

describe("parseInputAsWorkspaceDate", () => {
  it("parses a wall-clock value as a workspace-local instant, not the browser's", () => {
    // User typed 09:00 intending 9 AM Berlin. The helper
    // must emit the UTC instant that corresponds to 9 AM
    // Europe/Berlin (= 07:00Z in CEST, UTC+2) — not 9 AM
    // the browser's local clock.
    const parsed = parseInputAsWorkspaceDate("2026-09-30T09:00", "Europe/Berlin");
    expect(parsed.toISOString()).toBe("2026-09-30T07:00:00.000Z");
  });

  it("round-trips a value through format → parse → format", () => {
    // This is the audit invariant: a value typed in Berlin
    // must round-trip back to itself regardless of whether
    // the user's browser clock is UTC-4 or anywhere else.
    const original = new Date("2026-09-30T07:00:00Z");
    const formatted = formatDateInTimeZoneForInput(original, "Europe/Berlin");
    expect(formatted).toBe("2026-09-30T09:00");
    const reparsed = parseInputAsWorkspaceDate(formatted, "Europe/Berlin");
    expect(reparsed.toISOString()).toBe(original.toISOString());
  });

  it("returns Invalid Date for an empty string", () => {
    expect(Number.isNaN(parseInputAsWorkspaceDate("", "Europe/Berlin").getTime())).toBe(true);
  });

  it("handles DST transitions correctly (winter CET vs summer CEST)", () => {
    // 9 AM Berlin in summer (CEST, UTC+2).
    const summer = parseInputAsWorkspaceDate("2026-08-29T09:00", "Europe/Berlin");
    expect(summer.toISOString()).toBe("2026-08-29T07:00:00.000Z");

    // 9 AM Berlin in winter (CET, UTC+1).
    const winter = parseInputAsWorkspaceDate("2026-02-15T09:00", "Europe/Berlin");
    expect(winter.toISOString()).toBe("2026-02-15T08:00:00.000Z");
  });
});
