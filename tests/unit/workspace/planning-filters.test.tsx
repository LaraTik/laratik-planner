import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanningFilters } from "@/components/workspace/planning-filters";

const baseProps = {
  targetPath: "/app/w/acme/planning",
  monthParam: "2026-08",
  density: "comfortable" as const,
  hasFilter: false,
  members: [] as { id: string; label: string }[],
};

describe("PlanningFilters", () => {
  it("renders both selects, the month hidden input, and the Apply button", () => {
    render(<PlanningFilters {...baseProps} />);
    expect(screen.getByLabelText("Filter by status")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by format")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by owner")).toBeInTheDocument();
    expect(screen.getByLabelText("List density")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-08")).toBeInTheDocument();
  });

  it("hides the Clear button when no filter is active", () => {
    render(<PlanningFilters {...baseProps} />);
    expect(screen.queryByRole("link", { name: "Clear" })).toBeNull();
  });

  it("shows the Clear button linking to the unfiltered URL when a filter is active", () => {
    render(<PlanningFilters {...baseProps} selectedStatus="ready_to_publish" hasFilter={true} />);
    const clear = screen.getByRole("link", { name: "Clear" });
    expect(clear).toHaveAttribute("href", "/app/w/acme/planning?month=2026-08");
  });

  it("hides the density selector when showDensity is false (board view)", () => {
    render(<PlanningFilters {...baseProps} showDensity={false} />);
    expect(screen.queryByLabelText("List density")).toBeNull();
  });

  it("uses the targetPath for the Clear button (board view)", () => {
    render(
      <PlanningFilters
        {...baseProps}
        targetPath="/app/w/acme/board"
        showDensity={false}
        selectedStatus="draft"
        hasFilter={true}
      />,
    );
    const clear = screen.getByRole("link", { name: "Clear" });
    expect(clear).toHaveAttribute("href", "/app/w/acme/board?month=2026-08");
  });

  it("reflects the active status and density in the defaultValue", () => {
    render(
      <PlanningFilters
        {...baseProps}
        selectedStatus="in_design"
        density="compact"
        hasFilter={true}
      />,
    );
    const status = screen.getByLabelText("Filter by status") as HTMLSelectElement;
    const density = screen.getByLabelText("List density") as HTMLSelectElement;
    expect(status.value).toBe("in_design");
    expect(density.value).toBe("compact");
  });

  it("renders every content status as a status option", () => {
    render(<PlanningFilters {...baseProps} />);
    // Includes the placeholder "All statuses" plus all 11 enum members.
    const status = screen.getByLabelText("Filter by status");
    expect(status.querySelectorAll("option")).toHaveLength(12);
  });

  it("renders an owner option for every workspace member", () => {
    const members = [
      { id: "u-1", label: "Ada Lovelace" },
      { id: "u-2", label: "Grace Hopper" },
    ];
    render(<PlanningFilters {...baseProps} members={members} />);
    const owner = screen.getByLabelText("Filter by owner");
    expect(owner.querySelectorAll("option")).toHaveLength(3); // "All owners" + 2
    expect(screen.getByRole("option", { name: "Ada Lovelace" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Grace Hopper" })).toBeInTheDocument();
  });
});
