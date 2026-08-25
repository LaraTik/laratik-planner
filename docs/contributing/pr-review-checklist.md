# PR review checklist

> Companion to `AGENTS.md:236` (PR gate) and `PRODUCTION_READINESS_TRACKER.md:14` (the `Verified` rule). The reviewer uses this checklist before flipping a row from `Tested` to `Verified`; the author uses it as a self-check before requesting review.

## Review contract

A PR is `Verified` only when an independent reviewer (not the author) confirms every item below. The `Tested` transition is the author's responsibility; the `Verified` transition is the reviewer's. Both must reference the goal number, the gap-audit ID (if part of a sweep), and the M-tag in the PR title.

## 1. IDOR and authorization

The PR's added or changed surface must not introduce an Insecure Direct Object Reference. The reviewer verifies:

- **Every server action / route handler that touches tenant data takes an `Actor` and an `agencyId` (or `workspaceId`) explicitly.** No global `activeAgencyId()` in production code paths.
- **The agency context resolver is the only place that reads the `laratik_active_agency` cookie.** New surfaces call `resolveActiveAgencyContext({ actor, requestedAgencyId? })`; they do not parse the cookie themselves.
- **Per-agency and per-workspace membership is checked at the service layer, not the UI layer.** The UI hides unauthorized controls, but the service is the source of truth.
- **Platform routes call `assertPlatformRole(actor, "<role>")` before any data access.** The four-role matrix in `docs/architecture/authorization.md:54-68` is the contract.
- **A 403 / 404 surface on a denied access path is the only acceptable response.** A redirect to a "no access" page is a leak (it confirms the resource exists). A 200 with empty data is a leak (it confirms the actor could read). Both are review-blockers.

## 2. Transaction boundaries

The PR's mutations must commit or roll back atomically. The reviewer verifies:

- **Every multi-write operation runs inside `db.transaction(async (tx) => { ... })`.** A `db.insert` followed by a `db.update` outside a transaction is a review-blocker.
- **The transaction is the unit of audit.** The audit row (`agency_entitlement_change`, `platform_audit_event`, `support_access_audit`, etc.) is inserted in the same transaction as the mutation. A failed audit write must roll back the mutation; the `forbid_modify_audit_log()` trigger is the safety net.
- **`SELECT ... FOR UPDATE` is used wherever two writers can race on the same row.** The lease-based claim pattern in `src/lib/social/repository.ts` is the reference; the entitlement service in `src/lib/entitlements/service.ts` is the reference for counter reservations.
- **No `await` outside the transaction holds a row lock.** The transaction body is the only place that touches the locked row.

## 3. Audit rows

The PR's mutating surface must leave an audit trail. The reviewer verifies:

- **Every state transition writes the appropriate audit row.** The state-machine transitions in `src/lib/content/workflow.ts` and `src/lib/publishing/` are the reference; the audit row is in the same transaction as the transition.
- **Audit rows are append-only.** The `forbid_modify_audit_log()` trigger (created in 0009, attached to every audit table since) is the safety net; a PR that bypasses the trigger is a review-blocker.
- **The audit row contains the actor, the action, the target, the outcome, and a request ID.** A `metadata` jsonb is allowed for free-form context, but the structured columns are non-negotiable.
- **A failed audit write rolls back the mutation.** The integration tests in `tests/integration/platform-access.test.ts` and `tests/integration/support-access.test.ts` are the contract.

## 4. Per-agency and per-workspace boundary

The PR's added or changed surface must not silently cross tenant boundaries. The reviewer verifies:

- **Every query that reads tenant data includes a `WHERE agency_id = $1` (or `WHERE workspace_id = $1`) clause.** A `db.select` against `content_item` without the workspace filter is a review-blocker.
- **Every query that writes tenant data is parameterized on the agency / workspace ID.** No service may read a global "current agency" and write to it; the ID is an explicit argument.
- **`LEFT JOIN` and `INNER JOIN` across tenant boundaries are forbidden.** A `content_item JOIN social_channel` must include both `workspace_id` filters; a missing one is a review-blocker.
- **The repository layer is the only place that constructs queries.** The service layer calls `repository.findById(actor, agencyId, id)`; it does not construct SQL itself.

## 5. Coverage and tests

The PR must move the relevant coverage floor. The reviewer verifies:

- **Unit tests cover every new branch in the service layer.** The Vitest coverage thresholds in `docs/testing/conventions.md:3` apply; a PR that drops a critical file below the floor is a CI-blocker.
- **Integration tests cover every new migration, every new CHECK constraint, and every new transaction boundary.** `TEST_DATABASE_URL` is required; the integration runner refuses to start without it.
- **Browser tests cover every new role-by-route surface.** `tests/e2e/role-authorization.spec.ts` is the matrix; a new role or a new route adds a row to the matrix.
- **The visual baseline is regenerated (capture mode) for any new route or any UI surface that changes layout.** The compare step in CI fails on a diff; the reviewer checks the artifact.

## 6. Migrations, secrets, and operational surface

The PR must leave the operational surface in a known state. The reviewer verifies:

- **Any new migration follows `docs/architecture/migrations.md`.** The additive-only rule applies; a destructive change has an ADR in `docs/decisions/`. The per-migration section in `docs/production-readiness/MIGRATION_DEPLOYMENT.md` is updated.
- **`pnpm migration-drill` passes drills 1–5 on disposable Postgres.** The drill result is the evidence attached to the PR.
- **No new env var without an entry in `docs/operations/environment.md`.** A PR that introduces an env var and forgets the doc row is a review-blocker.
- **No real secret in source, fixtures, screenshots, or PR descriptions.** The split env schema in `src/lib/validation/env.ts` is the structural guard; a literal secret in a fixture is a CI-blocker.
- **`pnpm audit --prod` reports zero critical / high advisories.** A new dependency that introduces a known critical / high CVE is a review-blocker.

## 7. Reviewer sign-off

The reviewer records the verdict in the PR description and in the relevant `PRODUCTION_READINESS_TRACKER.md` row. The sign-off is the gate that flips the row from `Tested` to `Verified`; the tracker is the single source of truth for that transition.

| Item                                                 | Confirmed by reviewer | Notes |
| ---------------------------------------------------- | :-------------------: | ----- |
| IDOR / authorization                                  | ☐                     |       |
| Transaction boundaries                                | ☐                     |       |
| Audit rows                                            | ☐                     |       |
| Per-agency / per-workspace boundary                   | ☐                     |       |
| Coverage and tests                                    | ☐                     |       |
| Migrations, secrets, and operational surface          | ☐                     |       |
| `pnpm verify` green on `main` at the merged SHA       | ☐                     |       |
| `pnpm migration-drill` PASS at the merged SHA         | ☐                     |       |
| Release-candidate `pnpm test:e2e:isolated` + `pnpm test:visual` green | ☐ (if release-candidate) |       |

A `Verified` row in the tracker is the reviewer's assertion that every box above is checked.
