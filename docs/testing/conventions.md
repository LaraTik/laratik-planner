# Testing conventions

> Companion to `docs/testing/strategy.md` (release gates, layer contract, thresholds). This file is the **recipe** for writing a new test — the implicit details that `strategy.md` does not cover.

## 1. Test-class taxonomy

| Class         | Path                                          | Command                                                             | Boundary                                                                                                                                                                                                                                              | Speed target |
| ------------- | --------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Unit          | `tests/unit/**/*.test.ts`                     | `pnpm test:unit`                                                    | Pure schemas, workflow rules, KPI math, security helpers, UI behavior. **Never** connects to PostgreSQL.                                                                                                                                              | < 1s/file    |
| Integration   | `tests/integration/**/*.test.ts`              | `TEST_DATABASE_URL=...test... pnpm test:integration`                | Applies migrations to a disposable PostgreSQL database and runs real constraints, authorization, transaction, and concurrency cases. **Never** skips.                                                                                                 | < 30s/file   |
| E2E (browser) | `tests/e2e/**/*.spec.ts`                      | `pnpm test:e2e` (critical) / `pnpm test:e2e:isolated` (full matrix) | Real Next.js dev server + Playwright; runs against the dev seed (`/api/dev/sign-in`, `/api/dev/seed`).                                                                                                                                                | < 60s/spec   |
| A11y          | `tests/e2e/a11y/*.spec.ts` + `pnpm test:a11y` | `pnpm test:a11y`                                                    | WCAG 2.2 AA via axe + keyboard-only journeys.                                                                                                                                                                                                         | < 60s/spec   |
| Visual        | `tests/e2e/visual-regression.spec.ts`         | `pnpm test:visual`                                                  | Per-viewport baselines; 39 exact-reference captures plus 73 scoped responsive baselines (19 non-planning surfaces × 3 viewports, four planning surfaces × 4 viewports). Capture mode (`PW_VISUAL_CAPTURE=1`) regenerates; compare mode fails on diff. | < 30m/full   |

A new test belongs in **one** class only. A unit test that talks to the database is a misclassification. An integration test that uses Playwright is a misclassification. The `strategy.md` "Test layers" table is the source of truth for which class a piece of work lands in.

## 1.1 Affected development loop

Use the affected runner for normal development:

```bash
pnpm test:affected
pnpm test:affected -- --since origin/main
pnpm test:area auth
pnpm test:affected -- --layer unit --coverage
```

`test:affected` includes staged, unstaged, untracked, and committed changes
since the configured upstream branch. `--since <ref>` overrides that baseline;
`--area <name>` is exposed by `pnpm test:area <name>` for an intentional manual
run. The command is a hard gate: selected failures, unsafe database setup, and
manifest errors exit non-zero.

Unit selection uses Vitest's import graph for changed source and owned files
for direct test changes; that policy is encoded in the typed ownership
manifest. Integration and browser selection uses the manifest in
`scripts/test-ownership.ts`. Browser
feedback defaults to Chromium; a11y and visual cases are selected by route or
surface where the manifest provides a grep selector. Shared shell, auth,
database, migration, i18n, dependency, config, fixture, and unknown changes
escalate to the broadest relevant suites.

The affected command does not run coverage unless `--coverage` is supplied.
The full coverage run remains the threshold-enforced release gate. A
documentation-only change prints an explicit no-tests-needed result.

The standard location for new tests is `tests/<layer>/<domain>/`. Existing
root-level tests may be moved when their domain is touched; a repository-wide
test relocation is not required.

## 2. The `bootstrapRoleSession` recipe

The `bootstrapRoleSession(page, role, workspaceSlug?)` helper in `tests/e2e/_helpers.ts` is the canonical entry point for any browser test that needs a signed-in user with a specific role. The recipe:

```ts
import { bootstrapRoleSession, type FixtureRole } from "./_helpers";

test("designer can edit format-payload", async ({ page }) => {
  await bootstrapRoleSession(page, "designer");
  await page.goto("/app/w/acme/content/<content-id>");
  // ... assertions
});
```

Internally the helper:

1. Calls `devSeed(page.request, { email: "e2e-designer@laratik.local", workspaceSlug: "acme", workspaceRoles: ["designer"] })` to create a user, an agency, a workspace, and a membership with the role.
2. Calls `devSignIn(page.request, { email, role: "user" })` to set the `authjs.session-token` cookie on the Playwright context.
3. Returns the `SeedResult` (`{ userId, agencyId, workspaceId, ... }`) so the test can deep-link to specific entities.

The seven `FixtureRole` values are: `"agency_admin" | "workspace_manager" | "content_planner" | "designer" | "internal_reviewer" | "client_reviewer" | "publisher" | "viewer"`. Use `agency_admin` for tests that need the cross-workspace surface; use the specific role for tests that exercise the role-by-route matrix (see `tests/e2e/role-authorization.spec.ts`).

In capture mode (`PW_VISUAL_CAPTURE=1`) the dev endpoints are retried up to 3 times on a 500 to survive the Next.js 16.3.1 dev-server manifest race. In compare mode the call is single-attempt and a real 500 fails loud — the visual baseline must never silently miss a regression.

