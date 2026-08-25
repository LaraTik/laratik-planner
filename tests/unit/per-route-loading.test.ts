import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * UX-08 (GAP-FULL-REVIEW-2026-08-25) — a single shared
 * `(app)/loading.tsx` rendered the same 3-bar pattern for every
 * authenticated route. Routes with radically different shapes
 * (board, calendar, settings, design-queue, channels) now ship a
 * per-route skeleton that matches their real layout.
 *
 * These structural guards pin:
 *   - each per-route loading file exists
 *   - each one mentions its own route-shape marker (7-col grid for
 *     the board, 7-col weekday grid for the calendar, 4-section
 *     card stack for settings, 3-col card grid for the design
 *     queue, 5-col table for channels)
 *   - none of them regress to the shared 3-bar pattern
 *   - the shared loading.tsx is unchanged so routes without a
 *     per-route loading.tsx still get the safe default
 */
describe("per-route loading.tsx files (UX-08)", () => {
  const sharedSource = readFileSync(
    join(process.cwd(), "src", "app", "(app)", "loading.tsx"),
    "utf8",
  );
  const sharedHasThreeBars = (sharedSource.match(/h-12 w-full/g) ?? []).length === 3;

  function loadRouteLoading(slug: string, route: string) {
    return readFileSync(
      join(process.cwd(), "src", "app", "(app)", "app", "w", `[${slug}]`, route, "loading.tsx"),
      "utf8",
    );
  }

  it("keeps the shared (app)/loading.tsx on the 3-bar pattern as a safe default", () => {
    // Routes without a per-route loading.tsx still need a working
    // default. We assert the safe-default 3-bar pattern is still
    // present.
    expect(sharedHasThreeBars).toBe(true);
  });

  describe("board/loading.tsx", () => {
    const source = loadRouteLoading("slug", "board");

    it("renders 7 column placeholders (matches the 7-col board)", () => {
      // 7 columns of placeholder cards
      expect(source).toMatch(/Array\.from\(\{\s*length:\s*7\s*\}\)/);
    });

    it("uses the same xl:grid-cols-7 grid as the live board", () => {
      expect(source).toMatch(/xl:grid-cols-7/);
    });
  });

  describe("calendar/loading.tsx", () => {
    const source = loadRouteLoading("slug", "calendar");

    it("renders 7 weekday headers", () => {
      expect(source).toMatch(/Array\.from\(\{\s*length:\s*7\s*\}\)/);
    });

    it("renders 6 week rows", () => {
      expect(source).toMatch(/Array\.from\(\{\s*length:\s*6\s*\}\)/);
    });

    it("uses a 7-col grid for the weekday strip", () => {
      expect(source).toMatch(/grid-cols-7/);
    });
  });

  describe("settings/loading.tsx", () => {
    const source = loadRouteLoading("slug", "settings");

    it("renders 4 section placeholders (Lifecycle / Lead times / Defaults / Approval)", () => {
      expect(source).toMatch(/Array\.from\(\{\s*length:\s*4\s*\}\)/);
    });

    it("renders 3 form rows per section (label + control + helper)", () => {
      expect(source).toMatch(/Array\.from\(\{\s*length:\s*3\s*\}\)/);
    });
  });

  describe("design-queue/loading.tsx", () => {
    const source = loadRouteLoading("slug", "design-queue");

    it("renders 6 card placeholders", () => {
      expect(source).toMatch(/Array\.from\(\{\s*length:\s*6\s*\}\)/);
    });

    it("uses the same 3-col card grid as the live page", () => {
      expect(source).toMatch(/xl:grid-cols-3/);
    });
  });

  describe("channels/loading.tsx", () => {
    const source = loadRouteLoading("slug", "channels");

    it("renders 5 table-row placeholders (Platform / Account / URL / State / Owner)", () => {
      expect(source).toMatch(/Array\.from\(\{\s*length:\s*5\s*\}\)/);
    });

    it("uses a 5-col grid matching the DataTable column count", () => {
      expect(source).toMatch(/grid-cols-5/);
    });
  });

  it("none of the per-route skeletons regress to the shared 3-bar pattern", () => {
    // The shared pattern is 3 `h-12 w-full` Skeletons. The per-route
    // skeletons should not all copy that pattern (board + calendar +
    // settings + design-queue + channels all have a non-list shape).
    for (const route of ["board", "calendar", "settings", "design-queue", "channels"]) {
      const source = loadRouteLoading("slug", route);
      const h12Count = (source.match(/h-12 w-full/g) ?? []).length;
      // Allow 0 h-12 rows; the per-route skeletons use other heights
      // (h-5/h-4/h-3/h-10/h-20/h-6 etc.) to mirror their real page.
      expect(h12Count, `${route} should not use the shared 3-bar h-12 pattern`).toBeLessThan(3);
    }
  });
});
