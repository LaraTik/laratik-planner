# MiniMax implementation prompt — Multi-agency SaaS Milestone 2

Use this prompt in a clean LaraTik Planner task when reproducing, auditing, or completing Milestone 2. First inspect the repository and preserve any implementation that already satisfies the requirements; never duplicate a table, route, or service merely because it is named below.

## Mission

Complete Milestone 2 of LaraTik Planner as a production-ready multi-agency SaaS. A platform super administrator must provision and manage agencies, assign plans and overrides, enforce workspace/user/social-profile/storage/AI limits transactionally, control agency lifecycle, and inspect agency usage. Agency administrators get a read-only Plan & Usage surface. Do not add Stripe or automated billing.

Follow `AGENTS.md`, `STUDIOFLOW_MASTER_PROMPT.md`, `PRODUCTION_READINESS_TRACKER.md`, relevant ADRs, and the applicable Next.js 16 documentation under `node_modules/next/dist/docs/`. Update `PORT_NOTES.md` for every material deviation. Use TDD, atomic commits, and the repository's evidence protocol. MiniMax may mark work only through `Tested`; only an independent reviewer may assign `Verified`.

## Step 1 — Data and policy foundation

1. Add additive Drizzle migrations for:
   - `platform_plan_template`, seeded with Starter, Growth, Enterprise, and Custom.
   - one `agency_entitlement` per agency, linked to a template, with replacement overrides; `null` means unlimited.
   - append-only `agency_entitlement_change` with before/after, actor, reason, and timestamp.
   - `agency_usage_counter`, keyed by agency and resource/cycle.
   - deduplicated 80/90/100 threshold events.
   - append-only `platform_audit_event`.
   - soft `suspended_at` and `archived_at` agency lifecycle fields.
2. Backfill existing agencies with an Enterprise-compatible entitlement and reconciled counters without replacing identifiers or deleting tenant data.
3. Implement typed effective-entitlement resolution. Plan defaults merge with submitted agency overrides; a plan-change submission replaces the previous override set.
4. Implement atomic plan changes that update entitlement, append entitlement history, and append platform audit in one transaction. Require an operator reason.

Acceptance: from-zero and existing-data migrations pass; four plans exist; histories are append-only; rollback/compatibility evidence is written.

## Step 2 — Transactional enforcement and AI control

1. Implement per-agency/per-resource reservations under `pg_advisory_xact_lock` or an equivalent transaction lock. Validate every requested resource before changing any counter.
2. Return a structured limit error with `resource`, `currentUsage`, `limit`, `requestedIncrease`, and a useful `userMessage`.
3. Wire reservations and releases into:
   - workspace creation;
   - invitations, pending seats, acceptance, revocation, expiry, activation, and deactivation;
   - social-profile creation/archive, enforcing total and per-platform capacity together;
   - storage accounting boundaries if currently implemented;
   - AI monthly request/input/output tokens and per-user daily requests.
4. Existing data must remain readable if a limit is lowered below current use. Mark it over-limit and block only new allocations.
5. AI's effective allowlist is: global feature flag ∩ plan ceiling ∩ agency-enabled capabilities. Unsupported capabilities return `501` before any reservation. Release or reconcile reservations on provider failure and actual token use. Respect the configured maximum output-token ceiling.

Acceptance: concurrency cannot oversell; bulk reservations are all-or-nothing; archived/deactivated resources release capacity exactly once; no counter goes below zero.

## Step 3 — Platform and agency interfaces

1. Build the platform-only overview and agency table with KPIs, plan, lifecycle, and usage signals.
2. Build the four-step Add Agency drawer using the existing Stitch design language:
   - Organization: name, slug, locale, timezone.
   - First administrator: name and email.
   - Plan and limits: plan plus only meaningful overrides. Never send an empty override object.
   - Review and create.
3. Provision agency, entitlement, first-admin membership/invitation, initial counters, and audit event in one transaction. Send the invitation email only after commit. If email fails, return a warning and do not invite the caller to retry tenant creation.
4. Build `/app/platform/agencies/[agencyId]` with Plan and AI tabs. Plan controls change template/overrides and suspend/archive/restore with reasons and audit records. AI shows monthly requests/tokens, reset date, estimated cost when available, capability breakdown, and effective gates.
5. Build `/app/agency-settings/plan` as read-only for agency admins, showing current/limit/threshold state for workspaces, active users plus pending invitations, total/per-platform profiles, storage, and AI. Provide a request-limit-change contact action; do not permit self-editing.
6. Keep platform authority separate from tenant authority. A platform admin without membership may manage platform routes but may not read agency content. The central tenant resolver must reject suspended/archived agencies and stale cookies.

Acceptance: all routes enforce their intended role; no cross-agency resource is revealed; lifecycle is soft and recoverable; every platform mutation is audited.

## Step 4 — Verification, evidence, and delivery

1. Add unit, integration, component, and Playwright coverage for all requirements above. Required tests may not use `skip`, `fixme`, conditional assertions, or configuration-based silent bypasses.
2. Exercise two agencies with the same workspace slug. The signed active-agency context is authoritative; a hostile query value must not switch authority or reveal foreign data. Switching succeeds only for an active membership.
3. Run the real production migrator in the migration drill. Prove from-zero, in-place, backup/restore, and failed-migration abort. Confirm `drizzle.__drizzle_migrations` is complete before and after restore, then run `pnpm db:migrate` again to prove the restored database does not replay old migrations.
4. Run and record:
   - `pnpm format:check`
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test:unit`
   - `TEST_DATABASE_URL=<disposable-test-db> pnpm test:integration`
   - focused multi-agency Playwright journeys
   - `TEST_DATABASE_URL=<disposable-test-db> pnpm migration-drill`
   - `pnpm test:coverage`
   - `pnpm audit --prod`
   - `pnpm build`
   - `pnpm verify`
5. Update the M2 plan, ADR, authorization/data-model/overview docs, migration/deployment evidence, test evidence, and production-readiness tracker. Record exact commands, counts, commit SHA, compatibility, backup, and rollback evidence. Do not claim `Verified`.
6. When every gate is green, commit atomically, merge according to repository policy, push `main`, and report CI/deploy status. Never include secrets in output, fixtures, screenshots, or commits.

## Required final report

Return a concise mapping of M2.1–M2.10 to files and commits, every verification command with exact result, the migration compatibility/rollback statement, known owner-only follow-ups, final branch/main SHAs, and CI/deploy URLs or status. If any gate is red, stop before merge and report the precise blocker instead of weakening a test.
