import { Sparkline } from "@/components/workspace/sparkline";
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
 * Unlike the Command Center KPI sparkline, this one IS the accessible
 * element for its value, so it passes its own `ariaLabel` rather than
 * being decorative.
 *
 * The polyline geometry now lives in the shared `Sparkline` primitive;
 * this component only carries the analytics-specific window, size,
 * testids and gap policy, so the two sparkline surfaces cannot drift
 * into two subtly different implementations.
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
  const values = windowed.map((point) =>
    typeof point.followerCount === "number" ? point.followerCount : null,
  );

  return (
    <Sparkline
      values={values}
      width={SPARK_WIDTH}
      height={SPARK_HEIGHT}
      preserveGaps
      hideWhenInsufficient
      fill={false}
      strokeWidth={1.5}
      ariaLabel={ariaLabel}
      entityId={channelId}
      testId="social-sparkline"
      className="shrink-0"
    />
  );
}

export const socialSparklineTestId = (channelId: string) => `social-sparkline-${channelId}`;
