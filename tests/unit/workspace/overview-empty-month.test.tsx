import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OverviewEmptyMonth } from "@/components/workspace/overview-empty-month";

/**
 * OverviewEmptyMonth — the "this month has nothing in it" state.
 *
 * The bug this pins: switching the Overview to an empty month rendered a page
 * of hard zeros with no explanation. Because a FUTURE month is empty by
 * construction, an operator flipping between this month and next saw a
 * pixel-identical screen — indistinguishable from a month switcher that does
 * nothing. These tests assert the page SAYS something in that state, and says
 * something different depending on the phase.
 */

const baseProps = {
  monthLabel: "November 2026",
  monthPhase: "future" as const,
  total: 0,
  monthlyTarget: null,
  createHref: "/app/w/food-game/planning/new",
  settingsHref: "/app/w/food-game/settings",
};

describe("OverviewEmptyMonth", () => {
  it("names the month so the operator can tell which month is empty", () => {
    render(<OverviewEmptyMonth {...baseProps} />);
    expect(screen.getByText("Nothing planned for November 2026")).toBeInTheDocument();
  });

  it("renders for all three phases without crashing", () => {
    for (const monthPhase of ["past", "current", "future"] as const) {
      const { unmount } = render(<OverviewEmptyMonth {...baseProps} monthPhase={monthPhase} />);
      expect(screen.getByTestId("overview-empty-month")).toHaveAttribute(
        "data-month-phase",
        monthPhase,
      );
      unmount();
    }
  });

  it("offers a create CTA that points at the create form", () => {
    render(<OverviewEmptyMonth {...baseProps} />);
    const cta = screen.getByRole("link", { name: /plan this month/i });
    expect(cta).toHaveAttribute("href", "/app/w/food-game/planning/new");
  });

  it("offers a set-target CTA only when no monthly target exists", () => {
    const { unmount } = render(<OverviewEmptyMonth {...baseProps} />);
    expect(screen.getByRole("link", { name: /set a monthly target/i })).toBeInTheDocument();
    unmount();

    render(<OverviewEmptyMonth {...baseProps} monthlyTarget={12} />);
    expect(screen.queryByRole("link", { name: /set a monthly target/i })).not.toBeInTheDocument();
  });

  it("shows the coverage gap when a target is set — this is the actionable number", () => {
    render(<OverviewEmptyMonth {...baseProps} monthlyTarget={12} />);
    expect(screen.getByText(/monthly target is 12 items — 12 still to plan/i)).toBeInTheDocument();
  });

  it("never claims to plan a negative gap when the month overshoots its target", () => {
    render(<OverviewEmptyMonth {...baseProps} monthlyTarget={-5} />);
    // A non-positive target is treated as "unset", so no bogus maths is shown.
    expect(screen.getByText(/nothing is scheduled for november 2026 yet/i)).toBeInTheDocument();
  });

  it("uses past tense for a closed month and present tense for an open one", () => {
    const { unmount } = render(<OverviewEmptyMonth {...baseProps} monthPhase="past" />);
    expect(screen.getByText(/nothing was ever scheduled/i)).toBeInTheDocument();
    unmount();

    render(<OverviewEmptyMonth {...baseProps} monthPhase="current" />);
    expect(screen.getByText(/nothing is scheduled for november 2026 yet/i)).toBeInTheDocument();
  });

  it("falls back to English copy when no translator is supplied", () => {
    render(<OverviewEmptyMonth {...baseProps} />);
    expect(screen.getByText(/nothing is scheduled for november 2026 yet/i)).toBeInTheDocument();
  });

  it("uses the supplied translator when one is provided", () => {
    render(
      <OverviewEmptyMonth
        {...baseProps}
        t={(key, params) =>
          key === "workspaceOverviewDashboard.emptyMonth.title"
            ? `Leere Monat: ${String(params?.month ?? "")}`
            : `translated:${key}`
        }
      />,
    );
    expect(screen.getByText("Leere Monat: November 2026")).toBeInTheDocument();
  });
});
