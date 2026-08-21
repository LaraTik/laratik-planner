import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlanningFilters } from "@/components/workspace/planning-filters";

describe("PlanningFilters", () => {
  it("renders both selects, the month hidden input, and the Apply button", () => {
    render(
      <PlanningFilters slug="acme" monthParam="2026-08" density="comfortable" hasFilter={false} />,
    );
    expect(screen.getByLabelText("Filter by status")).toBeInTheDocument();
    expect(screen.getByLabelText("List density")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-08")).toBeInTheDocument();
  });

  it("hides the Clear button when no filter is active", () => {
    render(
      <PlanningFilters slug="acme" monthParam="2026-08" density="comfortable" hasFilter={false} />,
    );
    expect(screen.queryByRole("link", { name: "Clear" })).toBeNull();
  });

  it("shows the Clear button linking to the unfiltered URL when a filter is active", () => {
    render(
      <PlanningFilters
        slug="acme"
        monthParam="2026-08"
        selectedStatus="ready_to_publish"
        density="comfortable"
        hasFilter={true}
      />,
    );
    const clear = screen.getByRole("link", { name: "Clear" });
    expect(clear).toHaveAttribute("href", "/app/w/acme/planning?month=2026-08");
  });

  it("reflects the active status and density in the defaultValue", () => {
    render(
      <PlanningFilters
        slug="acme"
        monthParam="2026-08"
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
    render(
      <PlanningFilters slug="acme" monthParam="2026-08" density="comfortable" hasFilter={false} />,
    );
    // Includes the placeholder "All statuses" plus all 11 enum members.
    const status = screen.getByLabelText("Filter by status");
    expect(status.querySelectorAll("option")).toHaveLength(12);
  });
});
