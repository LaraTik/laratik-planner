import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { RecentItemsCard, type RecentItem } from "@/components/workspace/recent-items-card";

const baseItems: RecentItem[] = [
  {
    id: "a",
    title: "First post",
    status: "draft",
    plannedPublishAt: new Date("2026-08-21T10:00:00.000Z"),
  },
  {
    id: "b",
    title: "Second post",
    status: "ready_to_publish",
    plannedPublishAt: "2026-08-22T10:00:00.000Z",
  },
];

describe("RecentItemsCard", () => {
  it("renders the 'Recent items' header", () => {
    render(
      <RecentItemsCard items={baseItems} workspaceSlug="acme" viewAllHref="/app/w/acme/planning" />,
    );
    expect(screen.getByRole("heading", { name: "Recent items" })).toBeInTheDocument();
  });

  it("renders the 'View all' link with the supplied href", () => {
    render(
      <RecentItemsCard items={baseItems} workspaceSlug="acme" viewAllHref="/app/w/acme/planning" />,
    );
    const link = screen.getByRole("link", { name: /view all/i });
    expect(link).toHaveAttribute("href", "/app/w/acme/planning");
  });

  it("renders one <li> per item with the right title", () => {
    render(
      <RecentItemsCard items={baseItems} workspaceSlug="acme" viewAllHref="/app/w/acme/planning" />,
    );
    expect(screen.getByText("First post")).toBeInTheDocument();
    expect(screen.getByText("Second post")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("builds each item link from the workspace slug and item id", () => {
    render(
      <RecentItemsCard items={baseItems} workspaceSlug="acme" viewAllHref="/app/w/acme/planning" />,
    );
    expect(screen.getByRole("link", { name: "First post" })).toHaveAttribute(
      "href",
      "/app/w/acme/planning/a",
    );
    expect(screen.getByRole("link", { name: "Second post" })).toHaveAttribute(
      "href",
      "/app/w/acme/planning/b",
    );
  });

  it("accepts a string date the same way as a Date instance", () => {
    render(
      <RecentItemsCard items={baseItems} workspaceSlug="acme" viewAllHref="/app/w/acme/planning" />,
    );
    // Both rows render their date as a localized string. Assert the
    // year appears for both.
    const list = screen.getByRole("list");
    expect(within(list).getAllByText(/2026/)).toHaveLength(2);
  });

  it("renders a status badge for each item", () => {
    render(
      <RecentItemsCard items={baseItems} workspaceSlug="acme" viewAllHref="/app/w/acme/planning" />,
    );
    // The StatusBadge shows the human status label.
    expect(screen.getByText(/Draft/)).toBeInTheDocument();
    expect(screen.getByText(/Ready To Publish/)).toBeInTheDocument();
  });

  it("shows the empty state when items is empty", () => {
    render(<RecentItemsCard items={[]} workspaceSlug="acme" viewAllHref="/app/w/acme/planning" />);
    expect(screen.getByText("No content yet")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("hides the empty-state 'New content' button when createHref is omitted", () => {
    render(<RecentItemsCard items={[]} workspaceSlug="acme" viewAllHref="/app/w/acme/planning" />);
    expect(screen.queryByRole("link", { name: /new content/i })).toBeNull();
  });

  it("shows the empty-state 'New content' link when createHref is provided", () => {
    render(
      <RecentItemsCard
        items={[]}
        workspaceSlug="acme"
        viewAllHref="/app/w/acme/planning"
        createHref="/app/w/acme/planning/new"
      />,
    );
    const link = screen.getByRole("link", { name: /new content/i });
    expect(link).toHaveAttribute("href", "/app/w/acme/planning/new");
  });

  it("truncates the title to one line via CSS (no JS truncation)", () => {
    render(
      <RecentItemsCard items={baseItems} workspaceSlug="acme" viewAllHref="/app/w/acme/planning" />,
    );
    const title = screen.getByRole("link", { name: "First post" });
    expect(title.className).toContain("truncate");
  });
});
