/**
 * Transparent, provider-neutral metrics for saved research observations.
 *
 * These values are Planner-derived, never provider facts. The version is
 * intentionally public so a future formula change can be explained without
 * silently changing the meaning of an existing review.
 */
export const RESEARCH_METRICS_VERSION = "v1" as const;

export type ResearchMetricInput = {
  views?: number | null | undefined;
  reach?: number | null | undefined;
  likes?: number | null | undefined;
  comments?: number | null | undefined;
  saved?: number | null | undefined;
  shares?: number | null | undefined;
  interactions?: number | null | undefined;
};

export type PerformanceBand = "breakout" | "strong" | "above_baseline" | "baseline";

export type ResearchDerivedMetrics = {
  interactionCount: number | null;
  engagementRatePercent: number | null;
  engagementDenominator: "views" | "reach" | null;
  engagementPartial: boolean;
  outlierScore: number | null;
  performanceBand: PerformanceBand | null;
  peerSampleSize: number;
};

function finiteNonNegative(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Prefer the provider's normalized interaction total. When it is absent,
 * derive a complete total only when all available interaction dimensions are
 * present; partial sums would make rows incomparable across providers.
 */
export function getInteractionCount(input: ResearchMetricInput): number | null {
  const normalized = finiteNonNegative(input.interactions);
  if (normalized !== null) return normalized;

  const likes = finiteNonNegative(input.likes);
  const comments = finiteNonNegative(input.comments);
  if (
    likes !== null &&
    comments !== null &&
    input.saved === undefined &&
    input.shares === undefined
  ) {
    return likes + comments;
  }

  const dimensions = [input.likes, input.comments, input.saved, input.shares];
  if (dimensions.some((value) => value !== null && value !== undefined)) {
    if (dimensions.some((value) => finiteNonNegative(value) === null)) return null;
    return dimensions.reduce((total: number, value) => total + (finiteNonNegative(value) ?? 0), 0);
  }
  return null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function bandForScore(score: number | null): PerformanceBand | null {
  if (score === null) return null;
  if (score >= 3) return "breakout";
  if (score >= 1.5) return "strong";
  if (score >= 1.15) return "above_baseline";
  return "baseline";
}

/**
 * Derive one observation's metrics against a bounded peer set. Outlier score
 * is views divided by the peer median; at least two valid peer observations
 * are required so a lone row is never presented as a winner.
 */
export function calculateResearchMetrics(
  input: ResearchMetricInput,
  peerInputs: ResearchMetricInput[] = [input],
): ResearchDerivedMetrics {
  const interactionCount = getInteractionCount(input);
  const views = finiteNonNegative(input.views);
  const reach = finiteNonNegative(input.reach);
  const denominator =
    views !== null && views > 0 ? views : reach !== null && reach > 0 ? reach : null;
  const engagementDenominator =
    views !== null && views > 0 ? "views" : reach !== null && reach > 0 ? "reach" : null;
  const engagementRatePercent =
    interactionCount !== null && denominator !== null
      ? (interactionCount / denominator) * 100
      : null;

  const peerViews = peerInputs
    .map((peer) => finiteNonNegative(peer.views))
    .filter((value): value is number => value !== null && value > 0);
  const baseline = peerViews.length >= 2 ? median(peerViews) : null;
  const outlierScore =
    views !== null && views > 0 && baseline !== null && baseline > 0 ? views / baseline : null;

  return {
    interactionCount,
    engagementRatePercent,
    engagementDenominator,
    // Falling back from views to reach is explicitly partial because the
    // formula is no longer using the preferred post-view denominator.
    engagementPartial: engagementRatePercent !== null && engagementDenominator === "reach",
    outlierScore,
    performanceBand: bandForScore(outlierScore),
    peerSampleSize: peerViews.length,
  };
}

export function formatResearchPercent(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}
