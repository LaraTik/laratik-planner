# Milestone 2 — Plans, entitlements, quotas, and platform console

> **Status:** implementation complete; `Tested` evidence captured 2026-08-23. Independent review is still required for `Verified`.
> **Integration branch:** `feat/m2-multi-agency` (created off `main`).
> **Implementation commits:** `d7503ff`, `0b74bb5`, `a13d780`, `bc5448e`, `4efdc50`, `c3506d3`, `e5086fe`, `f098d6d`, `72c2ea7`, `91e2fd9`, `6009904`, `4409f7e`, `0f5b5bc`, `1a75dc3`.

## Scope (per the master prompt, §4 Milestone 2)

1. **Plan templates** — `platform_plan_template` seeded with Starter / Growth / Enterprise / Custom.
2. **Per-agency entitlement** — `agency_entitlement` + `agency_entitlement_change` (audit every change with before/after/actor/reason).
3. **Usage tracking** — counters for workspaces, users, total + per-platform social profiles, storage bytes, monthly AI requests / input tokens / output tokens, per-user daily AI requests, enabled AI capabilities.
4. **Threshold events** — `agency_usage_threshold_event` rows at 80% (warning) / 90% (urgent) / 100% (over limit).
5. **Platform audit** — `platform_audit_event` for every platform-level action (lifecycle, entitlement, agency creation, etc.).
6. **Transactional enforcement** — `assertCanCreate(agencyId, resource)` inside the service boundary, with `pg_advisory_xact_lock` (or row-level lock) to keep concurrent requests within capacity. Structured error contract: `{ resource, currentUsage, limit, requestedIncrease, userMessage }`.
7. **Platform console** — overview KPIs, agencies table (extending M1.8 with suspend/restore/archive + plan-change actions), agency detail tabs (Plan / AI), read-only Plan & Usage screen for the agency admin at `/app/agency-settings/plan`.
8. **Add Agency drawer** — 4 steps (Stitch `0cc5554` org, `4fa9eb` admin, `0a06cbc` plan/limits, `6acbc6` review). One transaction: org → entitlement → invitation → audit event → email (after commit).
9. **Read-only agency Plan/Usage screen** — workspace usage, active-user usage, total + per-platform social-profile usage, storage, AI. "Request limit change" action. Admins cannot edit their own entitlements.

## Out of scope (deferred to later milestones)

- Stripe / billing automation (v1: manual metadata).
- Support access (Milestone 3).
- Publish packages (Milestone 4).

## Delivered task chain

The chain has 9 tasks (M2.6 was folded into M2.1 + M2.7 because its scope is split between "what data the table needs" and "what the Plan tab exposes"). Every task is implemented and tested on the integration branch.

- Read `STUDIOFLOW_MASTER_PROMPT.md` §4 + `AGENTS.md` before coding.
- Use TDD — write the test first, see it fail, then implement. No skipping or weakening existing tests to pass.
- Atomic commit per task. Conventional message: `feat(...): <scope> (M2.X)`.
- `pnpm verify` (format:check + lint + typecheck + test + build) MUST be green before the worker reports done.
- Push the branch and report the final commit SHA.

### Layer 1 — Data model (single task, foundation)

#### M2.1 — Data model

- Migration `0009_*.sql` creating:
  - `platform_plan_template` (id, slug, name, description, default JSONB of limits, archived_at, timestamps). Seed 4 templates (Starter / Growth / Enterprise / Custom) with sensible default limits.
  - `agency_entitlement` (agency_id PK/FK, plan_template_id FK, overrides JSONB, hard_stop_percent, grace_policy, effective_since, timestamps).
  - `agency_entitlement_change` (id, agency_id, actor_user_id, before JSONB, after JSONB, reason, created_at). Append-only.
  - `agency_usage_threshold_event` (id, agency_id, resource, percent, level ENUM('warning','urgent','over_limit'), observed_at). Insert-on-threshold-cross with dedupe so we don't re-emit the same level repeatedly.
  - `platform_audit_event` (id, actor_user_id, action, target JSONB, before JSONB, after JSONB, ip, user_agent, created_at).
  - Indexes + FKs + `NOT NULL` discipline.
