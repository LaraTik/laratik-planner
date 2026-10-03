import { describe, expect, it } from "vitest";
import {
  calculateResearchMetrics,
  formatResearchPercent,
  getInteractionCount,
  RESEARCH_METRICS_VERSION,
} from "@/lib/research/metrics";

describe("research metrics", () => {
  it("uses the normalized interaction total when the provider supplies it", () => {
    expect(getInteractionCount({ interactions: 42, likes: 1, comments: 2 })).toBe(42);
  });

  it("does not invent a partial interaction total", () => {
    expect(getInteractionCount({ likes: 10, comments: null, saved: 2, shares: 1 })).toBeNull();
  });

  it("uses likes and comments when optional dimensions were not provided", () => {
    expect(getInteractionCount({ likes: 10, comments: 2 })).toBe(12);
  });

  it("derives engagement from views and marks reach fallback as partial", () => {
    expect(calculateResearchMetrics({ interactions: 25, views: 500 }).engagementRatePercent).toBe(
      5,
    );
    const fallback = calculateResearchMetrics({ interactions: 25, reach: 500 });
    expect(fallback.engagementRatePercent).toBe(5);
    expect(fallback.engagementPartial).toBe(true);
    expect(fallback.engagementDenominator).toBe("reach");
  });

  it("requires at least two valid peer views before showing an outlier score", () => {
    expect(calculateResearchMetrics({ views: 900 }).outlierScore).toBeNull();
    const metrics = calculateResearchMetrics({ views: 900 }, [
      { views: 100 },
      { views: 100 },
      { views: 900 },
    ]);
    expect(metrics.outlierScore).toBe(9);
    expect(metrics.performanceBand).toBe("breakout");
    expect(metrics.peerSampleSize).toBe(3);
  });

  it("keeps missing and negative values unavailable", () => {
    const metrics = calculateResearchMetrics({ views: -1, interactions: -1 });
    expect(metrics.engagementRatePercent).toBeNull();
    expect(metrics.outlierScore).toBeNull();
    expect(metrics.interactionCount).toBeNull();
  });

  it("exposes a stable formula version and readable percent formatting", () => {
    expect(RESEARCH_METRICS_VERSION).toBe("v1");
    expect(formatResearchPercent(5)).toBe("5.0%");
    expect(formatResearchPercent(12.4)).toBe("12%");
    expect(formatResearchPercent(null)).toBeNull();
  });
});
