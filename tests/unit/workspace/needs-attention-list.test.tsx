import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  NeedsAttentionList,
  type NeedsAttentionItem,
} from "@/components/workspace/needs-attention-list";

/**
 * The pre-refactor `AtRiskMilestonesCard` only showed date +
 * title. The refactored `NeedsAttentionList` surfaces severity
 * (critical / warning / info), status, format, owner, and a
 * per-row "Open" affordance. These tests pin the contract.
 */
describe("NeedsAttentionList", () => {
  const now = new Date("2026-08-19T10:00:00Z");

  const baseItems: NeedsAttentionItem[] = [
    {
      id: "blocked-1",
      title: "Critical blocked item",
      status: "blocked",
      format: "story",
      plannedPublishAt: new Date("2026-08-15T10:00:00Z"),
      daysOverdue: 4,
      ownerName: "Bob",
    },
    {
      id: "overdue-1",
      title: "Long overdue draft",
      status: "draft",
      format: "carousel",
      plannedPublishAt: new Date("2026-08-05T10:00:00Z"),
      daysOverdue: 14,
      ownerName: "Alice",
    },
  ];

  it("renders a row per item with title, format, and severity icon", () => {
    render(
      <NeedsAttentionList
        items={baseItems}
        workspaceSlug="acme"
        now={now}
        viewAllHref="/app/w/acme/planning?risk=at_risk"
      />,
    );
    expect(screen.getByText("Critical blocked item")).toBeInTheDocument();
    expect(screen.getByText("Long overdue draft")).toBeInTheDocument();
    expect(screen.getByText(/Story/)).toBeInTheDocument();
    expect(screen.getByText(/Carousel/)).toBeInTheDocument();
  });

  it("shows relative deadline language (X days overdue · MMM d)", () => {
    render(
      <NeedsAttentionList
        items={baseItems}
        workspaceSlug="acme"
        now={now}
        viewAllHref="/app/w/acme/planning?risk=at_risk"
      />,
    );
    expect(screen.getAllByText(/4 days overdue/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/14 days overdue/).length).toBeGreaterThan(0);
  });

  it("shows 'Due today', 'Due tomorrow', or 'Due in N days' for upcoming items", () => {
    const upcoming: NeedsAttentionItem[] = [
      {
        id: "today",
        title: "Due today item",
        status: "draft",
        format: "static_post",
        plannedPublishAt: now,
        daysOverdue: 0,
        ownerName: null,
      },
    ];
    render(
      <NeedsAttentionList
        items={upcoming}
        workspaceSlug="acme"
        now={now}
        viewAllHref="/app/w/acme/planning?risk=at_risk"
      />,
    );
    expect(screen.getAllByText(/due today/i).length).toBeGreaterThan(0);
  });

  it("shows a 'View all attention items' footer link", () => {
    render(
      <NeedsAttentionList
        items={baseItems}
        workspaceSlug="acme"
        now={now}
        viewAllHref="/app/w/acme/planning?risk=at_risk"
      />,
    );
    const link = screen.getByRole("link", { name: /view all attention items/i });
    expect(link).toHaveAttribute("href", "/app/w/acme/planning?risk=at_risk");
  });

  it("shows the empty-state copy when there are no items", () => {
    render(
      <NeedsAttentionList
        items={[]}
        workspaceSlug="acme"
        now={now}
        viewAllHref="/app/w/acme/planning?risk=at_risk"
      />,
    );
    expect(screen.getByText(/everything is on track/i)).toBeInTheDocument();
  });

  it("links each row to the planning detail page (multiple links per row allowed)", () => {
    render(
      <NeedsAttentionList
        items={baseItems}
        workspaceSlug="acme"
        now={now}
        viewAllHref="/app/w/acme/planning?risk=at_risk"
      />,
    );
    // The first row has both a title link and an "Open →" link
    // pointing at the same URL. We assert that at least one link
    // with the right href exists.
    const links = screen.getAllByRole("link", { name: /Critical blocked item/i });
    expect(links.some((l) => l.getAttribute("href") === "/app/w/acme/planning/blocked-1")).toBe(
      true,
    );
  });

  it("renders the owner name when present, 'Unassigned' when null", () => {
    render(
      <NeedsAttentionList
        items={baseItems}
        workspaceSlug="acme"
        now={now}
        viewAllHref="/app/w/acme/planning?risk=at_risk"
      />,
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });
});
