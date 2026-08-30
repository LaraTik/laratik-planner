/**
 * Regression test for the publish surface's blocker rendering.
 *
 * Symptom (GAP-UX-2026-08-29): the publish package page rendered
 * each readiness issue with the raw `path` next to the human
 * message, e.g.
 *
 *   channels.<UUID>.payload.caption   Instagram posts require a caption.
 *
 * The path leaks UUIDs and schema keys into the planner's
 * normal surface. The technical path is the readiness engine's
 * internal addressing; users only need the human explanation.
 *
 * Phase 7 of the planning-detail refactor (2026-08-30)
 * absorbed the standalone `/publish` route into the Planning
 * detail page's Publishing tab. The test now guards the new
 * locations:
 *   1. The standalone `/publish` page is a thin redirect —
 *      it does NOT render readiness issues at all.
 *   2. The publishing surface (`PublishPackageForm`) does
 *      not leak `issue.path` into the JSX.
 *   3. The `presentReadinessIssues` helper still exists in
 *      the presentation module (its callers moved, but the
 *      helper is the contract the new UI relies on).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PAGE_PATH = resolve(
  process.cwd(),
  "src/app/(app)/app/w/[slug]/planning/[id]/publish/page.tsx",
);
const FORM_PATH = resolve(
  process.cwd(),
  "src/app/(app)/app/w/[slug]/planning/[id]/publish/publish-package-form.tsx",
);
const PRESENTATION_PATH = resolve(process.cwd(), "src/lib/publishing/readiness-presentation.ts");

describe("publish surface — no technical path codes in user surface", () => {
  it("the /publish page is now a thin redirect (does not render readiness issues)", () => {
    const src = readFileSync(PAGE_PATH, "utf8");
    // The redirect-only page should not render the issues list
    // nor import the presentation helper (its callers moved
    // into the planning detail page).
    expect(src).not.toMatch(/\{issue\.path\}/);
    expect(src).not.toMatch(/presentReadinessIssues/);
  });

  it("the PublishPackageForm does not leak issue.path into the JSX", () => {
    const src = readFileSync(FORM_PATH, "utf8");
    expect(src).not.toMatch(/\{issue\.path\}/);
    expect(src).not.toMatch(/<code[\s\S]*?>\{/);
  });

  it("the presentation helper still exists in the readiness-presentation module", () => {
    const src = readFileSync(PRESENTATION_PATH, "utf8");
    expect(src).toMatch(/export\s+function\s+presentReadinessIssues/);
  });
});
