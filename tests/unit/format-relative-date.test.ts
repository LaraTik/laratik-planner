import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";

/**
 * The function under test accepts an explicit `now` parameter, so the
 * tests are deterministic without faking `Date.now()`. We still
 * anchor the clock with `vi.useFakeTimers` so the absolute-date
 * output ("Oct 12, 2024" vs the current year) is stable and the
 * `now` value does not age the test annually (TEST-14,
 * GAP-FULL-REVIEW-2026-08-25). If a future refactor switches the
 * implementation to read `Date.now()` directly, the fake timer makes
 * the regression visible immediately rather than years later.
 */
describe("formatRelativeDate", () => {
  // Pin wall-clock to a stable instant so the absolute-date cases
  // don't depend on whatever today happens to be when CI runs.
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  // The "now" the function sees — explicit so each test case reads
  // the same value without re-importing the constant.
  const now = new Date("2026-08-20T12:00:00Z");

  it("returns 'just now' for events in the last minute", () => {
    const d = new Date("2026-08-20T11:59:30Z");
    expect(formatRelativeDate(d, now)).toBe("just now");
  });

  it("formats minutes within the hour", () => {
    const d = new Date("2026-08-20T11:55:00Z");
    expect(formatRelativeDate(d, now)).toBe("5m ago");
  });

  it("formats hours within the day", () => {
    const d = new Date("2026-08-20T10:00:00Z");
    expect(formatRelativeDate(d, now)).toBe("2h ago");
  });

  it("formats days within the week", () => {
    const d = new Date("2026-08-17T12:00:00Z");
    expect(formatRelativeDate(d, now)).toBe("3d ago");
  });

  it("formats older events as an absolute date", () => {
    const d = new Date("2024-10-12T00:00:00Z");
    expect(formatRelativeDate(d, now)).toMatch(/Oct 12, 2024/);
  });

  it("accepts ISO strings", () => {
    const d = "2026-08-20T11:55:00Z";
    expect(formatRelativeDate(d, now)).toBe("5m ago");
  });

  it("returns an absolute date for future events", () => {
    const d = new Date("2026-09-15T00:00:00Z");
    const result = formatRelativeDate(d, now);
    expect(result).not.toMatch(/ago/);
    expect(result).toMatch(/2026/);
  });

  it("returns a dash for unparseable input", () => {
    expect(formatRelativeDate("not-a-date", now)).toBe("—");
    expect(formatRelativeDate(new Date(NaN), now)).toBe("—");
  });
});
