import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  OverviewKpiStrip,
  type OverviewKpiStripTile,
} from "@/components/workspace/overview-kpi-strip";
import { ClipboardCheck, FileEdit, ListTodo, Rocket, ShieldAlert } from "lucide-react";

/**
 * The executive summary strip is 5 compact clickable tiles.
 * Each tile is a drill-down into the planning list with the
 * matching filter pre-applied. These tests pin the contract.
 */
describe("OverviewKpiStrip", () => {
  const tiles: OverviewKpiStripTile[] = [
    {
      label: "Planned",
      value: 27,
      href: "/app/w/acme/planning",
      icon: ListTodo,
      tone: "default",
    },
    {
      label: "On track",
      value: 4,
      href: "/app/w/acme/planning",
      icon: Rocket,
      tone: "success",
    },
    {
      label: "At risk",
      value: 23,
      href: "/app/w/acme/planning?risk=at_risk",
      icon: ShieldAlert,
      tone: "warning",
    },
    {
      label: "Needs review",
      value: 1,
      href: "/app/w/acme/planning?status=content_review",
      icon: ClipboardCheck,
      tone: "info",
    },
    {
      label: "Published",
      value: 1,
      href: "/app/w/acme/planning?status=published",
      icon: FileEdit,
      tone: "muted",
    },
  ];

  it("renders 5 tiles with their values and labels", () => {
    render(<OverviewKpiStrip tiles={tiles} />);
    // The label is inside the same <a> as the value, so we look
    // for a link whose accessible name combines the two.
    for (const t of tiles) {
      const link = screen.getByRole("link", { name: new RegExp(`${t.label}: ${t.value}`) });
      expect(link).toBeInTheDocument();
    }
  });

  it("renders each tile as a link with the matching href", () => {
    render(<OverviewKpiStrip tiles={tiles} />);
    const atRisk = screen.getByRole("link", { name: /At risk: 23/i });
    expect(atRisk).toHaveAttribute("href", "/app/w/acme/planning?risk=at_risk");
    const published = screen.getByRole("link", { name: /Published: 1/i });
    expect(published).toHaveAttribute("href", "/app/w/acme/planning?status=published");
  });

  it("uses tone classes for the visual accent (left border + icon colour)", () => {
    render(<OverviewKpiStrip tiles={tiles} />);
    const atRisk = screen.getByRole("link", { name: /At risk: 23/i });
    expect(atRisk.className).toContain("border-l-warning");
  });
});
