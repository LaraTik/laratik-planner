import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tFor } from "@/messages";

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
 * The page is a server component that requires a real DB + auth
 * context, so we keep this guard as a structural test: if a future
 * polish pass removes the conditional render or the catalog wiring,
 * the test fails at CI.
 *
 * The hard-coded English copy that this test originally locked
 * (UX-04) has since been moved to the message catalog under the
 * `planning.*` namespace. The structural test now locks the
 * catalog keys instead of the English strings — the English
 * values are still pinned by `tests/unit/i18n/catalogs.test.ts`.
 */
describe("planning page empty-state structure (UX-04)", () => {
  const source = readFileSync(
    join(process.cwd(), "src", "app", "(app)", "app", "w", "[slug]", "planning", "page.tsx"),
    "utf8",
  );

  // Lock the catalog strings the empty state must use. The English
  // values come from `tFor("en")` so the test fails when a
  // catalog refactor drops a key or breaks the JSON shape.
  const en = tFor("en");
  const filterTitle = en("planning.emptyFilterTitle");
  const nothingTitle = en("planning.emptyNothingTitle");
  const clearFilters = en("planning.clearFilters");
  const quickCreate = en("planning.quickCreate");

  it("renders the filter-aware empty state title when hasFilter is true", () => {
    expect(source).toMatch(
      new RegExp(`hasFilter\\s*\\?\\s*t\\(["']planning\\.emptyFilterTitle["']`),
    );
    expect(filterTitle).toBe("No items match your filters");
  });

  it("keeps the original empty state title when no filter is active", () => {
    // The ternary is on multiple lines; use a relaxed match
    // that just confirms the two catalog keys coexist on the
    // empty-state title line, regardless of how Prettier
    // formatted the surrounding `?` / `:`.
    expect(source).toMatch(/t\(["']planning\.emptyFilterTitle["']/);
    expect(source).toMatch(/t\(["']planning\.emptyNothingTitle["']/);
    expect(nothingTitle).toBe("Nothing planned for this month");
  });

  it("renders a Clear filters button as the empty-state action when hasFilter is true", () => {
    expect(source).toMatch(
      new RegExp(
        `hasFilter\\s*\\?\\s*\\([\\s\\S]*?data-testid="planning-empty-clear-filters"[\\s\\S]*?t\\(["']planning\\.clearFilters["']`,
      ),
    );
    expect(clearFilters).toBe("Clear filters");
  });

  it("shows Quick Create only when no filter is active", () => {
    expect(source).toMatch(
      new RegExp(
        `hasFilter[\\s\\S]*?:\\s*canCreate\\s*\\?[\\s\\S]*?t\\(["']planning\\.quickCreate["']`,
      ),
    );
    expect(quickCreate).toBe("Quick Create");
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
