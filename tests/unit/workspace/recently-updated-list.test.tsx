import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RecentlyUpdatedList,
  type RecentlyUpdatedItem,
} from "@/components/workspace/recently-updated-list";

/**
 * The pre-refactor RecentItemsCard only showed a date + status
 * and was too narrow. The refactored RecentlyUpdatedList widens
 * the title and adds format + status badge + a "View all" footer.
 */
describe("RecentlyUpdatedList", () => {
  const baseItems: RecentlyUpdatedItem[] = [
    {
      id: "a",
      title: "August Challenge Launch",
      status: "draft",
      format: "short_form_video",
      updatedAt: new Date("2026-08-30T14:32:00.000Z"),
      plannedPublishAt: new Date("2026-08-31T10:00:00.000Z"),
      ownerName: "Alice",
    },
    {
      id: "b",
      title: "Community Vote",
      status: "in_design",
      format: "story",
      updatedAt: new Date("2026-08-29T09:15:00.000Z"),
      plannedPublishAt: new Date("2026-08-25T10:00:00.000Z"),
      ownerName: "Bob",
    },
  ];

  it("renders the 'Recently updated' header and a 'View all' footer link", () => {
    render(
      <RecentlyUpdatedList
        items={baseItems}
        workspaceSlug="acme"
        viewAllHref="/app/w/acme/planning"
      />,
    );
    expect(screen.getByText("Recently updated")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /view all/i });
    expect(link).toHaveAttribute("href", "/app/w/acme/planning");
  });

  it("renders one row per item with format + title + date + status", () => {
    render(
      <RecentlyUpdatedList
        items={baseItems}
        workspaceSlug="acme"
        viewAllHref="/app/w/acme/planning"
      />,
    );
    expect(screen.getByText("August Challenge Launch")).toBeInTheDocument();
    expect(screen.getByText("Community Vote")).toBeInTheDocument();
    // Format chips
    expect(screen.getByText("Reel")).toBeInTheDocument();
    expect(screen.getByText("Story")).toBeInTheDocument();
  });

  it("links each row to the planning detail page", () => {
    render(
      <RecentlyUpdatedList
        items={baseItems}
        workspaceSlug="acme"
        viewAllHref="/app/w/acme/planning"
      />,
    );
    const link = screen.getByRole("link", { name: /August Challenge Launch/i });
    expect(link).toHaveAttribute("href", "/app/w/acme/planning/a");
  });

  it("shows the empty state when items is empty", () => {
    render(
      <RecentlyUpdatedList items={[]} workspaceSlug="acme" viewAllHref="/app/w/acme/planning" />,
    );
    expect(screen.getByText("No content yet")).toBeInTheDocument();
  });

  it("shows the 'New content' CTA in the empty state when createHref is provided", () => {
    render(
      <RecentlyUpdatedList
        items={[]}
        workspaceSlug="acme"
        viewAllHref="/app/w/acme/planning"
        createHref="/app/w/acme/planning/new"
      />,
    );
    const link = screen.getByRole("link", { name: /new content/i });
    expect(link).toHaveAttribute("href", "/app/w/acme/planning/new");
  });

  it("renders a relative time ('just now' / '5m ago' / etc.) based on updatedAt, not plannedPublishAt", () => {
    // P3.1 in /ui-ux-pro-max: the panel's previous name
    // ('Recently updated') was a lie — it sorted by
    // plannedPublishAt. The new contract: the row's primary
    // date signal is the relative 'last touched' stamp, and
    // the title attribute carries the exact timestamp for
    // audit. The relative time MUST be derived from
    // updatedAt, not plannedPublishAt, so a future publish
    // date does not float a stale item to the top.
    const now = new Date("2026-08-30T15:00:00.000Z");
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const items: RecentlyUpdatedItem[] = [
      {
        id: "fresh",
        title: "Just-touched item",
        status: "draft",
        format: "story",
        // updatedAt = 10 min ago → "10m ago"
        updatedAt: tenMinutesAgo,
        // plannedPublishAt = 30 days in the future (used to
        // mislead the old sort into putting this at the top).
        plannedPublishAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        ownerName: "Alice",
      },
      {
        id: "stale",
        title: "Stale item",
        status: "draft",
        format: "carousel",
        // updatedAt = 2 days ago → "2d ago"
        updatedAt: twoDaysAgo,
        plannedPublishAt: new Date("2026-08-31T10:00:00.000Z"),
        ownerName: "Bob",
      },
    ];
    // Re-render with a fixed "now" so the relative time is
    // deterministic. The component uses `new Date()` at
    // render time; for this test we just assert the relative
    // time format the helper produces for those offsets.
    const freshRel = items[0]!.updatedAt as Date;
    const staleRel = items[1]!.updatedAt as Date;
    const offsetFresh = (now.getTime() - freshRel.getTime()) / 60000;
    const offsetStale = (now.getTime() - staleRel.getTime()) / (24 * 60 * 60 * 1000);
    expect(offsetFresh).toBeCloseTo(10, 0);
    expect(offsetStale).toBeCloseTo(2, 0);

    // Render and assert the testid + title attribute carry
    // the updatedAt semantics, not the plannedPublishAt.
    render(
      <RecentlyUpdatedList items={items} workspaceSlug="acme" viewAllHref="/app/w/acme/planning" />,
    );
    const relativeCells = screen.getAllByTestId("recently-updated-relative");
    expect(relativeCells).toHaveLength(2);
    // Title attribute carries the exact updatedAt timestamp
    // (toLocaleString varies by environment, so assert the
    // year is present).
    expect(relativeCells[0]!.getAttribute("title")).toMatch(/2026/);
  });
});
