import { TrendingUp, Users, Eye } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { MetricSeriesPoint } from "@/lib/social/analytics";

/**
 * M4 — social-analytics "feel" improvement.
 *
 * A portfolio summary strip rendered above the per-channel cards.
 * Three signals:
 *
 *   1. **Total followers** across all connected channels on the
 *      workspace. Sum of the latest observed `followerCount` per
 *      channel. Channels with a null latest are skipped. If every
 *      channel is null, the value is `—`.
 *
 *   2. **Best 7d growth.** The channel with the highest
 *      `growth7.absolute` wins. If two channels tie on absolute,
 *      the first one wins (sort is stable). "Best growth" is
 *      deliberately defined by **absolute** count, not percent:
 *      for accounts of different sizes, percent growth favours
 *      the small accounts and absolute favours the large ones.
 *      Absolute is the more intuitive default for a portfolio
 *      summary; a percent-based alternative is on the table if
 *      the user wants it (would change the sort key only).
 *
 *   3. **Portfolio reach.** Sum of `views` (which is the
 *      `profile_views` metric for IG, `page_views` for FB) over
 *      the currently selected window across all channels. If the
 *      selected window is empty for all channels, the value is
 *      `—`.
 *
 * The component is a Server Component. The page passes the
 * already-computed series, so no client state.
 *
 * Data-testid:
 *   - `social-aggregate-strip` — the strip container
 *   - `social-aggregate-strip-total-followers` — the followers cell
 *   - `social-aggregate-strip-best-growth` — the best growth cell
 *   - `social-aggregate-strip-reach` — the portfolio reach cell
 */

export type AggregateChannel = {
  id: string;
  accountName: string;
  platform: "instagram" | "facebook" | "tiktok";
  fullSeries: MetricSeriesPoint[];
  growth7Absolute: number | null;
  /**
   * M5 — the 7d growth as a percent of the baseline. The M4
   * aggregate strip picked the channel with the highest
   * **absolute** 7d growth, which favours large accounts. M5
   * surfaces both numbers in the same cell so the operator
   * can see the context (e.g. "+50 (2.4%)" tells you the
   * channel grew by 50 followers, which is 2.4% of the
   * starting total).
   */
  growth7Percent: number | null;
};

function sumLatestFollowers(channels: AggregateChannel[]): number | null {
  const observed = channels
    .map((c) => c.fullSeries[c.fullSeries.length - 1]?.followerCount ?? null)
    .filter((v): v is number => typeof v === "number");
  if (observed.length === 0) return null;
  return observed.reduce((acc, v) => acc + v, 0);
}

function bestGrowth(channels: AggregateChannel[]): AggregateChannel | null {
  const ranked = [...channels]
    .filter((c) => typeof c.growth7Absolute === "number")
    .sort((a, b) => (b.growth7Absolute ?? -Infinity) - (a.growth7Absolute ?? -Infinity));
  return ranked[0] ?? null;
}

function portfolioReach(channels: AggregateChannel[], windowDays: number): number | null {
  let sum = 0;
  let anyObserved = false;
  for (const c of channels) {
    const windowed = c.fullSeries.slice(-windowDays);
    for (const p of windowed) {
      if (typeof p.views === "number") {
        sum += p.views;
        anyObserved = true;
      }
    }
  }
  return anyObserved ? sum : null;
}

export function SocialAggregateStrip({
  channels,
  windowDays,
}: {
  channels: AggregateChannel[];
  windowDays: number;
}) {
  const totalFollowers = sumLatestFollowers(channels);
  const best = bestGrowth(channels);
  const reach = portfolioReach(channels, windowDays);

  return (
    <Card padding="md" data-testid="social-aggregate-strip">
      <div className="grid gap-4 sm:grid-cols-3">
        <div data-testid="social-aggregate-strip-total-followers">
          <div className="flex items-center gap-2">
            <Users className="text-fg-muted h-3.5 w-3.5" aria-hidden={true} />
            <p className="text-label text-fg-muted">Total followers</p>
          </div>
          <p className="text-title-section text-fg-primary mt-1 font-semibold">
            {totalFollowers === null ? "—" : totalFollowers.toLocaleString()}
          </p>
          <p className="text-label text-fg-muted mt-0.5">
            across {channels.length} channel{channels.length === 1 ? "" : "s"}
          </p>
        </div>

        <div data-testid="social-aggregate-strip-best-growth">
          <div className="flex items-center gap-2">
            <TrendingUp className="text-fg-muted h-3.5 w-3.5" aria-hidden={true} />
            <p className="text-label text-fg-muted">Best 7d growth</p>
          </div>
          {best && typeof best.growth7Absolute === "number" ? (
            <>
              <p className="text-title-section text-fg-primary mt-1 font-semibold">
                +{best.growth7Absolute.toLocaleString()}
                {typeof best.growth7Percent === "number" ? (
                  <span
                    className="text-label text-fg-secondary ml-1.5 font-medium"
                    data-testid="social-aggregate-strip-best-growth-percent"
                  >
                    ({best.growth7Percent > 0 ? "+" : ""}
                    {best.growth7Percent.toFixed(1)}%)
                  </span>
                ) : null}
              </p>
              <p className="text-label text-fg-muted mt-0.5 truncate">{best.accountName}</p>
            </>
          ) : (
            <>
              <p className="text-title-section text-fg-muted mt-1 font-semibold">—</p>
              <p className="text-label text-fg-muted mt-0.5">Not enough data yet (need 7+ days)</p>
            </>
          )}
        </div>

        <div data-testid="social-aggregate-strip-reach">
          <div className="flex items-center gap-2">
            <Eye className="text-fg-muted h-3.5 w-3.5" aria-hidden={true} />
            <p className="text-label text-fg-muted">{windowDays}-day reach (views)</p>
          </div>
          <p className="text-title-section text-fg-primary mt-1 font-semibold">
            {reach === null ? "—" : reach.toLocaleString()}
          </p>
          <p className="text-label text-fg-muted mt-0.5">profile + page views combined</p>
        </div>
      </div>
    </Card>
  );
}
