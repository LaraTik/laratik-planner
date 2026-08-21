import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_SURFACES,
  REGRESSION_VIEWPORTS,
  SETUP_FUNCTIONS,
  STITCH_CASES,
  type StitchCase,
  resolveStitchRoute,
  screenshotNameFor,
} from "../../tests/e2e/stitch-cases";

/**
 * Lock the canonical 49-screen Stitch contract: 39 active targets and 10
 * historical/superseded captures with successors. Every entry must point
 * to a real PNG and HTML artifact on disk, declare either a route or a
 * shared-state evidence group, and be tagged with a classification that
 * rolls up to the counts the production-readiness plan requires.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..");

const count = (predicate: (entry: StitchCase) => boolean): number =>
  STITCH_CASES.filter(predicate).length;

describe("canonical Stitch capture manifest", () => {
  it("maps all 49 unique captured screens", () => {
    expect(STITCH_CASES).toHaveLength(49);
    expect(new Set(STITCH_CASES.map((entry) => entry.screenId)).size).toBe(49);
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

  it("matches the 27/11/1/3/7 classification split", () => {
    expect(count((e) => e.classification === "canonical")).toBe(27);
    expect(count((e) => e.classification === "responsive")).toBe(11);
    expect(count((e) => e.classification === "supporting")).toBe(1);
    expect(count((e) => e.classification === "historical")).toBe(3);
    expect(count((e) => e.classification === "superseded")).toBe(7);
  });

  it("marks 39 active targets and 10 historical/superseded exclusions", () => {
    const active = (e: StitchCase) =>
      e.classification === "canonical" ||
      e.classification === "responsive" ||
      e.classification === "supporting";
    const excluded = (e: StitchCase) =>
      e.classification === "historical" || e.classification === "superseded";
    expect(count(active)).toBe(39);
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
  it("enforces the 39 active / 10 historical+superseded split for implementation targets", () => {
    const active = (e: StitchCase) =>
      e.classification === "canonical" ||
      e.classification === "responsive" ||
      e.classification === "supporting";
    const excluded = (e: StitchCase) =>
      e.classification === "historical" || e.classification === "superseded";
    expect(STITCH_CASES.filter(active)).toHaveLength(39);
    expect(STITCH_CASES.filter(excluded)).toHaveLength(10);
  });

  it("enforces 27 canonical surfaces", () => {
    const canonical = STITCH_CASES.filter((e) => e.classification === "canonical");
    expect(canonical).toHaveLength(27);
  });

  it("declares the six regression viewports (360, 390, 768, 1024, 1280, 1440)", () => {
    const widths = REGRESSION_VIEWPORTS.map((v) => v.width);
    expect(widths).toEqual([360, 390, 768, 1024, 1280, 1440]);
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
