import type { MetricSeriesPoint } from "@/lib/social/analytics";

/**
 * M4 — social-analytics "feel" improvement.
 *
 * A tiny 60×16 inline SVG sparkline showing the last 7 days of
 * follower count. Rendered next to the per-channel card's
 * last-synced line as a glanceable trend signal. The full chart
 * (with axes, hover, and exact-value table) lives below the card.
 *
 * Render rules (mirrors the existing `SocialGrowthChart`):
 *
 *   - same null-as-gap policy: a missing day breaks the polyline
 *   - renders nothing if there are fewer than 2 non-null points
 *     in the 7-day window
 *   - no axes, no labels, no hover tooltip — that information
 *     belongs in the full chart and table
 *
 * The component is a Server Component. It accepts a `MetricSeriesPoint[]`
 * and renders inline in the channel card header.
 *
 * Data-testid:
 *   - `social-sparkline` — the sparkline container (when rendered)
 *   - `social-sparkline-<channelId>` — per-channel sparkline
 */

const SPARK_WIDTH = 60;
const SPARK_HEIGHT = 16;

export function SocialSparkline({
  channelId,
  series,
  ariaLabel,
}: {
  channelId: string;
  series: MetricSeriesPoint[];
  /** Pre-formatted label for screen readers, e.g. "Food Game, 248 followers, trending up". */
  ariaLabel: string;
}) {
  const windowed = series.slice(-7);
  const numericPoints = windowed.filter(
    (p): p is MetricSeriesPoint & { followerCount: number } => typeof p.followerCount === "number",
  );
  if (numericPoints.length < 2) return null;

  const min = Math.min(...numericPoints.map((p) => p.followerCount));
  const max = Math.max(...numericPoints.map((p) => p.followerCount));
  const range = Math.max(1, max - min);
  const stepX = SPARK_WIDTH / Math.max(1, windowed.length - 1);
  const yOf = (v: number) => SPARK_HEIGHT - ((v - min) / range) * (SPARK_HEIGHT - 2) - 1;

  // Build the polyline respecting gaps. We walk the windowed series
  // and emit a "M" when a gap precedes a point, "L" otherwise. The
  // path only contains non-null points; gaps break the line.
  const segments: string[] = [];
  let prevWasNumeric = false;
  windowed.forEach((p, i) => {
    if (typeof p.followerCount !== "number") {
      prevWasNumeric = false;
      return;
    }
    const x = i * stepX;
    const y = yOf(p.followerCount);
    segments.push(`${prevWasNumeric ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`);
    prevWasNumeric = true;
  });

  return (
    <svg
      width={SPARK_WIDTH}
      height={SPARK_HEIGHT}
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      role="img"
      aria-label={ariaLabel}
      data-testid="social-sparkline"
      data-testid-id={channelId}
      className="shrink-0"
      preserveAspectRatio="none"
    >
      <title>{ariaLabel}</title>
      <path
        d={segments.join(" ")}
        fill="none"
        className="stroke-primary"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const socialSparklineTestId = (channelId: string) => `social-sparkline-${channelId}`;
