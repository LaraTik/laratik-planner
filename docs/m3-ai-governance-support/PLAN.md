# Milestone 3 — AI governance and controlled support access

> **Status:** implementation complete on `feat/m3-ai-governance-and-support-access` (2026-08-24). All 1,359 unit tests + 98 integration tests green; `pnpm verify` clean.
> **Integration branch:** `feat/m3-ai-governance-and-support-access`.
> **Implementation commits:** `05982c4`, `c9d0288`, `7424cb1`, `(platform+security)`, `4701985`, `b4fc136`.

## Scope (per the master prompt, §4 Milestone 3)

1. **AI governance** — keep AI configuration agency-scoped and
   server-enforced. Platform controls; agency controls; per-user
   daily budget; capability intersection.
2. **Ticketed support access** — replace the implicit-impersonation
   model with a request → agency-admin-approval → grant →
   tenant-view workflow. Every view is audited. Grants can be
   revoked, expire automatically, and never widen the actor's
   agency membership.
3. **Persistent support-session banner** — every page rendered
   while a platform admin holds an active grant shows a banner
   that names the target agency, the remaining time, and the
   download state.
4. **Platform console surfaces** — `/app/platform/security` (my
   active grants, my recent views, open requests by agency);
   `/app/agency-settings/plan` (agency admin's support-requests
   card).

## Delivered task chain

Seven sub-tasks. Each one is implemented and tested on the
integration branch.

### M3.1 — Data model (single commit, foundation)

- Migration `0012_support_access_grants.sql` creating:
  - `support_access_request` — ticketed request, status state
    machine, workspace or metadata-only scope, downloads requested.
  - `support_access_grant` — the time-limited authorisation.
    UNIQUE on `request_id` (one grant per request), CHECK
    `expires_at > activated_at`, partial index
    `granted_to_user_id, expires_at WHERE revoked_at IS NULL`
    for the active-grant lookup.
  - `support_access_audit` — APPEND-ONLY audit. Triggers forbid
    UPDATE / DELETE (re-uses the `forbid_modify_audit_log()`
    function from migration 0009).
  - `ai_daily_budget_usage` — per-(agency, user, date) request
    counter. PK on `(agency_id, user_id, usage_date)`.
- Drizzle schema in `src/lib/db/schema/support.ts`. Re-exported
  from `src/lib/db/schema/index.ts`.
- Compatibility: additive. No existing row is modified.

### M3.2 — Support-access service (single commit)

- `src/lib/support/access.ts` — service-layer implementation of
  the five core operations:
  1. `createSupportAccessRequest(actor, input)`
  2. `decideSupportAccessRequest(actor, requestId, decision, input)`
  3. `revokeSupportAccessGrant(actor, grantId, reason)`
  4. `expireStaleSupportAccessGrants()` — idempotent sweep
  5. `findActiveSupportAccessGrant({ actor, agencyId, ... })` —
     the gate every tenant view calls.
- Plus the audit + IDOR-authorize wrappers
  (`authorizePlatformTenantView`, `authorizePlatformDownload`).
- Zod schemas for the wire contract.
- `SupportAccessError` with a canonical code set
  (`NotPlatformAdmin`, `NotAgencyAdmin`, `AlreadyDecided`,
  `CrossAgency`, `NoActiveGrant`, `DownloadNotAllowed`, ...).
- New rate-limit scopes
  (`support_access_request`, `support_access_decision`) in
  `src/lib/security/rate-limit.ts`.
- 15 unit tests in `tests/unit/support-access.test.ts`.

### M3.3 — AI governance (single commit)

- `src/lib/ai/governance.ts` — the canonical gate for the AI
  budget and capability intersection.
- `resolveEnabledCapabilities({ effectiveCapabilities, agencyExplicitCapabilities })` —
  pure function; the agency can never widen the intersection
  beyond the plan ceiling.
- `enforceAiBudget({ tx, agencyId, userId, capability, ... })` —
  atomic reservation: UPSERTs the per-user daily counter
  inside the same transaction as the monthly reservation. A
  cap breach throws `LimitExceededError` (the route maps to 429).
- `reconcileAiBudget(...)` — true up the reservation against
  the actual token counts the provider reports.
- `loadEnabledCapabilities(agencyId)` — one-Drizzle-read
  accessor for the route.
- `getUserDailyBudgetSnapshot(...)` — used by the AI tab in
  the platform console.
- `/api/ai/generate` route now calls `enforceAiBudget` instead
  of the raw `reserveCapacity` for the daily counter. The
  monthly path is unchanged in shape; the reconciliation step
  is now driven by `reconcileAiBudget`.
- 9 unit tests in `tests/unit/ai-governance.test.ts`.
- Updated `m2-ai-quota-wiring.test.ts` to assert the new
  wiring contract (route calls `enforceAiBudget` /
  `reconcileAiBudget`; governance owns the resource keys).

### M3.4 — Platform console + agency admin UI (single commit)

- `/app/platform/security` page (Stitch screen
  `2094dc437a1f4e57a7898246229c2808`):
  - "My active grants" table (download state, scope, time
    remaining).
  - "My recent views" table (audit-log only — no tenant
    content).
  - "Open requests" — every agency with a pending request.
