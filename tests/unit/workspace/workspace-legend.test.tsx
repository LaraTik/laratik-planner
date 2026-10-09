import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkspaceLegend } from "@/components/workspace/workspace-legend";

/**
 * WorkspaceLegend — the colour key that doubles as the workspace filter.
 *
 * The two behaviours worth protecting:
 *   1. A chip's dot is the SAME token the cards use. If these drift, the
 *      legend actively misleads — worse than having no legend.
 *   2. The chip's href preserves the caller's other filter state. The
 *      legend delegates URL building to `buildHref`, so this suite pins
 *      the contract rather than re-testing the page's query-string logic.
 */
const workspaces = [
  { id: "w-1", name: "Acme", series: 0 },
  { id: "w-2", name: "Brightwell", series: 1 },
];

function renderLegend(overrides: Partial<Parameters<typeof WorkspaceLegend>[0]> = {}) {
  const props = {
    workspaces,
    activeWorkspaceId: null,
    buildHref: (id: string | null) => `?month=2026-10${id ? `&workspaceId=${id}` : ""}`,
    label: "Filter the calendar by workspace",
    allLabel: "All workspaces",
    ...overrides,
  };
  return { ...render(<WorkspaceLegend {...props} />), props };
}

describe("WorkspaceLegend", () => {
  it("lists every workspace by name so the colour is decodable", () => {
    renderLegend();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Brightwell")).toBeInTheDocument();
    expect(screen.getByText("All workspaces")).toBeInTheDocument();
  });

  it("labels the landmark for assistive tech", () => {
    renderLegend();
    expect(
      screen.getByRole("navigation", { name: /filter the calendar by workspace/i }),
    ).toBeInTheDocument();
  });

  it("marks the active workspace with aria-current, not colour alone", () => {
    renderLegend({ activeWorkspaceId: "w-2" });
    expect(screen.getByTestId("workspace-legend-w-2")).toHaveAttribute("aria-current", "true");
    expect(screen.getByTestId("workspace-legend-w-1")).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("workspace-legend-all")).not.toHaveAttribute("aria-current");
  });

  it("marks the all-workspaces chip active when no workspace filter is set", () => {
    renderLegend({ activeWorkspaceId: null });
    expect(screen.getByTestId("workspace-legend-all")).toHaveAttribute("aria-current", "true");
  });

  it("links each workspace chip to the href the caller builds for it", () => {
    renderLegend();
    expect(screen.getByTestId("workspace-legend-w-1")).toHaveAttribute(
      "href",
      "?month=2026-10&workspaceId=w-1",
    );
    expect(screen.getByTestId("workspace-legend-all")).toHaveAttribute("href", "?month=2026-10");
  });

  it("asks the caller for the 'all' href with null, so filters round-trip", () => {
    const buildHref = vi.fn(() => "?month=2026-10");
    renderLegend({ buildHref });
    // This is what guarantees the legend can never drop the month or
    // the other filters: the page owns the query string, not the legend.
    expect(buildHref).toHaveBeenCalledWith(null);
  });

  it("paints each chip's dot with the same CSS variable the card uses", () => {
    renderLegend();
    const acme = screen.getByTestId("workspace-legend-w-1");
    const dot = acme.querySelector("span[aria-hidden='true']");
    expect(dot).not.toBeNull();
    expect((dot as HTMLElement).style.backgroundColor).toBe("var(--chart-series-1)");
    // The "all" chip has no dot — it is not a workspace.
    expect(
      screen.getByTestId("workspace-legend-all").querySelector("span[aria-hidden='true']"),
    ).toBeNull();
  });

  it("hides the dot from assistive tech (the name is the accessible text)", () => {
    renderLegend();
    const dot = screen
      .getByTestId("workspace-legend-w-1")
      .querySelector("span[aria-hidden='true']");
    expect(dot).toHaveAttribute("aria-hidden", "true");
  });

  it("gives every chip a title so a truncated long name is still recoverable", () => {
    renderLegend({
      workspaces: [{ id: "w-long", name: "A very long client name that must truncate", series: 3 }],
    });
    expect(screen.getByTestId("workspace-legend-w-long")).toHaveAttribute(
      "title",
      "A very long client name that must truncate",
    );
  });

  it("renders nothing when the agency has no workspaces", () => {
    const { container } = renderLegend({ workspaces: [] });
    expect(container.firstChild).toBeNull();
  });
});
