/**
 * Regression test for the publish page's blocker rendering.
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
 * Fix: the publish page now uses `presentReadinessIssues()` to
 * translate each issue into a `title` + `message` pair, and the
 * `<code>` element that used to render the path is gone.
 *
 * This test loads the page module statically and asserts:
 *   1. The page module imports `presentReadinessIssues` (it now
 *      has to — the old `<code>` path is dead).
 *   2. The page module no longer references the `ReadinessIssue`
 *      type alias in a way that would let the path render.
 *   3. The page does not contain the string `<code>` inside
 *      the issues-list block.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PAGE_PATH = resolve(
  process.cwd(),
  "src/app/(app)/app/w/[slug]/planning/[id]/publish/page.tsx",
);

describe("publish page — no technical path codes in user surface", () => {
  it("imports presentReadinessIssues from the readiness-presentation module", () => {
    const src = readFileSync(PAGE_PATH, "utf8");
    expect(src).toMatch(
      /import\s*\{[^}]*presentReadinessIssues[^}]*\}\s*from\s+["']@\/lib\/publishing\/readiness-presentation["']/,
    );
  });

  it("does not import the raw ReadinessIssue type into the page (the readiness engine's path-bearing shape is presentation-internal now)", () => {
    const src = readFileSync(PAGE_PATH, "utf8");
    expect(src).not.toMatch(/type\s+ReadinessIssue[^a-zA-Z]/);
  });

  it("does not render a <code> element with the issue path", () => {
    const src = readFileSync(PAGE_PATH, "utf8");
    // The old line: `<code className="...">{issue.path}</code>`
    // The fix replaced this with the human title. Asserting the
    // exact string match would be brittle to whitespace, so we
    // look for the literal `<code` token near `issue.path` and
    // also assert there is no `issue.path` access in the JSX.
    expect(src).not.toMatch(/\{issue\.path\}/);
    expect(src).not.toMatch(/<code[\s\S]*?>\{/);
  });
});
