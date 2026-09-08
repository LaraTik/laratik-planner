import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRequestId, captureError } = vi.hoisted(() => ({
  getRequestId: vi.fn<() => string | undefined>(),
  captureError: vi.fn(),
}));

vi.mock("@/lib/observability/request-context", () => ({
  getRequestId,
}));

vi.mock("@/lib/observability/sentry", () => ({
  captureError,
}));

import {
  buildTrendRadarTags,
  captureTrendRadarError,
  TREND_RADAR_CAPABILITY,
} from "@/lib/observability/trend-radar-tags";

describe("Trend Radar observability tags", () => {
  beforeEach(() => {
    getRequestId.mockReset();
    captureError.mockReset();
  });

  it("builds the canonical tags and normalizes cost to non-negative cents", () => {
    expect(
      buildTrendRadarTags({
        platform: "x",
        source: "tiktok_trending",
        costCents: 12.9,
      }),
    ).toEqual({
      capability: TREND_RADAR_CAPABILITY,
      platform: "x",
      source: "tiktok_trending",
      costCents: 12,
    });

    expect(
      buildTrendRadarTags({
        platform: "youtube",
        source: "youtube",
        costCents: -4.2,
      }).costCents,
    ).toBe(0);
  });

  it("defaults an omitted cost to zero", () => {
    expect(buildTrendRadarTags({ platform: "instagram", source: "manual" }).costCents).toBe(0);
  });

  it("captures the error with canonical tags, request id, and context", () => {
    const err = new Error("source unavailable");
    getRequestId.mockReturnValue("req-trend-42");

    captureTrendRadarError(
      "trends.source.test",
      err,
      { platform: "tiktok", source: "tiktok_trending", costCents: 7.8 },
      { workspaceId: "workspace-1" },
    );

    expect(captureError).toHaveBeenCalledWith("trends.source.test", err, {
      workspaceId: "workspace-1",
      trendRadarTags: {
        capability: TREND_RADAR_CAPABILITY,
        platform: "tiktok",
        source: "tiktok_trending",
        costCents: 7,
      },
      requestId: "req-trend-42",
    });
  });

  it("passes an empty context and an undefined request id when none is available", () => {
    captureTrendRadarError("trends.source.refresh", "timeout", {
      platform: "x",
      source: "x_search",
    });

    expect(captureError).toHaveBeenCalledWith("trends.source.refresh", "timeout", {
      trendRadarTags: {
        capability: TREND_RADAR_CAPABILITY,
        platform: "x",
        source: "x_search",
        costCents: 0,
      },
      requestId: undefined,
    });
  });
});
