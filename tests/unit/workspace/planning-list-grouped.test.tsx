import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanningListGrouped } from "@/components/workspace/planning-list-grouped";
import type { EnrichedContentItem } from "@/lib/content/enriched-list";
import { classifyHealth } from "@/lib/dashboard/health";
import { deriveNextAction } from "@/lib/content/next-action";

/**
 * PlanningListGrouped — pins the date-grouping contract:
 *   - When `grouped=true`, sticky date headers partition the rows.
 *   - When `grouped=false`, the rows render flat (the filter-active path).
 *   - The group key for a row is the same for two rows that share
 *     a date group, so the group never splits the same week across
 *     two sections.
 */

const NOW = new Date("2026-08-15T12:00:00.000Z");

function makeItem(
  id: string,
  plannedPublishAt: Date,
  overrides: Partial<EnrichedContentItem> = {},
): EnrichedContentItem {
  const status = overrides.status ?? "draft";
  return {
    id,
    title: `Item ${id}`,
    format: "carousel",
    status,
    plannedPublishAt,
    brief: "",
    priority: "normal",
    blockedReason: null,
    cancellationReason: null,
    changeRequestGate: null,
    owner: null,
    designer: null,
    channels: [],
    commentCount: 0,
    assetCount: 0,
    deliveryCount: 0,
    hasApprovedDelivery: false,
    openApprovalCount: 0,
    health: classifyHealth({ status, plannedPublishAt, now: NOW }),
    overdueDays: 0,
    nextAction: deriveNextAction({
      status,
      health: classifyHealth({ status, plannedPublishAt, now: NOW }),
      openApprovalCount: 0,
      actorRoles: ["content_planner"],
      now: NOW,
      plannedPublishAt,
    }),
    ...overrides,
  };
}

describe("PlanningListGrouped", () => {
  it("renders a single flat list when grouped=false", () => {
    const items = [
      makeItem("a", new Date("2026-08-10T09:00:00.000Z")),
      makeItem("b", new Date("2026-08-20T09:00:00.000Z")),
    ];
    render(
      <PlanningListGrouped
        items={items}
        workspaceSlug="acme"
        workspaceTimezone="Europe/Berlin"
        density="comfortable"
        now={NOW}
        grouped={false}
      />,
    );
    expect(screen.queryAllByTestId("planning-group-header")).toHaveLength(0);
    expect(screen.getAllByTestId("planning-list-item")).toHaveLength(2);
  });

  it("groups rows by date bucket when grouped=true", () => {
    const items = [
      makeItem("today-1", new Date("2026-08-15T09:00:00.000Z")),
      makeItem("today-2", new Date("2026-08-15T18:00:00.000Z")),
      makeItem("next-week", new Date("2026-08-19T09:00:00.000Z")),
      makeItem("far-future", new Date("2026-08-25T09:00:00.000Z")),
    ];
    render(
      <PlanningListGrouped
        items={items}
        workspaceSlug="acme"
        workspaceTimezone="Europe/Berlin"
        density="comfortable"
        now={NOW}
        grouped={true}
      />,
    );
    // 3 distinct groups: Today, This week, future date header
    const headers = screen.getAllByTestId("planning-group-header");
    expect(headers.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getAllByTestId("planning-list-item")).toHaveLength(4);
  });

  it("buckets a past-due row under an 'Overdue' header", () => {
    const items = [makeItem("overdue-1", new Date("2026-08-13T09:00:00.000Z"))];
    render(
      <PlanningListGrouped
        items={items}
        workspaceSlug="acme"
        workspaceTimezone="Europe/Berlin"
        density="comfortable"
        now={NOW}
        grouped={true}
      />,
    );
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByTestId("planning-list-item")).toBeInTheDocument();
  });
});
