import { describe, expect, it } from "vitest";
import { buildDataHealthSummary } from "@/lib/advertising/reporting-health";

const base = {
  syncStatus: "succeeded" as const,
  partial: false,
  freshness: "fresh" as const,
  lastSuccessfulSyncAt: "2026-10-18T10:00:00.000Z",
  since: "2026-10-01",
  until: "2026-10-18",
  timezone: "Europe/Berlin",
  currency: "EUR",
};

describe("advertising data health", () => {
  it("marks a complete fresh sync as complete", () => {
    expect(buildDataHealthSummary(base)).toMatchObject({
      state: "complete",
      coverage: "complete",
      issues: [],
    });
  });

  it("distinguishes partial coverage from delayed data", () => {
    expect(buildDataHealthSummary({ ...base, partial: true })).toMatchObject({
      state: "partial",
      coverage: "partial",
      issues: ["partial_coverage"],
    });
    expect(buildDataHealthSummary({ ...base, freshness: "stale" })).toMatchObject({
      state: "delayed",
      coverage: "complete",
      issues: ["stale_data"],
    });
  });

  it("does not report complete coverage for an explicitly partial sync", () => {
    expect(
      buildDataHealthSummary({
        ...base,
        syncStatus: "partial",
      }),
    ).toMatchObject({
      state: "partial",
      coverage: "partial",
      issues: ["partial_coverage"],
    });
  });

  it("marks missing history unavailable without converting it to zero", () => {
    expect(
      buildDataHealthSummary({
        ...base,
        syncStatus: null,
        lastSuccessfulSyncAt: null,
        freshness: "unknown",
      }),
    ).toMatchObject({
      state: "unavailable",
      coverage: "unavailable",
      issues: ["no_successful_sync"],
    });
  });
});
