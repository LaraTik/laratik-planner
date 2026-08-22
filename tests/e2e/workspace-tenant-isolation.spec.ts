import { test, expect } from "@playwright/test";

/**
 * M1.4 — Playwright e2e for cross-agency workspace isolation.
 *
 * Stub. Full coverage requires seeding two agencies with the
 * same workspace slug (the anti-IDOR test surface), which the
 * current dev seed endpoint (`/api/dev/seed`) does not support
 * — it creates one canonical agency + workspace.
 *
 * The unit suite
 * (`tests/unit/workspace-context-isolation.test.ts`) covers the
 * helper-layer contract exhaustively, including the cross-agency
 * slug collision and the anti-IDOR membership gate. A full
 * Playwright pass will land in a follow-up sub-task that extends
 * the dev seed to support `{ agencySlug, workspaceSlug }`
 * per-agency (so two agencies can each have a workspace called
 * `duplicate-slug`); that is out of scope for M1.4.
 *
 * TODO: Playwright e2e for cross-agency workspace isolation —
 * deferred to follow-up.
 *   - Seed two agencies, each with a workspace of the same slug.
 *   - Sign in as a member of agency A.
 *   - Visit `/app/w/duplicate-slug` → expect agency A's workspace
 *     renders normally.
 *   - Visit `/app/w/duplicate-slug?agency=<B's id>` → expect 404
 *     (not 403 — anti-IDOR; a 403 leaks the existence of the
 *     other agency's workspace).
 */

test.describe("cross-agency workspace tenant isolation", () => {
  test.skip("placeholder — covered by the M1.4 unit suite; e2e deferred", () => {
    // The full Playwright pass requires the dev seed to support
    // multiple agencies, which is a follow-up. Until then, this
    // test is intentionally skipped and the unit suite is the
    // authoritative coverage.
    expect(true).toBe(true);
  });
});