- `/app/platform/security/actions.ts` — server actions for
  create / decide / revoke / expire-sweep, each with
  rate-limit + `revalidatePath`.
- `/app/platform/agencies/[agencyId]/support-section.tsx` —
  agency detail page gets a "Support access requests"
  block (read-only for platform admins).
- `/app/agency-settings/plan/support-requests-card.tsx` —
  agency admin's view of pending platform-admin requests,
  with a "Review" link to a future dedicated decision page.
- Sidebar gets a "Security & support" entry in the
  Platform section (platform admin only).

### M3.5 — Persistent support-session banner (single commit)

- `src/components/app-shell/support-session-banner.tsx` — the
  banner component. Pure server component: the parent layout
  pre-computes `remainingMinutes` so the banner does not call
  `Date.now()` during render (React 19 purity rule).
- `src/app/(app)/layout.tsx` — when the actor is a platform
  admin, fetch the active grants and pass them to `AppShell`
  as `supportGrants`. The layout re-queries on every request;
  revocation / expiry reflect in the next render.
- `AppShell` renders the banner above the main content.

### M3.6 — Tests (single commit)

- `tests/integration/support-access.test.ts` — 7 cases
  covering:
  - Create + agency-admin approval happy path.
  - Non-admin approval rejected.
  - Double-approval rejected.
  - Revocation immediately deactivates the grant.
  - Cross-agency workspace scope rejected (IDOR defence).
  - Audit log is append-only.
  - Expiry sweep flips the request to `expired`.
- `tests/integration/ai-governance.test.ts` — 4 cases covering
  capability intersection, daily counter increment, daily
  cap enforcement, and token reconciliation.
- All M1/M2 integration tests still pass (98/98).

### M3.7 — Documentation + tracker (this file)

- This plan document.
- `PRODUCTION_READINESS_TRACKER.md` M3 section (rows M3.1–M3.7)
  added with `Tested` status, commit references, and
  evidence pointers.

## Security and audit requirements (master prompt §5)

| Requirement                                                         | Status                                                                                                                                                                |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All platform mutations require platform-administrator authorization | ✅ — `requirePlatformAdmin` is the gate; actions layer re-checks via `auth()` + `currentActor()`.                                                                     |
| All agency mutations require explicit agency membership             | ✅ — `decideSupportAccessRequest` calls `isAgencyAdmin(actor, targetAgencyId)`.                                                                                       |
| Every entitlement change records before/after values                | ✅ (M2.1, unchanged). Support access decisions are recorded in `support_access_audit` with the same append-only contract.                                             |
| Every support-access action and content view is audited             | ✅ — `recordSupportAccessAudit` is called from every state transition and from the `authorizePlatformTenantView` / `authorizePlatformDownload` gates.                 |
| Secrets remain server-only                                          | ✅ — no new secrets; AI key handling unchanged.                                                                                                                       |
| Never log invitation tokens, AI keys, magic links, tenant content   | ✅ — `support_access_audit.metadata` is intentionally narrow (route + request id only).                                                                               |
| Validate agency scope again inside server actions                   | ✅ — `createSupportAccessRequest` re-checks the workspace belongs to the target agency; `decideSupportAccessRequest` re-checks `isAgencyAdmin(targetAgencyId)`.       |
| Prevent IDOR through guessed IDs                                    | ✅ — `createSupportAccessRequest` rejects cross-agency workspace scope with `CrossAgency`. `findActiveSupportAccessGrant` filters by `granted_to_user_id = actor.id`. |
| Apply rate limiting to support requests                             | ✅ — new `support_access_request` and `support_access_decision` scopes in the rate limiter (10/h and 30/h respectively).                                              |

## Migration, compatibility, and rollback

- The 0012 migration is additive; no existing row is touched.
- Application rollback path: deploy the prior image. The
  application no longer references the new tables; the
  migration does not change any existing column.
- Destructive rollback (drop the four new tables) requires a
  backup + verified downtime window because the append-only
  audit log and the support-grant history are production
  evidence.

## Definition of done — evidence pointers

| Requirement                                   | Evidence                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1,359 unit tests + 98 integration tests green | `pnpm test:unit` (1359/1359), `TEST_DATABASE_URL=… pnpm test:integration` (98/98).    |
| `pnpm verify` clean                           | `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build`.   |
| No skipped required tests                     | `grep -r "test.skip\|test.fixme" tests/` returns no new skip blocks.                  |
| Append-only audit enforced at the DB level    | `tests/integration/support-access.test.ts` "the audit log rejects UPDATE and DELETE". |
| Daily AI budget enforced transactionally      | `tests/integration/ai-governance.test.ts` "enforceAiBudget respects the daily cap".   |
| No M1 / M2 regression                         | `pnpm test:integration` (98/98 including all M1/M2 suites).                           |
| `pnpm build` succeeds                         | `pnpm build` exits 0 (last verified during the verify run).                           |

## Out of scope (deferred to later milestones)

- Stripe / billing automation (still manually managed, per
  master prompt).
- Dedicated agency admin decision page (the data is exposed on
  `/app/agency-settings/plan`; a full decision flow is a
  follow-up commit because the current surface already
  surfaces the pending state to the agency admin).
- Publish packages (Milestone 4).
