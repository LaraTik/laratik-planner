import { describe, expect, it } from "vitest";
import {
  attributedSpendForDate,
  buildAdContext,
  normalizeAdvertisingSyncDateRange,
  advertisingSyncFailureStatus,
  ADVERTISING_SYNC_MAX_ATTEMPTS,
  nextAdvertisingRetryAt,
} from "@/lib/advertising/sync-worker";

describe("advertising sync worker retry policy", () => {
  const now = new Date("2026-10-13T12:00:00.000Z");

  it.each([
    [0, "2026-10-13T12:15:00.000Z"],
    [1, "2026-10-13T12:15:00.000Z"],
    [2, "2026-10-13T13:00:00.000Z"],
    [3, "2026-10-13T18:00:00.000Z"],
    [99, "2026-10-13T18:00:00.000Z"],
  ])("schedules attempt %s with bounded backoff", (attempt, expected) => {
    expect(nextAdvertisingRetryAt(now, attempt).toISOString()).toBe(expected);
  });

  it("dead-letters after the bounded retry budget and retries after explicit re-enable", () => {
    expect(ADVERTISING_SYNC_MAX_ATTEMPTS).toBe(4);
    expect(advertisingSyncFailureStatus(3)).toBe("failed");
    expect(advertisingSyncFailureStatus(4)).toBe("dead_letter");
  });

  it("uses a requested backfill window and allocates each canonical fact once", () => {
    const context = buildAdContext(
      {
        id: "account",
        provider: "meta",
        externalAccountId: "act_1",
        agencyId: "agency",
        name: "Account",
        currency: "EUR",
        timezone: "Europe/Berlin",
        connectionId: "connection",
        status: "active",
      },
      now,
      { since: "2026-01-01", until: "2026-01-31" },
    );
    expect(context.dateRange).toEqual({ since: "2026-01-01", until: "2026-01-31" });
    const observations = [
      {
        externalAdId: "ad-1",
        externalCampaignId: "campaign-1",
        externalAdSetId: "adset-1",
        reportDate: "2026-01-01",
        currency: "EUR",
        spend: "10",
        impressions: 10,
        clicks: 1,
        attributionWindow: "account",
        actionReportTime: "impression",
      },
      {
        externalAdId: "ad-2",
        externalCampaignId: "campaign-2",
        externalAdSetId: "adset-2",
        reportDate: "2026-01-01",
        currency: "EUR",
        spend: "5",
        impressions: 5,
        clicks: 1,
        attributionWindow: "account",
        actionReportTime: "impression",
      },
    ] as const;
    expect(
      attributedSpendForDate(
        observations,
        [
          { campaignIds: ["campaign-1"], adSetIds: null, adIds: null },
          { campaignIds: null, adSetIds: null, adIds: ["ad-1"] },
        ],
        "2026-01-01",
      ),
    ).toBe("10");
  });

  it("bounds operational backfills to a valid 366-day window", () => {
    expect(normalizeAdvertisingSyncDateRange({ since: "2026-01-01", until: "2026-12-31" })).toEqual(
      { since: "2026-01-01", until: "2026-12-31" },
    );
    expect(() =>
      normalizeAdvertisingSyncDateRange({ since: "2026-01-02", until: "2026-01-01" }),
    ).toThrow("advertising_sync_date_range_invalid");
    expect(() =>
      normalizeAdvertisingSyncDateRange({ since: "2025-01-01", until: "2026-01-03" }),
    ).toThrow("advertising_sync_date_range_invalid");
  });
});