- Drizzle schema files in `src/lib/db/schema/` for the above.
- Re-export the new tables from `src/lib/db/schema/index.ts`.
- Tests:
  - **Unit:** schema invariants (NOT NULL, FK, JSONB shape, ENUM values).
  - **Integration:** 4 seed plans exist; `agency_entitlement` FK cascade; append-only `agency_entitlement_change` rejects UPDATE; threshold event dedupe.
- Acceptance: `pnpm verify` green. Commit on `feat/m2-multi-agency-2.1`. Rebase target: tip of `feat/m2-multi-agency` (which is `main` @ `e7f6126` at dispatch time).

### Layer 2 — Services (parallel after M2.1)

#### M2.2 — Entitlement service

- `getEffectiveEntitlement(agencyId)` → merges plan defaults + agency overrides, returns the resolved limits (workspaces, users, social profiles total, per-platform profiles, storage bytes, AI requests/tokens, per-user daily, enabled capabilities, hard_stop_percent).
- `changeAgencyPlan({ agencyId, planTemplateId, overrides, reason, actorUserId })` — one DB transaction: write `agency_entitlement_change` (before/after), update `agency_entitlement`, write `platform_audit_event`. Throws if agency suspended/archived.
- Tests: unit on merge function (overrides win where set), integration on transaction (audit row + entitlement row atomic; rollback on any failure).
- Re-base target: tip of `feat/m2-multi-agency` after M2.1 merge.

#### M2.3 — Usage tracking

- `recordUsage(agencyId, resource, delta)` — updates the appropriate counter; emits a `agency_usage_threshold_event` if the 80/90/100 boundary is crossed and not already recorded.
- `getUsage(agencyId)` → returns snapshot of all counters + their thresholds and current level.
- Counters live in `agency_entitlement` JSON or a side table; pick the cleaner schema. Recommend a dedicated `agency_usage_counter(agency_id, resource, value, updated_at)` table — easier to reason about per-resource locking.
- Per-platform social-profile counter must key on (agency_id, platform) so total-profile and per-platform limits both work.
- Tests: unit on threshold detection (79→80 emits warning, 89→90 emits urgent, 99→100 emits over_limit; re-emitting same level is a no-op). Integration on per-platform counter independence.
- Re-base target: tip of `feat/m2-multi-agency` after M2.1 merge.

#### M2.4 — Transactional limit enforcement

- `assertCanCreate(agencyId, resource, n=1)` — wraps the create path. Inside a transaction:
  1. Acquire `pg_advisory_xact_lock(hashtext(agency_id || '|' || resource))` for per-agency-per-resource serialization.
  2. Read effective limit + current usage.
  3. If `current + n > limit`, throw `LimitExceededError({ resource, currentUsage, limit, requestedIncrease: n, userMessage })`.
  4. Otherwise increment counter (or leave to the create path) and commit.
- Wire into the workspace-create, social-profile-create, invitation-create paths. These can be done in M2.4 only if the create endpoints already exist; otherwise export the helper and let M2.5 (Add Agency) + later milestones wire it.
- Tests:
  - Unit: error contract shape.
  - Integration: concurrent `assertCanCreate` calls cannot exceed capacity (use Promise.all of N>limit requests; assert exactly `limit` succeed).
  - Integration: bulk operation atomic (50 inserts in a single transaction that exceed limit → all rollback).
- Re-base target: tip of `feat/m2-multi-agency` after M2.1 merge.

### Layer 3 — UI (parallel after M2.4)

#### M2.5 — Add Agency 4-step drawer (Stitch 0cc5554 / 4fa9eb / 0a06cbc / 6acbc6)

- New route surface: a drawer/modal launched from the platform agencies table.
- Step 1 (Organization) — name, slug, locale, timezone. Zod schema.
- Step 2 (First administrator) — email, name. Zod schema.
- Step 3 (Plan and limits) — pick plan template, set overrides. Zod schema.
- Step 4 (Review and create) — summary + submit.
- Submit server action: single transaction — (a) create `agency`, (b) create `agency_member` for the first admin, (c) create `agency_entitlement`, (d) insert `platform_audit_event`, (e) insert invitation. Then, AFTER commit, send invitation email.
- Rollback on any step: no partial state, no orphan invitations, no emails sent.
- Tests: server action tests for transaction rollback (force a failure at step c and assert a/b are rolled back); component tests for navigation; integration test for end-to-end agency creation + audit event + invitation row.
- Re-base target: tip of `feat/m2-multi-agency` after M2.4 merge.

