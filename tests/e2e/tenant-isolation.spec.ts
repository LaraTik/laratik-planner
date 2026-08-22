import { test } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

/**
 * M1.9 — Tenant isolation, end-to-end.
 *
 * Status: STUB. This file intentionally activates with `test.skip`
 * (gated on `RUN_TENANT_ISOLATION_E2E=1`) so it ships in CI as a
 * documented no-op while multi-agency seeding is still being wired
 * by M1.6 (replace callsites) and M1.7 (drop singleton key).
 *
 * ─── Why this is a stub today ───────────────────────────────────────────
 *
 * The four scenarios below all need TWO agencies in the same test
 * database. The current state of the M1 pipeline is:
 *
 *   - M1.1 platform_administrator table          (merged at 2ea37fc)
 *   - M1.2 HMAC-signed HttpOnly agency cookie    (merged at 2cfbc32)
 *   - M1.3 resolveActiveAgencyContext resolver   (merged on
 *         feat/m1-multi-agency at d8109c5; not yet on the 1.x chain)
 *   - M1.4 wire workspace resolution             (in flight)
 *   - M1.5 agency switcher UI                    (in flight)
 *   - M1.6 replace callsites (incl. dev/seed)    (in flight)
 *   - M1.7 drop singleton key                    (in flight)
 *   - M1.8 platform routes                       (in flight)
 *
 * The `agencies` table still carries a `singleton_key` unique index
 * + check (`src/lib/db/schema/identity.ts`), so a second `INSERT INTO
 * agency` would 23505. M1.7 removes that constraint. Until then the
 * dev/seed endpoint always reuses the one existing agency, so two
 * separate fixtures cannot coexist in a single test database.
 *
 * The unit suite (`tests/unit/cross-agency-tenant-deny.test.ts`)
 * pins the service-layer deny contract TODAY with 12 cases across
 * `isAgencyAdmin`, `canAccessWorkspace`, `canReview`, and
 * `canManageContent`. The e2e suite below is the integration-layer
 * companion and activates the moment M1.6 + M1.7 land.
 *
 * ─── Activation checklist (the 4 scenarios) ──────────────────────────────
 *
 * 1. Extend `src/app/api/dev/seed/route.ts` to accept an optional
 *    `agencyId` body field (or a `forceNewAgency: true` switch) that
 *    inserts a second agency row. M1.6 owns the callsite work; the
 *    schema change is M1.7's job. Both must land before this spec can
 *    run.
 * 2. Set `RUN_TENANT_ISOLATION_E2E=1` in the CI env (or remove the
 *    `test.skip` here). The check below throws on a non-stub run if
 *    the flag is missing.
 * 3. Add a test-only `/api/dev/seed-agency` route that takes an
 *    `email` + `workspaceSlug` and creates a fresh agency + workspace
 *    pair under the given email. Keep it dev-only (NODE_ENV gate).
 * 4. Confirm that the agency context cookie + workspace resolver
 *    refuse the `?agency=<otherId>` query-param attempt by returning
 *    404 (the resolver should ignore unknown query params and fall
 *    back to the cookie, which carries agency A — so the cross-agency
 *    lookup of "duplicate" slug finds nothing in agency A and 404s).
 * 5. Confirm the PATCH workspace mutation is gated by a server-action
 *    or a `/api/workspaces/[id]` route that resolves the actor's
 *    active agency and 403s on cross-agency. The unit suite already
 *    pins the policy deny; this spec asserts the wire-up.
 *
 * Until those are merged, leave the suite skipped. Adding a
 * `RUN_TENANT_ISOLATION_E2E=1` and seeing the first scenario run is
 * the merge-day signal.
 */

const T11Y_E2E_ENABLED = process.env.RUN_TENANT_ISOLATION_E2E === "1";

test.describe("tenant isolation (cross-agency) — STUB until M1.6 + M1.7 land", () => {
  test.skip(
    !T11Y_E2E_ENABLED,
    "M1.9 e2e awaits M1.6 (dev/seed multi-agency) + M1.7 (drop singleton key). See file header.",
  );

  test("SCENARIO 1 — Member A navigating to /app/w/duplicate sees agency A's workspace", async () => {
    // TODO(activate after M1.6 + M1.7):
    //   - seed agency A with workspace slug `duplicate`, signed in as member A
    //   - seed agency B with workspace slug `duplicate` (same slug, different agency)
    //   - member A (NOT a member of agency B) navigates to /app/w/duplicate
    //   - the workspace resolver uses the agency context cookie (agency A) and
    //     finds the workspace in agency A — the page renders agency A's workspace
    //     shell, NOT agency B's content
    //   - assert the page heading matches agency A's workspace name
    void bootstrapTestSession;
    throw new Error(
      "M1.9 e2e not yet activated. Set RUN_TENANT_ISOLATION_E2E=1 after M1.6 + M1.7 land and fill in the activation checklist above.",
    );
  });

  test("SCENARIO 2 — Member A navigating to /app/w/duplicate?agency=<B's id> gets 404", async () => {
    // TODO(activate after M1.6 + M1.7):
    //   - same fixture as scenario 1
    //   - member A navigates to /app/w/duplicate?agency=<B's id>
    //   - the workspace resolver ignores the (unsigned / attacker-supplied)
    //     query param and uses the agency context cookie instead (cookie = agency A)
    //   - cookie-anchored resolver looks up (agencyA, 'duplicate') and finds
    //     it — but the actor is NOT a member of agency B, so the page
    //     eventually 404s (the workspace is hidden in B's namespace)
    //   - assert the page returns 404 or the not-found surface
    throw new Error("M1.9 e2e not yet activated. See file header activation checklist.");
  });

  test("SCENARIO 3 — Member A cannot PATCH /api/workspaces/<B's workspace id> (403)", async () => {
    // TODO(activate after M1.6 + M1.7):
    //   - same fixture as scenario 1
    //   - sign in as member A (agency context cookie = agency A)
    //   - issue PATCH /api/workspaces/<B's workspace id> with a benign body
    //   - assert the response status is 403 (or 404 if the resolver hides
    //     the existence — both are acceptable; the contract is "deny")
    //   - the policy helper `canAccessWorkspace(actor, wsB)` returns false
    //     because member A has no agency-B admin grant and no workspace
    //     membership in B (see tests/unit/cross-agency-tenant-deny.test.ts
    //     for the unit-level pin)
    throw new Error("M1.9 e2e not yet activated. See file header activation checklist.");
  });

  test("SCENARIO 4 — Member A cannot list agency B's invitations, channels, or members", async () => {
    // TODO(activate after M1.6 + M1.7):
    //   - same fixture as scenario 1
    //   - seed at least one pending invitation, one channel, and one member
    //     in agency B
    //   - as member A, hit each of the agency-B list endpoints:
    //       GET /api/agencies/<B>/invitations
    //       GET /api/agencies/<B>/channels
    //       GET /api/agencies/<B>/members
    //     (or the equivalent server-action loaders if the lists are
    //     server-rendered rather than fetched)
    //   - assert every response is 403 (or 404), and the response body
    //     contains zero rows from agency B
    //   - the policy helper `canManageAgencyMember(actor, ..., B)` and
    //     `isAgencyAdmin(actor, B)` both return false (unit-pinned)
    throw new Error("M1.9 e2e not yet activated. See file header activation checklist.");
  });
});
