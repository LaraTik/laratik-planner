import { describe, expect, it } from "vitest";
import {
  expandRecurrence,
  HolidayCalendarSchema,
  isHolidayDate,
  RecurrenceRuleSchema,
  resolveHolidaySet,
} from "@/lib/planning/recurrence";

/**
 * FEAT-13 (GAP-FULL-REVIEW-2026-08-25) — recurrence + holiday
 * suppression unit tests. The functions are pure (no DB, no
 * `Date.now()`), so the tests are deterministic and the file
 * exercises the contracts the calendar view depends on.
 */

describe("RecurrenceRuleSchema", () => {
  it("defaults to weekly with interval 1 when only the base fields are present", () => {
    const result = RecurrenceRuleSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.frequency).toBe("weekly");
      expect(result.data.interval).toBe(1);
    }
  });

  it("accepts a weekly rule on Monday for 8 weeks", () => {
    const result = RecurrenceRuleSchema.safeParse({
      frequency: "weekly",
      interval: 1,
      byWeekday: [1],
      count: 8,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an interval outside 1..52", () => {
    expect(RecurrenceRuleSchema.safeParse({ interval: 0 }).success).toBe(false);
    expect(RecurrenceRuleSchema.safeParse({ interval: 53 }).success).toBe(false);
  });

  it("rejects a weekday outside 1..7", () => {
    expect(RecurrenceRuleSchema.safeParse({ byWeekday: [0] }).success).toBe(false);
    expect(RecurrenceRuleSchema.safeParse({ byWeekday: [8] }).success).toBe(false);
  });

  it("rejects an until date that is not YYYY-MM-DD", () => {
    expect(RecurrenceRuleSchema.safeParse({ until: "2026/12/31" }).success).toBe(false);
    expect(RecurrenceRuleSchema.safeParse({ until: "31-12-2026" }).success).toBe(false);
  });
});

describe("HolidayCalendarSchema", () => {
  it("accepts a country code only", () => {
    expect(HolidayCalendarSchema.safeParse({ country: "CA" }).success).toBe(true);
  });

  it("accepts an explicit list of dates", () => {
    expect(
      HolidayCalendarSchema.safeParse({ explicitDates: ["2026-12-25", "2026-12-26"] }).success,
    ).toBe(true);
  });

  it("rejects a non-2-letter country code", () => {
    expect(HolidayCalendarSchema.safeParse({ country: "Canada" }).success).toBe(false);
    expect(HolidayCalendarSchema.safeParse({ country: "ca" }).success).toBe(false);
  });

  it("rejects a malformed explicit date", () => {
    expect(HolidayCalendarSchema.safeParse({ explicitDates: ["not-a-date"] }).success).toBe(false);
  });
});

describe("resolveHolidaySet", () => {
  it("returns an empty set when the calendar is null/undefined", () => {
    expect(resolveHolidaySet(null).size).toBe(0);
    expect(resolveHolidaySet(undefined).size).toBe(0);
  });

  it("includes both the explicit list and the country table", () => {
    const set = resolveHolidaySet({
      country: "CA",
      explicitDates: ["2026-12-31"],
    });
    // Canada Day from the country table
    expect(set.has("2026-07-01")).toBe(true);
    // Custom workspace-specific day
    expect(set.has("2026-12-31")).toBe(true);
  });

  it("ignores dates outside the range when one is supplied", () => {
    const set = resolveHolidaySet(
      { explicitDates: ["2026-12-25", "2027-12-25"] },
      new Date("2026-01-01T00:00:00Z"),
      new Date("2027-01-01T00:00:00Z"),
    );
    expect(set.has("2026-12-25")).toBe(true);
    expect(set.has("2027-12-25")).toBe(false);
  });
});

describe("isHolidayDate", () => {
  const set = new Set(["2026-07-01"]);
  it("matches when the date's YYYY-MM-DD is in the set", () => {
    expect(isHolidayDate(new Date("2026-07-01T15:00:00Z"), set)).toBe(true);
  });
  it("does not match a different day", () => {
    expect(isHolidayDate(new Date("2026-07-02T15:00:00Z"), set)).toBe(false);
  });
});

describe("expandRecurrence", () => {
  const rangeStart = new Date("2026-08-01T00:00:00Z");
  const rangeEnd = new Date("2026-09-01T00:00:00Z");

  it("returns the base date only for a no-recurrence call (count=1)", () => {
    const dates = expandRecurrence(
      { frequency: "weekly", interval: 1, count: 1 },
      new Date("2026-08-10T00:00:00Z"),
      rangeStart,
      rangeEnd,
    );
    expect(dates).toHaveLength(1);
    expect(dates[0]?.toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });

  it("expands a weekly rule to N occurrences", () => {
    const dates = expandRecurrence(
      { frequency: "weekly", interval: 1, count: 3 },
      new Date("2026-08-10T00:00:00Z"),
      rangeStart,
      new Date("2026-12-31T00:00:00Z"),
    );
    expect(dates).toHaveLength(3);
    expect(dates[0]?.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(dates[1]?.toISOString()).toBe("2026-08-17T00:00:00.000Z");
    expect(dates[2]?.toISOString()).toBe("2026-08-24T00:00:00.000Z");
  });

  it("stops at the until date", () => {
    const dates = expandRecurrence(
      { frequency: "weekly", interval: 1, until: "2026-08-20" },
      new Date("2026-08-10T00:00:00Z"),
      rangeStart,
      new Date("2026-12-31T00:00:00Z"),
    );
    // 08-10 and 08-17 land before 08-20 23:59:59; 08-24 does not.
    expect(dates).toHaveLength(2);
  });

  it("filters occurrences outside the range window", () => {
    const dates = expandRecurrence(
      { frequency: "weekly", interval: 1, count: 4 },
      new Date("2026-07-20T00:00:00Z"), // base date is BEFORE the range
      rangeStart,
      rangeEnd,
    );
    // 07-20 < 08-01 (excluded); 07-27 excluded; 08-03 in range;
    // 08-10 in range; 08-17 in range; 08-24 in range; 08-31 in range.
    // The base date itself is not in-range, but its +1,+2,+3,+4,+5,+6
    // offsets are. We include those.
    for (const d of dates) {
      expect(d.getTime()).toBeGreaterThanOrEqual(rangeStart.getTime());
      expect(d.getTime()).toBeLessThan(rangeEnd.getTime());
    }
  });

  it("returns an empty array when the range is inverted", () => {
    const dates = expandRecurrence(
      { frequency: "weekly", interval: 1, count: 1 },
      new Date("2026-08-10T00:00:00Z"),
      rangeEnd,
      rangeStart,
    );
    expect(dates).toHaveLength(0);
  });
});