#### M2.7 — Agency detail Plan tab (Stitch a73722f) **+ folded M2.6 actions**

- New tab on `/app/platform/agencies/[agencyId]`. Platform-only.
- Effective plan summary + override form.
- Lifecycle actions on the same page: **Suspend** / **Restore** / **Archive** — calls platform-admin server action, writes `platform_audit_event`. Suspend blocks sign-in (gate at layout level), archive is soft and recoverable.
- Plan-change modal: pick new plan template, set overrides, write reason, submit. Calls M2.2's `changeAgencyPlan`.
- Re-base target: tip of `feat/m2-multi-agency` after M2.4 merge.

#### M2.8 — Agency detail AI tab (Stitch 40eff1c)

- New tab on `/app/platform/agencies/[agencyId]`. Platform-only.
- AI usage snapshot (this month): requests, input tokens, output tokens, estimated cost, per-capability breakdown.
- AI capability intersection: platform ceiling ∩ agency enabled capabilities. Show which are enabled/disabled.
- Reset date display.
- Re-base target: tip of `feat/m2-multi-agency` after M2.4 merge.

#### M2.9 — Read-only Plan and Usage screen for agency admin (Stitch b739d9f)

- New route `/app/agency-settings/plan`. Agency-admin-only.
- Effective plan.
- Workspace usage, active-user usage, total + per-platform social-profile usage, storage usage, AI usage.
- Threshold level indicators (healthy / warning / urgent / over_limit).
- Plain explanation of what each limit means.
- "Request limit change" button — opens a mailto: / contact form (no Stripe, no self-service plan change).
- Re-base target: tip of `feat/m2-multi-agency` after M2.4 merge.

### Layer 4 — Tests

#### M2.10 — Tests

- Transactional enforcement integration tests (concurrent quota, bulk atomicity).
- Threshold event tests at 80 / 90 / 100.
- Lower-limit-below-usage → over-limit state; existing work remains viewable.
- Archived resources release seats.
- Suspended / archived agencies: lifecycle gates.
- Platform-audit coverage: every entitlement + lifecycle change recorded.
- Plan-change audit: before/after + actor + reason + timestamp.

### Integration evidence

1. Migration drill: from-zero, in-place, backup/restore, and failed-migration abort all pass through migration `0011`. From-zero creates 47 public application tables and records all 12 official migrations in `drizzle.__drizzle_migrations`; the drill helper adds its own 48th public table only after the official migration step. Backup/restore preserves the real 12-row Drizzle ledger, and a post-restore `pnpm db:migrate` is a no-op success.
2. Focused M2 database suite: 39/39 pass.
3. Complete database integration suite: 87/87 pass after explicit agency context was added to legacy client-isolation tests.
4. Unit suite, browser isolation suite, production build, and `pnpm verify` are final merge gates; final results are recorded in `docs/production-readiness/TEST_EVIDENCE.md`.
5. Lowering a finite limit below current usage preserves all tenant rows; the live usage view becomes `over_limit`, and only new allocations are blocked.
6. Email delivery happens after agency creation commits. A delivery failure is returned as a warning and cannot cause a duplicate retry of a successfully created tenant.

## Decisions applied

- **M2.6:** folded into M2.1 + M2.7; lifecycle data and controls are one cohesive surface.
- **Unlimited:** `null` means unlimited. It is never treated as a zero limit.
- **Plan changes:** submitted overrides replace the old set so overrides from one plan do not leak into another.
- **Counters:** active users include pending invitations; accepting an invitation does not reserve a second seat. Revocation/expiry/deactivation release capacity once.
- **AI:** the effective gate is global feature flag ∩ plan ceiling ∩ agency configuration. Requests and tokens are reserved transactionally, with monthly/daily UTC resets.
