import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SocialHealthBanner } from "@/app/(app)/app/w/[slug]/analytics/social/social-health-banner";
import {
  SocialAggregateStrip,
  type AggregateChannel,
} from "@/app/(app)/app/w/[slug]/analytics/social/social-aggregate-strip";
import { SocialSparkline } from "@/app/(app)/app/w/[slug]/analytics/social/social-sparkline";
import { SocialEngagementRateCard } from "@/app/(app)/app/w/[slug]/analytics/social/social-engagement-rate";
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
  ): AggregateChannel {
    return {
      id,
      accountName: name,
      platform: "instagram",
      fullSeries: makeSeries(values),
      growth7Absolute,
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
    render(<SocialEngagementRateCard channelId="c1" rate={{ percent: 6.048, partial: false }} />);
    const cell = screen.getByTestId("social-engagement-rate-c1");
    expect(cell.textContent).toBe("6.0%");
  });

  it("shows the partial pill when the underlying series was partial", () => {
    render(<SocialEngagementRateCard channelId="c1" rate={{ percent: 4.2, partial: true }} />);
    expect(screen.getByTestId("social-engagement-rate-partial")).toBeInTheDocument();
  });

  it("shows an em-dash when the rate is null", () => {
    render(<SocialEngagementRateCard channelId="c1" rate={{ percent: null, partial: false }} />);
    const cell = screen.getByTestId("social-engagement-rate-c1");
    expect(cell.textContent).toBe("—");
  });

  it("renders inside the social-engagement-rate container", () => {
    const { container } = render(
      <SocialEngagementRateCard channelId="c1" rate={{ percent: 5, partial: false }} />,
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
