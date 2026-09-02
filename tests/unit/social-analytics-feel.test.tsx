import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SocialHealthBanner } from "@/app/(app)/app/w/[slug]/analytics/social/social-health-banner";
import {
  SocialAggregateStrip,
  type AggregateChannel,
} from "@/app/(app)/app/w/[slug]/analytics/social/social-aggregate-strip";
import { SocialSparkline } from "@/app/(app)/app/w/[slug]/analytics/social/social-sparkline";
import { SocialEngagementRateCard } from "@/app/(app)/app/w/[slug]/analytics/social/social-engagement-rate";
import { SegmentedControl } from "@/app/(app)/app/w/[slug]/analytics/social/social-segmented-control";
import { SocialHealthyStatus } from "@/app/(app)/app/w/[slug]/analytics/social/social-healthy-status";
import { SocialGrowthChart } from "@/app/(app)/app/w/[slug]/analytics/social/social-growth-chart";
import { SocialMetricsTable } from "@/app/(app)/app/w/[slug]/analytics/social/social-metrics-table";
import { SocialDataQuality } from "@/app/(app)/app/w/[slug]/analytics/social/social-data-quality";
import type { MetricSeriesPoint } from "@/lib/social/analytics";

/**
 * M4 "feel" round (2026-08-27) — component unit tests.
 *
 * The four new analytics-page components are pure render functions
 * over data the page already loaded. They have no client state, so
 * `@testing-library/react` is enough to cover the data-testid
 * contract and the empty-state early-return. The data-testid
 * contract is the public API for the E2E suite; this test pins
 * the unit-side implementation.
 *
 * Note: Server Components that import `"server-only"` are not
 * importable from a vitest unit context in strict mode. These
 * components do NOT import `"server-only"` (they render pure JSX),
 * so they are testable here.
 */

function makeSeries(values: Array<number | null>): MetricSeriesPoint[] {
  return values.map((v, i) => ({
    metricDate: `2026-08-${(i + 1).toString().padStart(2, "0")}`,
    followerCount: v,
    reach: null,
    views: null,
    engagedAccounts: null,
    interactions: null,
  }));
}

