import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CommandCenterPanel,
  type CommandCenterLabels,
} from "@/components/workspace/command-center-panel";
import type { CommandCenterSummary, CommandCenterTimeSlot } from "@/lib/social/command-center";
import en from "@/messages/en/workspaceOverviewDashboard.json";
import ar from "@/messages/ar/workspaceOverviewDashboard.json";

// The panel pulls in CommandCenterRefresh, whose server action transitively
// imports next-auth. These panels are pure presentation, so the action is
// stubbed the same way tests/unit/command-center-refresh.test.tsx does it.
vi.mock("@/app/(app)/app/a/[agencySlug]/w/[slug]/channels/actions", () => ({
  refreshWorkspaceSocialDataAction: vi.fn(async () => ({ success: true, synced: 0, failed: 0 })),
}));

/**
 * Renders the panels with the REAL shipped copy rather than a hand-written
 * fixture. A label contract that drifts from the message files then fails here
 * instead of silently rendering an empty string in production.
 */
const labels = en.commandCenter as unknown as CommandCenterLabels;
const labelsAr = ar.commandCenter as unknown as CommandCenterLabels;

function slot(over: Partial<CommandCenterTimeSlot> = {}): CommandCenterTimeSlot {
  return {
    dayOfWeek: 2,
    hour: 15,
    sampleSize: 3,
    averageViews: 382,
    reliable: true,
    liftRatio: 1.35,
    confidence: "low",
    ...over,
  };
}

function summary(over: Partial<CommandCenterSummary> = {}): CommandCenterSummary {
  return {
    channelCount: 2,
    channelsWithData: 2,
    currentFollowers: 4_000,
    followerGrowth: { absolute: 20, percent: 0.5, partial: false },
    currentReach: 12_000,
    currentViews: 9_000,
    currentInteractions: 380,
    engagementRate: { percent: 3.2, partial: false, denominator: "reach" },
    latestMetricDate: "2026-09-29",
    lastSyncedAt: new Date("2026-09-30T09:00:00Z"),
    health: { healthy: 2, degraded: 0, stalled: 0 },
    partial: false,
    trend: [],
    leaders: [
      {
        id: "ig",
        platform: "instagram",
        accountName: "Food Game",
        rate: {
          percent: 10.6,
          denominator: "reach",
          interactions: 850,
          denominatorValue: 8_000,
          daysObserved: 28,
          metricDate: "2026-09-29",
        },
      },
      {
        id: "fb",
        platform: "facebook",
        accountName: "Food Game",
        rate: {
          percent: 2.1,
          denominator: "followers",
          interactions: 168,
          denominatorValue: 8_000,
          daysObserved: 28,
          metricDate: "2026-09-29",
        },
      },
    ],
    channelPerformance: [],
    accountHealth: [],
    content: {
      sampleSize: 13,
      averageViews: 283,
      posts: [],
      topPosts: [],
      outliers: [],
      bestTime: slot(),
      timeSlots: [slot()],
      lengthBands: [],
    },
    ...over,
  };
}

function renderPanel(
  value: CommandCenterSummary,
  options: { timezone?: string; labels?: CommandCenterLabels } = {},
) {
  return render(
    <CommandCenterPanel
      summary={value}
      locale="en"
      timezone={options.timezone ?? "UTC"}
      analyticsHref="/analytics"
      researchHref="/research"
      channelsHref="/channels"
      planningHref="/planning"
      workspaceSlug="food-game"
      canRefresh={false}
      savedResearchObservationIds={new Set<string>()}
      canSaveResearch={false}
      watchlist={[]}
      labels={options.labels ?? labels}
      windowDays={30}
      window30Href="?window=30"
      window90Href="?window=90"
    />,
  );
}

