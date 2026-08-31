import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  WorkflowBoard,
  type BoardMemberEntry,
  type WorkflowBoardColumn,
  type WorkflowBoardItem,
} from "@/components/board/workflow-board";
import type { ContentStatus } from "@/lib/content/status";

const COLUMNS: readonly WorkflowBoardColumn[] = [
  { label: "Ideas", statuses: ["draft", "changes_requested", "blocked"] },
  { label: "Content review", statuses: ["content_review"] },
  { label: "Approved", statuses: ["approved_for_design"] },
  { label: "Design", statuses: ["in_design"] },
  { label: "Creative review", statuses: ["creative_review"] },
  { label: "Ready", statuses: ["ready_to_publish"] },
  { label: "Published", statuses: ["partially_published", "published"] },
];

function makeItem(overrides: Partial<WorkflowBoardItem> & { id: string }): WorkflowBoardItem {
  return {
    title: `Item ${overrides.id}`,
    format: "static_post",
    status: "draft" as ContentStatus,
    plannedPublishAt: new Date("2026-08-21T10:00:00.000Z"),
    ...overrides,
  };
}

describe("WorkflowBoard", () => {
  it("renders 7 columns at the xl breakpoint (UX-06, GAP-FULL-REVIEW-2026-08-25)", () => {
    // The design contract is 7 columns at xl+ (the 1280-1535px laptop
    // range is the most common viewport per Stitch's capture set).
    // A previous version used `xl:grid-cols-4 2xl:grid-cols-7`, which
    // collapsed to 4+3 on row-wrap. We pin the 7-col class here so
    // the regression does not return.
    render(<WorkflowBoard items={[]} columns={COLUMNS} workspaceSlug="acme" />);
    // The grid root carries the layout classes (Tailwind 4 keeps the
    // class literal on the element for static analysis). We assert the
    // 7-col class is present and the old 4-col class is not.
    const root = document.querySelector("div.grid.gap-3");
    expect(root).not.toBeNull();
    expect(root!.className).toMatch(/\bxl:grid-cols-7\b/);
    expect(root!.className).not.toMatch(/\bxl:grid-cols-4\b/);
  });

  it("renders one section per column with the column label as heading", () => {
    render(<WorkflowBoard items={[]} columns={COLUMNS} workspaceSlug="acme" />);
    for (const col of COLUMNS) {
      expect(screen.getByRole("heading", { name: col.label })).toBeInTheDocument();
    }
  });

  it("shows the column count next to each label", () => {
    render(<WorkflowBoard items={[]} columns={COLUMNS} workspaceSlug="acme" />);
    const counts = document.querySelectorAll('[data-testid^="board-column-count-"]');
    expect(counts).toHaveLength(COLUMNS.length);
    counts.forEach((c) => expect(c.textContent).toBe("0"));
  });

  it("buckets items into the right column by status", () => {
    const items: WorkflowBoardItem[] = [
      makeItem({ id: "a", status: "draft", title: "First idea" }),
      makeItem({ id: "b", status: "content_review", title: "Being reviewed" }),
      makeItem({ id: "c", status: "in_design", title: "In design" }),
      makeItem({ id: "d", status: "ready_to_publish", title: "Ready to go" }),
      makeItem({ id: "e", status: "published", title: "Live" }),
    ];
    render(<WorkflowBoard items={items} columns={COLUMNS} workspaceSlug="acme" />);

    const ideas = screen.getByTestId("board-column-ideas");
    expect(within(ideas).getByText("First idea")).toBeInTheDocument();
    expect(within(ideas).getByTestId("board-column-count-ideas").textContent).toBe("1");

    const cr = screen.getByTestId("board-column-content-review");
    expect(within(cr).getByText("Being reviewed")).toBeInTheDocument();
    expect(within(cr).getByTestId("board-column-count-content-review").textContent).toBe("1");

    const design = screen.getByTestId("board-column-design");
    expect(within(design).getByText("In design")).toBeInTheDocument();

    const ready = screen.getByTestId("board-column-ready");
    expect(within(ready).getByText("Ready to go")).toBeInTheDocument();

    const published = screen.getByTestId("board-column-published");
    expect(within(published).getByText("Live")).toBeInTheDocument();
  });

  it("puts multiple matching items into a single column and counts them", () => {
    const items: WorkflowBoardItem[] = [
      makeItem({ id: "a", status: "draft" }),
      makeItem({ id: "b", status: "blocked" }),
      makeItem({ id: "c", status: "changes_requested" }),
    ];
    render(<WorkflowBoard items={items} columns={COLUMNS} workspaceSlug="acme" />);
    const ideas = screen.getByTestId("board-column-ideas");
    expect(within(ideas).getAllByRole("link")).toHaveLength(3);
    expect(within(ideas).getByTestId("board-column-count-ideas").textContent).toBe("3");
  });

  it("renders the 'No items' placeholder in empty columns", () => {
    render(<WorkflowBoard items={[]} columns={COLUMNS} workspaceSlug="acme" />);
    expect(screen.getAllByText("No items")).toHaveLength(COLUMNS.length);
  });

  it("builds the link href from the workspace slug and item id", () => {
    const items = [makeItem({ id: "abc-123", status: "draft" })];
    render(<WorkflowBoard items={items} columns={COLUMNS} workspaceSlug="acme" />);
    const link = screen.getByTestId("board-card-abc-123");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/app/w/acme/planning/abc-123");
  });

  it("uses a string date the same way as a Date instance", () => {
    const items = [
      makeItem({ id: "a", status: "draft", plannedPublishAt: "2026-08-21T00:00:00.000Z" }),
    ];
    render(<WorkflowBoard items={items} columns={COLUMNS} workspaceSlug="acme" />);
    // The card's meta line should include a localized date. The exact
    // string depends on the locale; assert the year is rendered.
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("renders the StatusBadge with the item's status", () => {
    const items = [makeItem({ id: "a", status: "ready_to_publish" })];
    render(<WorkflowBoard items={items} columns={COLUMNS} workspaceSlug="acme" />);
    expect(screen.getByText(/Ready To Publish/i)).toBeInTheDocument();
  });

  it("renders the human format label", () => {
    const items = [makeItem({ id: "a", status: "draft", format: "short_form_video" })];
    render(<WorkflowBoard items={items} columns={COLUMNS} workspaceSlug="acme" />);
    expect(screen.getByText(/Short Form Video/)).toBeInTheDocument();
  });

  it("ignores items with a status that does not match any column", () => {
    const items = [makeItem({ id: "a", status: "cancelled" })];
    render(<WorkflowBoard items={items} columns={COLUMNS} workspaceSlug="acme" />);
    expect(screen.queryByTestId("board-card-a")).toBeNull();
    // All columns should still show 0 + "No items"
    expect(screen.getAllByText("No items")).toHaveLength(COLUMNS.length);
  });

  it("uses a custom column order exactly as provided", () => {
    const custom: readonly WorkflowBoardColumn[] = [
      { label: "Zeta", statuses: ["cancelled"] },
      { label: "Alpha", statuses: ["draft"] },
    ];
    const items = [
      makeItem({ id: "a", status: "draft" }),
      makeItem({ id: "b", status: "cancelled" }),
    ];
    render(<WorkflowBoard items={items} columns={custom} workspaceSlug="acme" />);
    // The <section> wrappers carry the board-column- testid; the
    // count badges carry board-column-count-. Query the sections
    // directly so we don't accidentally pick up the count badges.
    const sections = document.querySelectorAll("section[data-testid^='board-column-']");
    expect(sections).toHaveLength(2);
    expect(sections[0]).toHaveAttribute("data-testid", "board-column-zeta");
    expect(sections[1]).toHaveAttribute("data-testid", "board-column-alpha");
  });
});

/**
 * Owner + Designer role rows on the board card (master prompt §5,
 * §11, AGENTS.md §C). The card's contract:
 *  - Always renders the role label (Owner / Designer), even when
 *    the id is missing — never an empty row, never a hidden role.
 *  - Renders the user's displayName when the directory knows them;
 *    falls back to the raw name; falls back to italic "Unassigned"
 *    when the id is missing or unknown.
 *  - The `data-role` + `data-empty` attributes are the contract
 *    the planning list's PeopleCell uses too — a regression that
 *    re-collapses Owner + Designer into a single pill fails
 *    this test.
 */
const directory: Record<string, BoardMemberEntry> = {
  "user-owner": { id: "user-owner", name: "Ghaleb", displayName: "Ghaleb K." },
  "user-designer": { id: "user-designer", name: "Sarah", displayName: "Sarah A." },
};

describe("WorkflowBoard — role-labelled Owner/Designer on cards", () => {
  it("renders the role label and the user's display name when the directory knows them", () => {
    render(
      <WorkflowBoard
        items={[
          makeItem({
            id: "k-1",
            status: "in_design",
            contentOwnerId: "user-owner",
            designerId: "user-designer",
          }),
        ]}
        columns={COLUMNS}
        workspaceSlug="acme"
        memberDirectory={directory}
      />,
    );
    const ownerRow = screen.getByTestId("board-card-owner");
    expect(ownerRow).toHaveAttribute("data-role", "owner");
    expect(ownerRow).toHaveTextContent("Owner");
    expect(ownerRow).toHaveTextContent("Ghaleb K.");
    expect(ownerRow).not.toHaveAttribute("data-empty");
    const designerRow = screen.getByTestId("board-card-designer");
    expect(designerRow).toHaveAttribute("data-role", "designer");
    expect(designerRow).toHaveTextContent("Designer");
    expect(designerRow).toHaveTextContent("Sarah A.");
  });

  it("renders italic 'Unassigned' when the owner id is missing", () => {
    render(
      <WorkflowBoard
        items={[makeItem({ id: "k-1", status: "in_design", contentOwnerId: null })]}
        columns={COLUMNS}
        workspaceSlug="acme"
        memberDirectory={directory}
      />,
    );
    const ownerRow = screen.getByTestId("board-card-owner");
    expect(ownerRow).toHaveAttribute("data-empty", "true");
    expect(ownerRow).toHaveTextContent("Unassigned");
  });

  it("renders italic 'Unassigned' when the designer id is missing", () => {
    render(
      <WorkflowBoard
        items={[makeItem({ id: "k-1", status: "in_design", designerId: null })]}
        columns={COLUMNS}
        workspaceSlug="acme"
        memberDirectory={directory}
      />,
    );
    const designerRow = screen.getByTestId("board-card-designer");
    expect(designerRow).toHaveAttribute("data-empty", "true");
    expect(designerRow).toHaveTextContent("Unassigned");
  });

  it("renders italic 'Unassigned' when the user is not in the directory", () => {
    render(
      <WorkflowBoard
        items={[makeItem({ id: "k-1", status: "in_design", contentOwnerId: "ghost-id" })]}
        columns={COLUMNS}
        workspaceSlug="acme"
        memberDirectory={directory}
      />,
    );
    const ownerRow = screen.getByTestId("board-card-owner");
    expect(ownerRow).toHaveAttribute("data-empty", "true");
  });

  it("falls back to the raw name when displayName is null", () => {
    const noDisplay: Record<string, BoardMemberEntry> = {
      "user-owner": { id: "user-owner", name: "Ghaleb Raw", displayName: null },
    };
    render(
      <WorkflowBoard
        items={[
          makeItem({
            id: "k-1",
            status: "in_design",
            contentOwnerId: "user-owner",
            designerId: null,
          }),
        ]}
        columns={COLUMNS}
        workspaceSlug="acme"
        memberDirectory={noDisplay}
      />,
    );
    const ownerRow = screen.getByTestId("board-card-owner");
    expect(ownerRow).toHaveTextContent("Ghaleb Raw");
  });

  it("renders the role rows even when no memberDirectory is provided", () => {
    render(
      <WorkflowBoard
        items={[makeItem({ id: "k-1", status: "in_design" })]}
        columns={COLUMNS}
        workspaceSlug="acme"
      />,
    );
    // The role label is the canonical signal — without a directory
    // the name renders as "Unassigned" so the user can still see
    // the role is missing rather than guessing.
    expect(screen.getByTestId("board-card-owner")).toHaveTextContent("Unassigned");
    expect(screen.getByTestId("board-card-designer")).toHaveTextContent("Unassigned");
  });
});
