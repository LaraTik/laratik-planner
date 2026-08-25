import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * UX-04 (GAP-FULL-REVIEW-2026-08-25) — the Planning list used to
 * render a single misleading empty state ("Nothing planned for this
 * month — use Quick Create") regardless of whether the user had
 * filters applied. The page now:
 *
 *   - uses the `hasFilter` derived flag to switch the empty state
 *     title and description
 *   - shows a "Clear filters" button (data-testid
 *     `planning-empty-clear-filters`) as the action when a filter is
 *     active, and the original Quick Create CTA only when no filter
 *     is active
 *   - references the active filter via `describeActiveFilter` so the
 *     user knows which filter is suppressing the result
 *
 * Because the page is a server component that requires a real DB +
 * auth context, we keep this guard as a structural test: if a future
 * polish pass removes the conditional render, the test fails at CI.
 *
 * The helper itself is covered by
 * `tests/unit/workspace/planning-filter-describe.test.ts`.
 */
describe("planning page empty-state structure (UX-04)", () => {
  const source = readFileSync(
    join(process.cwd(), "src", "app", "(app)", "app", "w", "[slug]", "planning", "page.tsx"),
    "utf8",
  );

  it("renders the filter-aware empty state when hasFilter is true", () => {
    expect(source).toMatch(/hasFilter\s*\?\s*"No items match your filters"/);
  });

  it("keeps the original empty state copy when no filter is active", () => {
    expect(source).toMatch(
      /hasFilter\s*\?\s*"No items match your filters"\s*:\s*"Nothing planned for this month"/,
    );
  });

  it("renders a Clear filters button as the empty-state action when hasFilter is true", () => {
    expect(source).toMatch(
      /hasFilter\s*\?\s*\(\s*[\s\S]*?data-testid="planning-empty-clear-filters"[\s\S]*?Clear filters/,
    );
  });

  it("shows Quick Create only when no filter is active", () => {
    expect(source).toMatch(/hasFilter\s*\?[\s\S]*?:\s*canCreate\s*\?[\s\S]*?Quick Create/);
  });

  it("wires the empty-state description through describeActiveFilter", () => {
    // The page builds the active-filter argument dynamically (filter
    // out undefined values so exactOptionalPropertyTypes is happy) and
    // passes the result to describeActiveFilter. We assert the helper
    // is referenced and the source list of keys matches the documented
    // filter surface.
    expect(source).toMatch(/describeActiveFilter\(/);
    for (const key of [
      "status: selectedStatus",
      "format: selectedFormat",
      "ownerId: ownerFilter",
      "search: searchTerm",
      "risk: filters.risk",
    ]) {
      expect(source).toContain(key);
    }
  });

  it("links the Clear filters button to the unfiltered month URL", () => {
    expect(source).toMatch(
      /href=\{`\/app\/w\/\$\{slug\}\/planning\?month=\$\{monthParam\(0\)\}`\}[\s\S]*?data-testid="planning-empty-clear-filters"/,
    );
  });
});
