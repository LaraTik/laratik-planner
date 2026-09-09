import { describe, expect, it } from "vitest";
import {
  formatTrendFreshness,
  MIN_TREND_SOURCES,
  trendLifecycleMessageKey,
} from "@/lib/trends/presentation";

describe("Trend Radar UX contracts", () => {
  it("requires four sources before onboarding can complete", () => {
    expect(MIN_TREND_SOURCES).toBe(4);
  });

  it("maps lifecycle values to catalog keys", () => {
    expect(trendLifecycleMessageKey("emerging")).toBe("trends.card.lifecycleEmerging");
    expect(trendLifecycleMessageKey("peaking")).toBe("trends.card.lifecyclePeaking");
  });

  it("formats freshness with locale-aware relative time", () => {
    const now = Date.parse("2026-09-09T12:00:00.000Z");
    expect(formatTrendFreshness("2026-09-09T11:00:00.000Z", "en", now)).toContain("hour");
    expect(formatTrendFreshness("2026-09-07T12:00:00.000Z", "ar", now)).toBeTruthy();
  });
});