## 3. Per-glob floor table

The CI coverage thresholds in `strategy.md:84-91` apply to specific globs. A new test file must live under one of these globs and contribute to the right floor:

| Glob                               | Statements | Branches | Notes                                                                |
| ---------------------------------- | ---------- | -------- | -------------------------------------------------------------------- |
| `src/lib/auth/**`                  | 95%        | 90%      | "Critical" — the authorization boundary is the highest-risk surface. |
| `src/lib/workflow/**`              | 95%        | 90%      | "Critical" — the state machine drives every content transition.      |
| `src/lib/deliveries/**`            | 95%        | 90%      | "Critical" — immutable version chain.                                |
| `src/lib/publishing/**`            | 95%        | 90%      | "Critical" — manual publish + partial completion + failure recovery. |
| `src/lib/invitations/**`           | 95%        | 90%      | "Critical" — the only user-acquisition path.                         |
| `src/lib/kpi/**`                   | 95%        | 90%      | "Critical" — client-visible numbers; rounding errors are a UX bug.   |
| `src/lib/services/**` (other)      | 85%        | 80%      | "Service" — the application-services floor.                          |
| `src/lib/repositories/**`          | 85%        | 80%      | "Service" — data access is exercised by integration tests.           |
| `src/lib/commands/**`              | 85%        | 80%      | "Service" — Zod schemas, no I/O.                                     |
| `src/lib/validation/**`            | 85%        | 80%      | "Service" — the env schema is the boot-time gate.                    |
| Everything else under `src/lib/**` | —          | —        | Tracked, not gated (current numbers in `TEST_EVIDENCE.md`).          |

A new file under `src/lib/auth/**` is critical and needs the 95/90 floor from the start. The Vitest config (`vitest.config.ts`) enforces the thresholds via `coverage.thresholds`; a PR that drops a critical file below the floor fails CI.

## 4. `UAT_RELEASE.md` row conventions

`docs/production-readiness/UAT_RELEASE.md` records the per-feature UAT verdict. The status column is one of three values:

| Status         | When                                                                                                                                              | What the row contains                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `PASS`         | The UAT journey completed end-to-end against the real deployment with no operator-supplied exceptions.                                            | The §23 step ID(s), the UAT evidence path, the operator + date.                                                |
| `PARTIAL`      | The UAT journey completed for the documented surface but with operator-supplied exceptions, or the journey is blocked on a separate (named) item. | The §23 step ID(s), the operator-supplied exception (verbatim), the dependency that closes the gap, the owner. |
| `OUT OF SCOPE` | The feature is explicitly deferred (M-tag, master-prompt §X, or a tracker row) and is not part of the v1 contract.                                | The M-tag or §X reference, the deferral reason, the planned milestone.                                         |

A `PARTIAL` row must be **named** — the operator-supplied exception is part of the row, not a comment. A `PARTIAL` row that has no owner is a review-blocker; the row is the artifact that ties the gap to a person.

## 5. The integration runner's `TEST_DATABASE_URL` guard

The integration runner refuses to start without `TEST_DATABASE_URL`, and the URL must contain the literal `test` or `ci` substring. The guard is at the top of every integration test file:

```ts
if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
```

The second line is the integration runner's contract: the integration test sets `DATABASE_URL` to the test value, so every `db` import in the test sees the disposable database. The `setup.ts` mock of `next/cache` is the only exception; the rest of the test surface uses the real Drizzle client against the disposable Postgres.

Additional safety constraints enforced by the runner:

- **No conditional skips.** `it.skip` and `describe.skip` are forbidden in required tests. The runner treats them as a failure.
- **No `if (process.env.SOMETHING)` assertions.** A test that conditionally asserts based on env is a misconfiguration, not a test.
- **No fixture cleanup that hides bugs.** `beforeEach` may create, but it must not silently roll back on assertion failure in a way that masks a real regression.
- **The disposable database is created and dropped per file.** The runner applies migrations, runs the test, drops the database, and moves on. A test that mutates the database and does not clean up is a runner bug, not a test bug.

The integration runner is the contract for what "real database" means. A new test that needs a different database (e.g. a Postgres 14 compatibility matrix) is a new runner, not a new flag.

## 6. Author checklist

Before opening the PR for a new test:

- [ ] The test is in the right class per §1; no test spans two classes.
- [ ] The test uses `bootstrapRoleSession` if it is a browser test that needs a signed-in user; no test calls `devSignIn` / `devSeed` directly.
- [ ] The test lives under a glob that has a coverage floor in §3, and the floor is met.
- [ ] Integration tests throw if `TEST_DATABASE_URL` is missing; no conditional assertions on env.
- [ ] The `UAT_RELEASE.md` row (if any) uses the §4 status column convention and is named.
- [ ] `pnpm verify` is green (format, lint, typecheck, unit, build) and `pnpm test:integration` passes locally with the disposable database.
- [ ] The PR title references the goal number and the gap audit ID.
