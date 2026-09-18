import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecentUpdatesTable } from "@/app/(app)/app/w/[slug]/brand-kit/recent-updates-table";

/**
 * The recent-updates table previously crashed when any row had an invalid
 * `updatedAt` — `row.updatedAt.toISOString()` throws `RangeError` on an
 * Invalid Date, which 500'd the entire Brand Kit overview because the
 * page-level Promise.all rejected.
 *
 * After the hardening pass (commit brand-kit defensive hardening), the
 * table guards against invalid dates and renders an em-dash in their
 * place. These tests pin the new contract.
 */
describe("RecentUpdatesTable — invalid date hardening", () => {
  it("renders an em-dash placeholder when a row's updatedAt is an Invalid Date", () => {
    render(
      <RecentUpdatesTable
        locale="en"
        rows={[
          {
            kind: "rule",
            description: "Valid row",
            updatedAt: new Date("2026-09-11T09:00:00Z"),
            actor: null,
          },
          {
            kind: "asset",
            description: "Invalid date row",
            updatedAt: new Date(NaN),
            actor: null,
          },
        ]}
      />,
    );
    // The invalid row should not throw — and should render the em-dash
    // placeholder instead of a `<time>` element.
    expect(screen.queryAllByRole("time")).toHaveLength(1);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it("does not throw when ALL rows have an invalid updatedAt", () => {
    const renderSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <RecentUpdatesTable
          locale="en"
          rows={[
            {
              kind: "rule",
              description: "Broken row",
              updatedAt: new Date(NaN),
              actor: null,
            },
          ]}
        />,
      ),
    ).not.toThrow();
    expect(renderSpy).not.toHaveBeenCalledWith(expect.stringContaining("Invalid time value"));
    renderSpy.mockRestore();
  });
});
