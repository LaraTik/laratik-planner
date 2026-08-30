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
      plannedPublishAt: new Date("2026-08-31T10:00:00.000Z"),
      ownerName: "Alice",
    },
    {
      id: "b",
      title: "Community Vote",
      status: "in_design",
      format: "story",
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
});