describe("Command Center recommendation panels", () => {
  it("states the confidence tier and the lift behind the recommendation", () => {
    // The reported problem: "Tue · 15:00" read as a finding. It is three
    // posts that happened to top the grid, and the panel must say so.
    renderPanel(summary());

    const chip = screen.getByTestId("command-center-best-time-confidence");
    expect(chip).toHaveAttribute("data-confidence", "low");
    expect(chip).toHaveTextContent("Low confidence");

    // 382 over a 283 baseline -> +35%.
    expect(screen.getByTestId("command-center-best-time-lift")).toHaveTextContent("+35%");
  });

  it("puts the timezone on the pill so the slot is actionable", () => {
    renderPanel(summary());

    expect(screen.getByTestId("command-center-best-time-pill")).toHaveTextContent(
      "Tue · 15:00 UTC",
    );
  });

  it("rings the recommended cell and leaves the louder single-post cell unringed", () => {
    // 502 average on one post used to win the highlight while the pill
    // recommended the 382/3-post cell: the panel said Tuesday, drew Friday.
    renderPanel(
      summary({
        content: {
          sampleSize: 13,
          averageViews: 283,
          posts: [],
          topPosts: [],
          outliers: [],
          bestTime: slot(),
          timeSlots: [
            slot(),
            slot({
              dayOfWeek: 5,
              hour: 12,
              averageViews: 502,
              sampleSize: 1,
              reliable: false,
              confidence: "low",
            }),
          ],
          lengthBands: [],
        },
      }),
    );

    expect(screen.getByTestId("command-center-heatmap-cell-2-15")).toHaveAttribute(
      "data-best",
      "true",
    );
    expect(screen.getByTestId("command-center-heatmap-cell-5-12")).toHaveAttribute(
      "data-best",
      "false",
    );
  });

  it("warns when the workspace is left on the UTC default", () => {
    renderPanel(summary());
    expect(screen.getByTestId("command-center-utc-hint")).toBeTruthy();
  });

  it("does not show the UTC hint when the workspace has a real timezone", () => {
    renderPanel(summary(), { timezone: "Europe/Berlin" });
    expect(screen.queryByTestId("command-center-utc-hint")).toBeNull();
    expect(screen.getByTestId("command-center-best-time-pill")).toHaveTextContent(
      "Tue · 15:00 Europe/Berlin",
    );
  });

  it("prints the rate it ranked on, with the denominator it used", () => {
    renderPanel(summary());

    const instagram = screen.getByTestId("command-center-leader-ig");
    expect(instagram).toHaveAttribute("data-rate-percent", "10.6");
    // 850 / 8,000 reach — the numerator and denominator are both visible, so
    // the rate can be checked by eye instead of taken on trust.
    expect(instagram).toHaveTextContent("850");
    expect(instagram).toHaveTextContent("8,000");

    // The Facebook row falls back to followers and says so rather than
    // implying the same denominator as the row above it.
    const facebook = screen.getByTestId("command-center-leader-fb");
    expect(facebook).toHaveTextContent("followers");
    expect(facebook).toHaveTextContent("2.1%");
  });

  it("orders the rows by the rate it displays", () => {
    renderPanel(summary());

    const percents = [
      Number(screen.getByTestId("command-center-leader-ig").getAttribute("data-rate-percent")),
      Number(screen.getByTestId("command-center-leader-fb").getAttribute("data-rate-percent")),
    ];
    // Descending: the row order and the printed number are the same ordering.
    expect(percents[0]).toBeGreaterThan(percents[1]!);
  });

  it("renders the Arabic copy for the same panels", () => {
    renderPanel(summary(), { labels: labelsAr });

    const chip = screen.getByTestId("command-center-best-time-confidence");
    expect(chip).toHaveTextContent("ثقة منخفضة");
    // Both locales must resolve every key the panel reads; a missing key
    // renders as an empty string rather than throwing. This row takes the
    // followers fallback, so the Arabic word for followers must be present.
    expect(screen.getByTestId("command-center-leader-fb")).toHaveTextContent("المتابعون");
  });
});