describe("SocialHealthBanner", () => {
  it("renders nothing when no channels are passed (regression: don't ship an empty banner)", () => {
    const { container } = render(<SocialHealthBanner channels={[]} slug="acme" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when every channel is healthy", () => {
    const now = new Date("2026-08-27T03:15:00Z");
    const channels = [
      {
        id: "c1",
        accountName: "Food Game",
        platform: "instagram" as const,
        connectionStatus: "connected" as const,
        lastSyncedAt: now,
        lastSyncErrorCode: null,
        latestProviderErrorCode: null,
      },
    ];
    const { container } = render(<SocialHealthBanner channels={channels} slug="acme" now={now} />);
    expect(container.firstChild).toBeNull();
  });

  it("surfaces a reauth banner when a channel is needs_reauth", () => {
    const channels = [
      {
        id: "c1",
        accountName: "Just Halal tr",
        platform: "facebook" as const,
        connectionStatus: "needs_reauth" as const,
        lastSyncedAt: new Date("2026-08-26T03:15:00Z"),
        lastSyncErrorCode: null,
        latestProviderErrorCode: null,
      },
    ];
    render(<SocialHealthBanner channels={channels} slug="acme" />);
    const banner = screen.getByTestId("social-health-banner");
    expect(banner).toBeInTheDocument();
    const reauthRow = screen.getByTestId("social-health-banner-reauth");
    expect(reauthRow).toBeInTheDocument();
    expect(reauthRow.textContent).toContain("Just Halal tr");
    expect(reauthRow.textContent).toContain("reconnect");
  });

  it("surfaces a stale pill when last_synced_at is older than 25 hours", () => {
    const now = new Date("2026-08-27T12:00:00Z");
    const channels = [
      {
        id: "c1",
        accountName: "Food Game",
        platform: "instagram" as const,
        connectionStatus: "connected" as const,
        // 30 hours ago — past the 25h stale threshold
        lastSyncedAt: new Date("2026-08-26T06:00:00Z"),
        lastSyncErrorCode: null,
        latestProviderErrorCode: null,
      },
    ];
    render(<SocialHealthBanner channels={channels} slug="acme" now={now} />);
    const stale = screen.getByTestId("social-health-banner-stale");
    expect(stale).toBeInTheDocument();
    expect(stale.textContent).toContain("Food Game");
  });

  it("surfaces an error pill when lastSyncErrorCode is set", () => {
    const channels = [
      {
        id: "c1",
        accountName: "Food Game",
        platform: "instagram" as const,
        connectionStatus: "connected" as const,
        lastSyncedAt: new Date("2026-08-27T03:15:00Z"),
        lastSyncErrorCode: "rate_limited",
        latestProviderErrorCode: null,
      },
    ];
    render(<SocialHealthBanner channels={channels} slug="acme" />);
    const err = screen.getByTestId("social-health-banner-error");
    expect(err.textContent).toContain("rate_limited");
  });

  // 2026-08-28: silent-failure path. The worker writes
  // `sourceMetadata.providerErrorCode` when the insights call
  // throws a code that the documented contract treats as silent
  // (e.g. permission_denied). The channel row's
  // `lastSyncErrorCode` is NOT set in that case (the worker kept
  // going). The banner surfaces the error here so the operator
  // sees the actual provider code without needing Sentry access.
  it("surfaces an error pill when latestProviderErrorCode is set", () => {
    const channels = [
      {
        id: "c1",
        accountName: "Just Halal tr",
        platform: "facebook" as const,
        connectionStatus: "connected" as const,
        lastSyncedAt: new Date("2026-08-28T03:15:00Z"),
        lastSyncErrorCode: null,
        latestProviderErrorCode: "permission_denied",
      },
    ];
    render(<SocialHealthBanner channels={channels} slug="acme" />);
    const err = screen.getByTestId("social-health-banner-error");
    expect(err.textContent).toContain("Just Halal tr");
    expect(err.textContent).toContain("permission_denied");
  });
});

describe("SocialAggregateStrip", () => {
  function channel(
    id: string,
    name: string,
    values: Array<number | null>,
    growth7Absolute: number | null,
    growth7Percent: number | null = null,
  ): AggregateChannel {
    return {
      id,
      accountName: name,
      platform: "instagram",
      fullSeries: makeSeries(values),
      growth7Absolute,
      growth7Percent,
    };
  }

  it("sums the latest observed followers across channels", () => {
    const channels: AggregateChannel[] = [
      channel("a", "A", [100, 200, 248], 12),
      channel("b", "B", [40, 50, 56], 4),
    ];
    render(<SocialAggregateStrip channels={channels} windowDays={7} />);
    const cell = screen.getByTestId("social-aggregate-strip-total-followers");
    expect(cell.textContent).toContain("304");
    expect(cell.textContent).toContain("2 channels");
  });

  it("shows the channel with the highest 7d absolute growth", () => {
    const channels: AggregateChannel[] = [
      channel("a", "Tiny", [100, 110, 120], 4),
      channel("b", "Big", [2000, 2050, 2100], 50),
    ];
    render(<SocialAggregateStrip channels={channels} windowDays={7} />);
    const cell = screen.getByTestId("social-aggregate-strip-best-growth");
    expect(cell.textContent).toContain("+50");
    expect(cell.textContent).toContain("Big");
  });

  it("shows an em-dash for total followers when every channel is null", () => {
    const channels: AggregateChannel[] = [channel("a", "A", [null, null, null], null)];
    render(<SocialAggregateStrip channels={channels} windowDays={7} />);
    const cell = screen.getByTestId("social-aggregate-strip-total-followers");
    expect(cell.textContent).toContain("—");
  });
});

describe("SocialSparkline", () => {
  it("renders nothing with fewer than 2 non-null points", () => {
    const { container } = render(
      <SocialSparkline channelId="c1" series={makeSeries([100, null, null])} ariaLabel="test" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders an SVG when at least 2 non-null points exist", () => {
    render(
      <SocialSparkline
        channelId="c1"
        series={makeSeries([100, 105, 110])}
        ariaLabel="Food Game follower trend"
      />,
    );
    const svg = screen.getByTestId("social-sparkline");
    expect(svg).toBeInTheDocument();
    expect(svg.tagName.toLowerCase()).toBe("svg");
    // The path inside the SVG should be a polyline (M followed by L commands).
    const path = svg.querySelector("path");
    expect(path).toBeInTheDocument();
    expect(path?.getAttribute("d")).toMatch(/^M/);
  });

  it("respects the aria-label for screen readers", () => {
    render(
      <SocialSparkline
        channelId="c1"
        series={makeSeries([100, 105])}
        ariaLabel="Just Halal tr follower trend, last 7 days"
      />,
    );
    expect(screen.getByLabelText("Just Halal tr follower trend, last 7 days")).toBeInTheDocument();
  });
});

describe("SocialEngagementRateCard", () => {
  it("shows the percent to 1 decimal place when rate is set", () => {
    render(
      <SocialEngagementRateCard
        channelId="c1"
        rate={{ percent: 6.048, partial: false, denominator: "reach" }}
      />,
    );
    const cell = screen.getByTestId("social-engagement-rate-c1");
    expect(cell.textContent).toBe("6.0%");
  });

  it("shows the partial pill when the underlying series was partial", () => {
    render(
      <SocialEngagementRateCard
        channelId="c1"
        rate={{ percent: 4.2, partial: true, denominator: "followers" }}
      />,
    );
    expect(screen.getByTestId("social-engagement-rate-partial")).toBeInTheDocument();
  });

  it("shows an em-dash when the rate is null", () => {
    render(
      <SocialEngagementRateCard
        channelId="c1"
        rate={{ percent: null, partial: false, denominator: null }}
      />,
    );
    const cell = screen.getByTestId("social-engagement-rate-c1");
    expect(cell.textContent).toBe("—");
  });

  it("renders inside the social-engagement-rate container", () => {
    const { container } = render(
      <SocialEngagementRateCard
        channelId="c1"
        rate={{ percent: 5, partial: false, denominator: "reach" }}
      />,
    );
    const card = container.querySelector('[data-testid="social-engagement-rate"]');
    expect(card).toBeInTheDocument();
    // The container's data-testid-id is the channel id; the per-channel
    // inner cell is the data-testid "social-engagement-rate-<id>".
    expect(
      within(card as HTMLElement).getByTestId("social-engagement-rate-c1"),
    ).toBeInTheDocument();
  });
});

describe("platform-aware social metrics UI", () => {
  const rows = [
    {
      metricDate: "2026-09-01",
      followerCount: 100,
      reach: 80,
      views: 120,
      engagedAccounts: 12,
      interactions: 15,
    },
  ];

  it("keeps engaged accounts out of the Facebook table", () => {
    render(<SocialMetricsTable rows={rows} tableId="facebook-table" platform="facebook" />);
    expect(screen.queryByRole("columnheader", { name: /engaged/i })).toBeNull();
    expect(screen.getByRole("columnheader", { name: /interactions/i })).toBeInTheDocument();
  });

  it("keeps engaged accounts available in the Instagram table", () => {
    render(<SocialMetricsTable rows={rows} tableId="instagram-table" platform="instagram" />);
    expect(screen.getByRole("columnheader", { name: /engaged/i })).toBeInTheDocument();
  });

  it("explains partial data with the available count and missing metrics", () => {
    render(
      <SocialDataQuality
        platform="facebook"
        values={{ followerCount: 100, reach: null, views: null, interactions: 15 }}
        labels={{
          partial: "Partial data",
          metrics: "metrics available",
          unavailableReason: "Unavailable metrics",
          metricLabels: {
            followerCount: "Followers",
            reach: "Reach",
            views: "Views",
            engagedAccounts: "Engaged accounts",
            interactions: "Interactions",
          },
          statusLabels: { error: "provider error", noData: "no data" },
        }}
      />,
    );
    expect(screen.getByTestId("social-data-quality").textContent).toContain(
      "Partial data · 2/4 metrics available",
    );
    expect(screen.getByTestId("social-data-quality").textContent).toContain(
      "Reach (no data), Views (no data)",
    );
  });
});

describe("SegmentedControl", () => {
  it("renders every option as an anchor and marks the current with aria-current=page", () => {
    const options = [
      { value: 7, label: "7 days", href: "?window=7", testId: "window-7" },
      { value: 30, label: "30 days", href: "?window=30", testId: "window-30" },
      { value: 90, label: "90 days", href: "?window=90", testId: "window-90" },
    ];
    render(<SegmentedControl<number> label="Window" options={options} current={30} />);
    const nav = screen.getByLabelText("Window");
    expect(nav.tagName.toLowerCase()).toBe("nav");
    const active = within(nav).getByTestId("window-30");
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.textContent).toBe("30 days");
    // The non-active options should NOT have aria-current
    expect(within(nav).getByTestId("window-7").getAttribute("aria-current")).toBeNull();
    expect(within(nav).getByTestId("window-90").getAttribute("aria-current")).toBeNull();
    // Every option is rendered as a link
    expect(within(nav).getByTestId("window-7").tagName.toLowerCase()).toBe("a");
    expect(within(nav).getByTestId("window-30").getAttribute("href")).toBe("?window=30");
  });

  it("supports string-typed values (the metric selector use case)", () => {
    const options = [
      { value: "reach", label: "Reach", href: "?metric=reach", testId: "metric-reach" },
      { value: "views", label: "Views", href: "?metric=views", testId: "metric-views" },
    ];
    render(<SegmentedControl<string> label="Metric" options={options} current="views" />);
    expect(screen.getByTestId("metric-views").getAttribute("aria-current")).toBe("page");
    expect(screen.getByTestId("metric-reach").getAttribute("aria-current")).toBeNull();
  });
});

describe("SocialAggregateStrip (M5 percent sub-line)", () => {
  function channel(
    id: string,
    name: string,
    values: Array<number | null>,
    growth7Absolute: number | null,
    growth7Percent: number | null = null,
  ): AggregateChannel {
    return {
      id,
      accountName: name,
      platform: "instagram",
      fullSeries: makeSeries(values),
      growth7Absolute,
      growth7Percent,
    };
  }

  it("surfaces the 7d percent alongside the absolute winner", () => {
    const channels: AggregateChannel[] = [channel("a", "Big", [2000, 2050, 2100], 50, 2.4)];
    render(<SocialAggregateStrip channels={channels} windowDays={7} />);
    const cell = screen.getByTestId("social-aggregate-strip-best-growth");
    expect(cell.textContent).toContain("+50");
    expect(cell.textContent).toContain("+2.4%");
  });

  it("omits the percent sub-line when the percent is null (e.g. zero baseline)", () => {
    const channels: AggregateChannel[] = [channel("a", "ZeroBaseline", [0, 0, 5], 5, null)];
    render(<SocialAggregateStrip channels={channels} windowDays={7} />);
    const cell = screen.getByTestId("social-aggregate-strip-best-growth");
    expect(cell.textContent).toContain("+5");
    expect(screen.queryByTestId("social-aggregate-strip-best-growth-percent")).toBeNull();
  });

  it("renders a negative percent with a leading minus sign", () => {
    const channels: AggregateChannel[] = [channel("a", "Shrinking", [200, 195, 190], -10, -5.0)];
    render(<SocialAggregateStrip channels={channels} windowDays={7} />);
    const cell = screen.getByTestId("social-aggregate-strip-best-growth");
    expect(cell.textContent).toContain("-5.0%");
  });
});

describe("SocialHealthyStatus", () => {
  it("renders the channel count and a last-sync relative timestamp", () => {
    const now = new Date("2026-08-28T12:00:00Z");
    // 12:00 - 09:00 = 3h exactly (no rounding needed)
    render(
      <SocialHealthyStatus channelCount={3} asOf={new Date("2026-08-28T09:00:00Z")} now={now} />,
    );
    const status = screen.getByTestId("social-healthy-status");
    expect(status.textContent).toContain("All 3 channels healthy");
    expect(status.textContent).toContain("last sync 3h ago");
  });

  it("uses singular 'channel' when count is 1", () => {
    render(
      <SocialHealthyStatus
        channelCount={1}
        asOf={new Date("2026-08-28T12:00:00Z")}
        now={new Date("2026-08-28T12:00:00Z")}
      />,
    );
    expect(screen.getByTestId("social-healthy-status").textContent).toContain(
      "All 1 channel healthy",
    );
  });

  it("omits the sync line when asOf is null", () => {
    render(<SocialHealthyStatus channelCount={2} asOf={null} now={new Date()} />);
    const status = screen.getByTestId("social-healthy-status");
    expect(status.textContent).toContain("All 2 channels healthy");
    expect(status.textContent).not.toContain("last sync");
  });
});

describe("SocialGrowthChart (M5)", () => {
  function makePoints(): Array<{ date: string; value: number | null }> {
    return [
      { date: "2026-08-22", value: 240 },
      { date: "2026-08-23", value: 245 },
      { date: "2026-08-24", value: 248 },
    ];
  }

  it("uses growthPercent for the trend badge when provided", () => {
    render(
      <SocialGrowthChart
        title="Reach · 7 days"
        platform="Instagram"
        profileName="Food Game"
        metricLabel="Reach"
        points={makePoints()}
        tableId="t1"
        growthPercent={3.4}
      />,
    );
    const badge = screen.getByText("+3.4%");
    expect(badge).toBeInTheDocument();
    expect(screen.queryByText("Growing")).toBeNull();
  });

  it("shows 'Declining' badge text when growthPercent is negative (no plus sign)", () => {
    render(
      <SocialGrowthChart
        title="Reach · 7 days"
        platform="Instagram"
        profileName="Food Game"
        metricLabel="Reach"
        points={makePoints()}
        tableId="t1"
        growthPercent={-2.1}
      />,
    );
    expect(screen.getByText("-2.1%")).toBeInTheDocument();
  });

  it("falls back to endpoint-delta badge text when growthPercent is null (M4 legacy)", () => {
    render(
      <SocialGrowthChart
        title="Reach · 7 days"
        platform="Instagram"
        profileName="Food Game"
        metricLabel="Reach"
        points={makePoints()}
        tableId="t1"
      />,
    );
    // 240 → 248 is positive → "Growing"
    expect(screen.getByText("Growing")).toBeInTheDocument();
  });

  it("includes the metric label in the chart's accessible description", () => {
    render(
      <SocialGrowthChart
        title="Views · 7 days"
        platform="Instagram"
        profileName="Food Game"
        metricLabel="Views"
        points={makePoints()}
        tableId="t1"
      />,
    );
    const svg = screen.getByRole("img");
    expect(svg.getAttribute("aria-label")).toContain("Views");
  });
});
