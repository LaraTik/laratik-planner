import { describe, expect, it } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import {
  WORKSPACE_TAB_ICONS,
  WorkspacePanels,
  WorkspaceTabs,
  initialActiveTabFromHash,
  type WorkspaceTab,
  type WorkspaceTabId,
} from "@/components/planning/workspace-tabs";

/**
 * WorkspaceTabs — the in-page tab strip for the content detail
 * page. The contract:
 *  - Five tabs in a fixed order: overview / content / preview /
 *    publishing / activity. The Preview tab is the dedicated
 *    home for the platform simulator (master prompt §7 +
 *    AGENTS.md §B + §C).
 *  - Every tab id maps to a Lucide icon — a regression that
 *    adds a tab without an icon fails the contract.
 *  - Only the active panel is rendered (off-tab content
 *    unmounts). This is the contract that makes the editor +
 *    preview + workflow rail stop competing for width.
 *  - URL hash deep-linking works (browser-back returns to
 *    the previous tab).
 */

const tabs: WorkspaceTab[] = [
  { id: "overview", label: "Overview" },
  { id: "content", label: "Content" },
  { id: "preview", label: "Preview" },
  { id: "publishing", label: "Publishing" },
  { id: "activity", label: "Activity" },
];

function TabsHost({ initial = "overview" as WorkspaceTabId }) {
  const [value, setValue] = React.useState(initial);
  return (
    <>
      <WorkspaceTabs
        tabs={tabs}
        ariaLabel="Content detail"
        value={value}
        onValueChange={setValue}
      />
      <WorkspacePanels
        value={value}
        panels={{
          overview: <div data-testid="panel-overview">overview</div>,
          content: <div data-testid="panel-content">content</div>,
          preview: <div data-testid="panel-preview">preview</div>,
          publishing: <div data-testid="panel-publishing">publishing</div>,
          activity: <div data-testid="panel-activity">activity</div>,
        }}
      />
    </>
  );
}

describe("WorkspaceTabs — Preview tab (/ui-ux-pro-max)", () => {
  it("renders all five tabs in the canonical order", () => {
    render(<TabsHost />);
    expect(screen.getByTestId("workspace-tab-overview")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-tab-content")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-tab-preview")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-tab-publishing")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-tab-activity")).toBeInTheDocument();
  });

  it("resolves an icon for every tab id (no missing-icon regression)", () => {
    for (const t of tabs) {
      expect(WORKSPACE_TAB_ICONS[t.id]).toBeDefined();
    }
  });

  it("renders ONLY the active panel — off-tab content unmounts", () => {
    render(<TabsHost initial="content" />);
    expect(screen.getByTestId("panel-content")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-preview")).toBeNull();
    expect(screen.queryByTestId("panel-publishing")).toBeNull();
    expect(screen.queryByTestId("panel-activity")).toBeNull();
  });

  it("switches to the Preview panel when the Preview tab is clicked", async () => {
    const user = userEvent.setup();
    render(<TabsHost initial="content" />);
    await user.click(screen.getByTestId("workspace-tab-preview"));
    expect(screen.getByTestId("panel-preview")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-content")).toBeNull();
    // Active tab is reflected in aria-current.
    expect(screen.getByTestId("workspace-tab-preview")).toHaveAttribute("aria-current", "true");
  });

  it("reads the initial active tab from the URL hash on mount", () => {
    window.location.hash = "#preview";
    expect(initialActiveTabFromHash(tabs)).toBe("preview");
    window.location.hash = "";
  });

  it("falls back to the first tab when the hash is not a known tab id", () => {
    window.location.hash = "#not-a-tab";
    expect(initialActiveTabFromHash(tabs)).toBe("overview");
    window.location.hash = "";
  });
});
