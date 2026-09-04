import { describe, expect, it } from "vitest";
import { metricDateInTimeZone, nextDailySyncAt } from "@/lib/social/timezone";

describe("social analytics timezone boundaries", () => {
  it("uses the workspace calendar date instead of UTC", () => {
    expect(metricDateInTimeZone(new Date("2026-01-01T00:30:00.000Z"), "America/Los_Angeles")).toBe(
      "2025-12-31",
    );
    expect(metricDateInTimeZone(new Date("2026-01-01T00:30:00.000Z"), "Asia/Riyadh")).toBe(
      "2026-01-01",
    );
  });

  it("keeps the scheduled sync at 03:15 on the next local day across DST", () => {
    expect(nextDailySyncAt(new Date("2026-03-08T08:00:00.000Z"), "America/Los_Angeles")).toEqual(
      new Date("2026-03-09T10:15:00.000Z"),
    );
    expect(nextDailySyncAt(new Date("2026-11-01T07:00:00.000Z"), "America/Los_Angeles")).toEqual(
      new Date("2026-11-02T11:15:00.000Z"),
    );
  });
});
