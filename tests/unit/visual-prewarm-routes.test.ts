import { describe, expect, it } from "vitest";
import {
  CANONICAL_SURFACES,
  STITCH_CASES,
  collectPreWarmRoutes,
  resolveStitchRoute,
} from "../e2e/stitch-cases";

/**
 * Pre-warm route guard.
 *
 * The visual-regression spec pre-warms every route in a hidden page
 * context before any test runs (see
 * `tests/e2e/visual-regression.spec.ts → test.beforeAll`). The
 * pre-warm used to call `page.goto(route)` with a *template* route
 * (e.g. `/app/w/acme/planning/{contentItemId}`), which the dev server
 * happily compiled but then threw
 * `invalid input syntax for type uuid: "%7BcontentItemId%7D"` from
 * the SSR data fetch on every request. Each visit stalled for ~1 min,
 * and the 25-route pre-warm eventually blew the 20-min job timeout
 * (CI run 32941456850, 20m6s → failure on
 * `Run visual regression (assert mode)`).
 *
 * The fix is to run each route through `resolveStitchRoute(route,
 * seed)` before navigating. This test locks the invariant: any
 * future route added to the pre-warm set MUST be fully resolvable
 * through `resolveStitchRoute` (i.e. contain no `{...}` placeholders
 * after substitution). If a placeholder slips in, this test fails
 * loud during the unit-test phase — the pre-commit hook runs
 * `vitest related` on staged files, so a change to
 * `tests/e2e/stitch-cases.ts` or `stitch-cases.test.ts` or this file
 * automatically re-runs this guard before the commit lands.
 *
 * `collectPreWarmRoutes` is the single source of truth for the
 * pre-warm route set; the spec's `test.beforeAll` calls the same
 * helper, so a drift between the spec and this test is impossible.
 *
 * Why the explicit regex check on top of `resolveStitchRoute`'s
 * own contract: `resolveStitchRoute` only knows about
 * `{contentItemId}` today. If a new placeholder (e.g. `{campaignId}`)
 * is added to a route without a matching substitution in the
 * resolver, the literal `{...}` would survive and reach
 * `page.goto` — the same class of bug. Asserting "no `{` remains
 * after resolution" catches any future placeholder, not just the
 * one the resolver implements today.
 */
describe("visual-regression pre-warm routes must be fully resolvable", () => {
  // A single representative seed is enough — the substitution is
  // value-agnostic. We only need a value that doesn't itself contain
  // `{` or `}` so the post-resolution check is unambiguous.
  const representativeSeed = { contentItemId: "00000000-0000-0000-0000-000000000001" };

  it("pre-warm route set is non-empty (sanity)", () => {
    const routes = collectPreWarmRoutes();
    expect(routes.length).toBeGreaterThan(0);
    // 25 routes is the committed baseline; assert it as a soft guard
    // so a future refactor that accidentally empties the set (e.g.
    // filtering out every entry) fails loud here, not in CI.
    expect(routes.length).toBeGreaterThanOrEqual(20);
  });

  it("collectPreWarmRoutes agrees with the legacy inline set (CANONICAL_SURFACES ∪ active STITCH_CASES.routes)", () => {
    // Belt-and-suspenders: the helper and the old inline construction
    // must produce the same set. If a future refactor to the helper
    // accidentally drops a route (e.g. an `entry.route` field becomes
    // optional) the responsive matrix would silently lose a surface
    // and visual coverage would shrink. This test catches that.
    const expected = new Set<string>(CANONICAL_SURFACES);
    for (const entry of STITCH_CASES) {
      if (entry.classification === "historical" || entry.classification === "superseded") {
        continue;
      }
      if (entry.route) expected.add(entry.route);
    }
    expect([...collectPreWarmRoutes()].sort()).toEqual([...expected].sort());
  });

  it("no pre-warm route contains any unresolved template placeholder after resolution", () => {
    const routes = collectPreWarmRoutes();
    // Match anything from `{` to `}` — catches {contentItemId},
    // {campaignId}, {whatever} — even if resolveStitchRoute does
    // not yet know about the new placeholder.
    const placeholderPattern = /\{[^}]+\}/;
    const offenders: { route: string; resolved: string; match: string }[] = [];
    for (const route of routes) {
      const resolved = resolveStitchRoute(route, representativeSeed);
      const match = resolved.match(placeholderPattern);
      if (match) {
        offenders.push({ route, resolved, match: match[0] });
      }
    }
    expect(
      offenders,
      "pre-warm routes contain unresolved placeholders after " +
        "resolveStitchRoute; either teach the resolver to substitute " +
        "them or stop including the route in the pre-warm. Offenders:\n" +
        offenders.map((o) => `  ${o.route} → ${o.resolved} (matched ${o.match})`).join("\n"),
    ).toEqual([]);
  });

  it("every pre-warm route resolves to an absolute app route starting with /app, /setup, or /signin", () => {
    const routes = collectPreWarmRoutes();
    for (const route of routes) {
      const resolved = resolveStitchRoute(route, representativeSeed);
      // A pre-warm visit that lands on a 404 or a redirect target
      // (e.g. /signin) is wasted compile budget. The committed
      // surfaces all start with /app, /setup, or /signin; if a new
      // route lands outside that set, it likely points at the wrong
      // thing and should be reviewed before the next capture.
      expect(
        /^\/(app|setup|signin)\b/.test(resolved),
        `pre-warm route ${route} resolved to ${resolved}, which is not under /app, /setup, or /signin`,
      ).toBe(true);
    }
  });
});
