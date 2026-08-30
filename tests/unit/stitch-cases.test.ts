import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_SURFACES,
  PLANNING_DETAIL_VIEWPORTS,
  REGRESSION_VIEWPORTS,
  SETUP_FUNCTIONS,
  STITCH_CASES,
  viewportsForSurface,
  type StitchCase,
  resolveStitchRoute,
  responsiveScreenshotName,
  screenshotNameFor,
} from "../../tests/e2e/stitch-cases";

/**
 * Lock the canonical 51-screen Stitch contract: 41 active targets and 10
 * historical/superseded captures with successors. Every entry must point
 * to a real PNG and HTML artifact on disk, declare either a route or a
 * shared-state evidence group, and be tagged with a classification that
 * rolls up to the counts the production-readiness plan requires.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..");

const count = (predicate: (entry: StitchCase) => boolean): number =>
  STITCH_CASES.filter(predicate).length;

describe("canonical Stitch capture manifest", () => {
  it("maps all 51 unique captured screens", () => {
    expect(STITCH_CASES).toHaveLength(51);
    expect(new Set(STITCH_CASES.map((entry) => entry.screenId)).size).toBe(51);
  });

  it("points to committed PNG and HTML artifacts", () => {
    for (const entry of STITCH_CASES) {
      const pngAbs = path.join(REPO_ROOT, entry.pngPath);
      const htmlAbs = path.join(REPO_ROOT, entry.htmlPath);
      expect(existsSync(pngAbs), `png missing for ${entry.screenId}: ${entry.pngPath}`).toBe(true);
      expect(existsSync(htmlAbs), `html missing for ${entry.screenId}: ${entry.htmlPath}`).toBe(
        true,
      );
    }
  });

  it("assigns a route or an explicit shared-state evidence group", () => {
    for (const entry of STITCH_CASES) {
      expect(
        entry.route || entry.evidenceGroup,
        `missing route/evidenceGroup for ${entry.screenId}`,
      ).toBeTruthy();
    }
  });

  it("matches the 27/11/3/3/7 classification split", () => {
    expect(count((e) => e.classification === "canonical")).toBe(27);
    expect(count((e) => e.classification === "responsive")).toBe(11);
    expect(count((e) => e.classification === "supporting")).toBe(3);
    expect(count((e) => e.classification === "historical")).toBe(3);
    expect(count((e) => e.classification === "superseded")).toBe(7);
  });

  it("marks 41 active targets and 10 historical/superseded exclusions", () => {
    const active = (e: StitchCase) =>
      e.classification === "canonical" ||
      e.classification === "responsive" ||
      e.classification === "supporting";
    const excluded = (e: StitchCase) =>
      e.classification === "historical" || e.classification === "superseded";
    expect(count(active)).toBe(41);
    expect(count(excluded)).toBe(10);
    expect(count(active) + count(excluded)).toBe(STITCH_CASES.length);
  });

  it("requires a successor for every historical/superseded entry", () => {
    for (const entry of STITCH_CASES) {
      if (entry.classification === "historical" || entry.classification === "superseded") {
        expect(
          entry.successorScreenId,
          `${entry.classification} ${entry.screenId} missing successorScreenId`,
        ).toBeTruthy();
      }
    }
  });

  it("points every successor to a real entry in the manifest", () => {
    const ids = new Set(STITCH_CASES.map((entry) => entry.screenId));
    for (const entry of STITCH_CASES) {
      if (!entry.successorScreenId) continue;
      expect(ids.has(entry.successorScreenId), `unknown successor ${entry.successorScreenId}`).toBe(
        true,
      );
    }
  });
});

describe("visual regression harness contract (Task 7)", () => {
  it("enforces the 41 active / 10 historical+superseded split for implementation targets", () => {
    const active = (e: StitchCase) =>
      e.classification === "canonical" ||
      e.classification === "responsive" ||
      e.classification === "supporting";
    const excluded = (e: StitchCase) =>
      e.classification === "historical" || e.classification === "superseded";
    expect(STITCH_CASES.filter(active)).toHaveLength(41);
    expect(STITCH_CASES.filter(excluded)).toHaveLength(10);
  });

  it("enforces 27 canonical surfaces", () => {
    const canonical = STITCH_CASES.filter((e) => e.classification === "canonical");
    expect(canonical).toHaveLength(27);
  });

  it("declares the three legacy CI regression viewports (360, 768, 1440) — TEST-03 (GAP-FULL-REVIEW-2026-08-25) reduced from 6 to fit the 25-min capture job budget", () => {
    const widths = REGRESSION_VIEWPORTS.map((v) => v.width);
    expect(widths).toEqual([360, 768, 1440]);
  });

  it("declares the M5 planning-detail viewport matrix (375, 768, 1024, 1440) — Milestone 5 (2026-08-30) spec §19 mobile/tablet/laptop/desktop", () => {
    const widths = PLANNING_DETAIL_VIEWPORTS.map((v) => v.width);
    expect(widths).toEqual([375, 768, 1024, 1440]);
  });

  it("routes every /planning surface to the 4-viewport M5 matrix and other surfaces to the 3-viewport legacy", () => {
    // Every /planning surface (prefix match) uses the M5 4-viewport
    // matrix, including list / detail / batch / new.
    for (const surface of [
      "/app/w/acme/planning",
      "/app/w/acme/planning/{contentItemId}",
      "/app/w/acme/planning/batch",
      "/app/w/acme/planning/new",
    ]) {
      const viewports = viewportsForSurface(surface);
      expect(viewports).toBe(PLANNING_DETAIL_VIEWPORTS);
      expect(viewports.map((v) => v.width)).toEqual([375, 768, 1024, 1440]);
    }
    // Non-planning surfaces stay on the legacy 3-viewport matrix.
    for (const surface of [
      "/app/w/acme/board",
      "/app/w/acme/calendar",
      "/app/w/acme/brand-kit",
      "/app/w/acme/reviews",
      "/app/w/acme/channels",
      "/app/w/acme/settings",
    ]) {
      const viewports = viewportsForSurface(surface);
      expect(viewports).toBe(REGRESSION_VIEWPORTS);
      expect(viewports.map((v) => v.width)).toEqual([360, 768, 1440]);
    }
  });

  it("resolves {contentItemId} placeholders when given a SeedResult", () => {
    const seed = { contentItemId: "abc-123" };
    for (const entry of STITCH_CASES) {
      if (!entry.route) continue;
      const resolved = resolveStitchRoute(entry.route, seed);
      expect(
        resolved.includes("{contentItemId}"),
        `unresolved placeholder for ${entry.screenId}: ${resolved}`,
      ).toBe(false);
      if (entry.route.includes("{contentItemId}")) {
        expect(resolved).toContain("abc-123");
      }
    }
  });

  it("rejects duplicate screenshot names", () => {
    const names = new Set<string>();
    for (const entry of STITCH_CASES) {
      for (const viewport of REGRESSION_VIEWPORTS) {
        const name = screenshotNameFor(entry, viewport);
        expect(names.has(name), `duplicate screenshot name ${name}`).toBe(false);
        names.add(name);
      }
    }
  });

  it("every state has a deterministic setup function", () => {
    const seen = new Set<string>();
    for (const entry of STITCH_CASES) {
      if (entry.evidenceGroup) continue; // shared evidence groups, not state-driven
      seen.add(entry.state);
    }
    for (const state of seen) {
      expect(
        typeof SETUP_FUNCTIONS[state as keyof typeof SETUP_FUNCTIONS],
        `missing setup for ${state}`,
      ).toBe("function");
    }
  });

  it("CANONICAL_SURFACES is the unique-route list of the 27 canonical Stitch cases", () => {
    const canonical = STITCH_CASES.filter((e) => e.classification === "canonical");
    const uniqueRoutes = new Set(canonical.map((e) => e.route).filter((r): r is string => !!r));
    expect([...uniqueRoutes].sort()).toEqual([...CANONICAL_SURFACES].sort());
  });
});

/**
 * Lock the portable naming contract for visual baselines. The
 * filenames must be:
 *   - relative POSIX (no absolute path, no Windows backslashes)
 *   - platform-agnostic (no `darwin`, `linux`, or `win32` suffix)
 *   - split under `reference/` and `responsive/` so the exact-reference
 *     and the responsive-matrix captures never collide
 *   - identical on every host so a capture from a macOS developer
 *     matches a capture from the Linux CI runner.
 */
