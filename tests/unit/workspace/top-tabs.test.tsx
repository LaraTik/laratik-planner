import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sparkles, Tag, Type } from "lucide-react";
import { WorkspaceTopTabs, type WorkspaceTopTab } from "@/components/workspace/top-tabs";

// jsdom does not implement scrollIntoView / IntersectionObserver
// for anchor navigation. The strip is a thin presentational
// component — we only need to assert the markup, the active-state
// affordances, and the count badge.

const tabs: WorkspaceTopTab[] = [
  { id: "overview", label: "Overview" },
  { id: "assets", label: "Assets", icon: Sparkles, count: 3 },
  { id: "voice", label: "Voice & tone", icon: Type },
  { id: "publishing", label: "Publishing rules", icon: Tag, count: 0 },
];

beforeEach(() => {
  // Reset hash so the initial-active logic doesn't carry across
  // tests.
  window.location.hash = "";
  // Make sure each render starts on the first tab.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe("WorkspaceTopTabs", () => {
  it("renders one anchor per tab with the correct href", () => {
    render(<WorkspaceTopTabs tabs={tabs} ariaLabel="Section nav" />);
    for (const tab of tabs) {
      const link = screen.getByTestId(`workspace-top-tab-${tab.id}`);
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", `#${tab.id}`);
    }
  });

  it("exposes the supplied aria-label on the <nav>", () => {
    render(<WorkspaceTopTabs tabs={tabs} ariaLabel="Brand kit sections" />);
    expect(screen.getByRole("navigation", { name: /brand kit sections/i })).toBeInTheDocument();
  });

  it("marks the first tab as the initial active tab when no hash is set", () => {
    render(<WorkspaceTopTabs tabs={tabs} ariaLabel="Section nav" />);
    const first = screen.getByTestId("workspace-top-tab-overview");
    expect(first).toHaveAttribute("aria-current", "true");
  });

  it("marks the tab whose id matches window.location.hash as initially active", () => {
    window.location.hash = "#voice";
    render(<WorkspaceTopTabs tabs={tabs} ariaLabel="Section nav" />);
    const active = screen.getByTestId("workspace-top-tab-voice");
    expect(active).toHaveAttribute("aria-current", "true");
    const overview = screen.getByTestId("workspace-top-tab-overview");
    expect(overview).not.toHaveAttribute("aria-current", "true");
  });

  it("renders the count badge for tabs that supply a count", () => {
    render(<WorkspaceTopTabs tabs={tabs} ariaLabel="Section nav" />);
    const assets = screen.getByTestId("workspace-top-tab-assets");
    expect(assets).toHaveTextContent("3");
    // Count of 0 still renders the badge (the badge is the design
    // hint that a count slot exists).
    const publishing = screen.getByTestId("workspace-top-tab-publishing");
    expect(publishing).toHaveTextContent("0");
  });

  it("omits the count badge for tabs that don't supply a count", () => {
    render(<WorkspaceTopTabs tabs={tabs} ariaLabel="Section nav" />);
    const voice = screen.getByTestId("workspace-top-tab-voice");
    // Voice & tone has no count prop, so the link's only text
    // content is the label.
    expect(voice.textContent).toBe("Voice & tone");
  });

  it("uses a 44px+ touch target on each tab link (mobile rule)", () => {
    render(<WorkspaceTopTabs tabs={tabs} ariaLabel="Section nav" />);
    for (const tab of tabs) {
      const link = screen.getByTestId(`workspace-top-tab-${tab.id}`);
      // `min-h-11` is the 44px Tailwind utility — present in the
      // compiled className.
      expect(link.className).toMatch(/\bmin-h-11\b/);
    }
  });
});