describe("portable visual-baseline naming (Task 8)", () => {
  const platformSuffixes = ["darwin", "linux", "win32"] as const;
  // A single representative viewport pair keeps the test compact
  // while still exercising the exact-reference and the responsive
  // helpers. The wider uniqueness sweep below iterates over
  // `REGRESSION_VIEWPORTS` for full coverage.
  const mobileS = { name: "mobile-s", width: 360, height: 800 } as const;
  const wide = { name: "wide", width: 1440, height: 900 } as const;
  const desktop = { name: "desktop", width: 1280, height: 800 } as const;

  it("screenshotNameFor returns a relative POSIX path under reference/", () => {
    // STITCH_CASES is the 51-entry manifest; [0] is the canonical
    // workspaces surface (01aa8faf). The `!` asserts the array is
    // non-empty (covered by the manifest test above).
    const entry = STITCH_CASES[0]!;
    const name = screenshotNameFor(entry, mobileS);
    expect(name).toBe(`reference/${entry.classification}-${entry.screenId}-mobile-s.png`);
    // POSIX-relative, no leading slash, no drive letter, no backslashes.
    expect(name.startsWith("/")).toBe(false);
    expect(name.startsWith("reference/")).toBe(true);
    expect(name.includes("\\")).toBe(false);
  });

  it("responsiveScreenshotName returns a relative POSIX path under responsive/", () => {
    const name = responsiveScreenshotName("/app/w/acme/calendar", wide);
    expect(name).toBe("responsive/app-w-acme-calendar-wide.png");
    expect(name.startsWith("responsive/")).toBe(true);
    expect(name.startsWith("/")).toBe(false);
    expect(name.includes("\\")).toBe(false);
  });

  it("strips the host OS suffix (darwin / linux / win32) from every name", () => {
    for (const entry of STITCH_CASES) {
      for (const viewport of REGRESSION_VIEWPORTS) {
        const name = screenshotNameFor(entry, viewport);
        for (const suffix of platformSuffixes) {
          expect(
            name.toLowerCase().includes(`-${suffix}`),
            `${name} embeds platform suffix ${suffix}`,
          ).toBe(false);
        }
      }
      const responsiveName = responsiveScreenshotName(
        entry.route ?? entry.evidenceGroup ?? entry.screenId,
        desktop,
      );
      for (const suffix of platformSuffixes) {
        expect(
          responsiveName.toLowerCase().includes(`-${suffix}`),
          `${responsiveName} embeds platform suffix ${suffix}`,
        ).toBe(false);
      }
    }
  });

  it("produces no absolute path segments anywhere in the name", () => {
    // Drive letters (Windows), leading-slash POSIX, `Users/...` (macOS),
    // and `home/...` / `root/...` (Linux) must not appear.
    const absoluteSignals = ["/Users/", "/home/", "/root/", "C:\\", "D:\\", "/private/"];
    for (const entry of STITCH_CASES) {
      for (const viewport of REGRESSION_VIEWPORTS) {
        const name = screenshotNameFor(entry, viewport);
        for (const signal of absoluteSignals) {
          expect(name.includes(signal), `${name} leaks absolute path ${signal}`).toBe(false);
        }
      }
    }
  });

  it("keeps exact-reference and responsive-matrix captures in separate subdirectories", () => {
    const entry = STITCH_CASES[0]!;
    const referenceName = screenshotNameFor(entry, desktop);
    const responsiveName = responsiveScreenshotName(
      entry.route ?? entry.evidenceGroup ?? entry.screenId,
      desktop,
    );
    expect(referenceName.startsWith("reference/")).toBe(true);
    expect(responsiveName.startsWith("responsive/")).toBe(true);
    // The filename portion (after the subdir) is also distinct so a
    // grep for either surface pulls only its own directory.
    expect(referenceName.slice("reference/".length)).not.toBe(
      responsiveName.slice("responsive/".length),
    );
  });

  it("still produces unique names across every (entry, viewport) pair", () => {
    const names = new Set<string>();
    for (const entry of STITCH_CASES) {
      for (const viewport of REGRESSION_VIEWPORTS) {
        const name = screenshotNameFor(entry, viewport);
        expect(names.has(name), `duplicate screenshot name ${name}`).toBe(false);
        names.add(name);
      }
    }
    // 51 cases × 6 viewports = 306 distinct names under `reference/`.
    expect(names.size).toBe(STITCH_CASES.length * REGRESSION_VIEWPORTS.length);
  });

  it("still produces unique names for the responsive matrix across every (surface, viewport) pair", () => {
    const names = new Set<string>();
    for (const surface of CANONICAL_SURFACES) {
      for (const viewport of REGRESSION_VIEWPORTS) {
        const name = responsiveScreenshotName(surface, viewport);
        expect(names.has(name), `duplicate responsive name ${name}`).toBe(false);
        names.add(name);
      }
    }
    expect(names.size).toBe(CANONICAL_SURFACES.length * REGRESSION_VIEWPORTS.length);
  });

  it("responsive names are stable across hosts (same input → same output)", () => {
    const a = responsiveScreenshotName("/app/w/acme/calendar", wide);
    const b = responsiveScreenshotName("/app/w/acme/calendar", wide);
    expect(a).toBe(b);
  });
});
