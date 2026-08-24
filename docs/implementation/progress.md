# Implementation status

This file is a pointer, not a second tracker.

The prior goal-by-goal claims were stale and mixed scaffolding, compilation, partial UI, and production verification. They have been retired. Use the following sources:

- [`../../PRODUCTION_READINESS_TRACKER.md`](../../PRODUCTION_READINESS_TRACKER.md) for status, severity, acceptance criteria, and evidence.
- [`../production-readiness/SCREEN_PARITY.md`](../production-readiness/SCREEN_PARITY.md) for canonical Stitch screen coverage.
- [`../production-readiness/TEST_EVIDENCE.md`](../production-readiness/TEST_EVIDENCE.md) for commands, coverage, and browser results.
- [`../production-readiness/UAT_RELEASE.md`](../production-readiness/UAT_RELEASE.md) for the production-like release decision.

Only an independent reviewer may mark a tracker item `Verified`. Implementation agents stop at `Tested` and attach reproducible evidence.

## 2026-08-24 — Production login render incident repair

Status: **Database repair applied in production; corrected app readiness deployment pending.**

Reference `1145607673` mapped to a production Postgres error: relation
`support_access_grant` did not exist. Login and session creation were
successful; the authenticated app layout failed when the platform-admin
support-session banner queried the missing table.

The root cause was migration ordering across parallel branches. Journal entry
`0012_support_access_grants` carried a timestamp older than already-deployed
entries `0007–0011`, so Drizzle skipped it during an incremental migration and
continued with later entries. The repair is forward-only:

- `0017_repair_support_access_grants.sql` idempotently restores the four M3
  tables, indexes, append-only audit trigger, comments, and the original 0012
  ledger row.
- Readiness now requires the critical M3 tables and a complete recorded ledger
  suffix. It accepts the production database's legitimate pre-ledger baseline,
  while still rejecting gaps and the historically reordered 0012 entry.
- A journal-order unit guard documents the single historical inversion and
  requires the repair plus strictly monotonic timestamps afterward.
- The Docker context now excludes nested `.DS_Store` files so local macOS
  metadata cannot be parsed as Drizzle migration JSON during image builds.
- The migration drill now reproduces the production ledger/table gap before
  proving the real migrator repairs it.

Evidence on disposable Postgres 16: focused unit tests 9/9 PASS;
`pnpm migration-drill` 5/5 PASS with 18/18 ledger rows after repair. Existing
tenant data is unaffected because the migration is additive. Application
rollback can retain the tables; destructive schema rollback requires the
verified pre-deploy backup.

CI run `32774784826` passed. Deploy run `32775688443` created the backup and
applied 0017, restoring all four tables and the 0012 ledger row. Its app stage
rolled back because the first exact-ledger readiness check did not account for
the production database's historical baseline (seven recorded recent rows vs.
18 on a fresh database). The additive schema repair remains applied; the
baseline-aware readiness follow-up has focused regression coverage.

## 2026-08-24 — Social profile analytics (M4) merged

Status: **Tested**. Independently Verified is not yet claimed; M4 rows stop at `Tested` pending independent review.

`feat/auto-20260824-3613c271` merged into `main` as `0f6d552`. Thirteen atomic commits on the feature branch plus the merge bring:

- **Schema** — `0015_social_profile_analytics` (renumbered from `0013` to avoid colliding with main's `0013_ai_provider_secret`): three new tables (`social_connection`, `social_oauth_state`, `social_profile_daily_metric`) and ten additive columns on `social_channel`. All migrations are forward-only.
- **Crypto** — `src/lib/social/crypto.ts` with versioned AES-256-GCM envelopes, `laratik-planner:social-credentials:v1` AAD, key-version 1, fail-closed key-length validation.
- **Provider layer** — `src/lib/social/types.ts`, `http.ts`, `repository.ts`, `providers/meta.ts`, `providers/tiktok.ts`, `sync.ts`. The provider-adapter contract is shared; the cron worker is the only path that talks to Meta/TikTok.
- **OAuth** — `/api/social/{meta,tiktok}/{connect,callback}/route.ts` with one-time CSRF state, provider-scope minimization, and token-free error redirects.
- **UI** — connection-status badge, account picker with focus-within ring + keyboard handlers, focus-managed revoke confirmation dialog, social growth dashboard at `/app/w/[slug]/analytics/social` with hand-rolled dependency-free accessible SVG chart, exact-value table, 7/30/90 window selector. Sidebar entry added under "Social Channels" → "Social Analytics".
- **Cron** — `/api/cron/social-metrics` authenticated with `CRON_SECRET` (timing-safe), 20-profile batch, 5-minute lease via `FOR UPDATE SKIP LOCKED`, 24h OAuth state + 25-month metric retention. `scripts/vps/social-metrics-sync.sh` and the `*/15 * * * *` entry in `install-cron.sh` are added.
- **Docs** — ADR-0004, runbook § Social analytics (rollout, key rotation, retention, revoke), `EXTERNAL_SERVICES_UAT.md` Meta + TikTok evidence contracts.
- **Tests** — 60 new unit tests (crypto, http, analytics, sync scheduling, Meta provider, TikTok provider, picker), 29 new integration tests (M4 tables, repository, OAuth state consumption, claim/refresh/save invariants), 2 new E2E files, axe-core a11y coverage for the new analytics route.

`SOCIAL_SYNC_ENABLED=false` is the default. `SOCIAL_TIKTOK_ENABLED=false` until Meta's seven-day production observation window passes. The shared `READY FOR INDEPENDENT REVIEW` verdict is unchanged; the `READY` flip still requires owner action (Sentry, manual a11y, visual baselines, Stitch MCP capture of the two new screens, independent reviewer).

## 2026-08-24 — Per-agency social DEK + lazy platform KEK (M4.5) merged

Status: **Tested**. Independently Verified is not yet claimed; M4.5 rows stop at `Tested` pending independent review.

Seven atomic commits on `main` (`42f3bac` … `5e5a763`) plus the merge bring:

- **Schema** — migration `0016_per_agency_social_dek.sql` adds the `agency_social_dek` table (1:1 with agency): the agency DEK wrapped by the platform KEK using AES-256-GCM with AAD `laratik-planner:social-dek:v1`. CHECK constraints pin the byte-length framing; an index on `dek_key_version` supports the KEK-rotation script.
- **Crypto refactor** — `src/lib/social/crypto.ts` is now DEK-in-hand (`sealCredentialsWithDek` / `openCredentialsWithDek`). The env-key `sealCredentials` / `openCredentials` are removed. The `laratik-planner:social-credentials:v1` AAD is unchanged.
- **Service layer** — `src/lib/social/key-management.ts` exposes `getKekOrThrow` (lazy), `wrapDek` / `unwrapDek` (pure crypto), `enableAgencyDek` / `disableAgencyDek` / `rotateAgencyDek` (transactional), `createDekCache` / `getDekForAgency` / `getDekForWorkspace` (per-request DEK cache), and `rewrapAllDeksForKekRotation` (for the script). AAD is `laratik-planner:social-dek:v1`, distinct from the credentials AAD.
- **Repository** — `createPendingConnection` / `updateConnectionCredentials` / `openConnectionCredentials` resolve the per-agency DEK via the cache; the env-key `getEncryptionKey` / `seal` / `open` helpers are removed.
- **Sync worker** — `runSyncTick` is a soft no-op when the KEK is unavailable (`kekStatus: "kek_missing"`) instead of throwing. `runOne` resolves the DEK per profile and surfaces `MissingKekError` / `DekNotEnabledError` as a 24h backoff with a `platform_kek_missing` / `social_not_enabled` code, without marking the connection as `needs_reauth`.
- **Lazy KEK** — `src/lib/validation/env.ts` no longer boot-blocks on a missing or wrong-length `SOCIAL_TOKEN_ENCRYPTION_KEY`. The application boots cleanly without it; the social admin UI shows a "platform KEK not configured" banner; the cron worker returns zero counts.
- **Service orchestration** — `src/lib/social/service.ts` wraps the key-management primitives with authorization, audit logging, and HTTP error translation. Every mutation writes a `security_audit_event` row.
- **API** — five routes under `/api/agencies/[agencyId]/social/`: `GET` (status), `POST enable`, `POST disable`, `POST dek/rotate`, `POST dek/reset-recovery`. Agency admin only.
- **UI** — `/app/agency-settings/social` renders a social card with enable / rotate / disable / reset-recovery flows. The recovery-key modal enforces a "I have saved my recovery key" checkbox before Close. The agency-settings index page links to it from the managed-services card.
- **KEK rotation script** — `scripts/rotate-social-kek.ts` re-wraps every `agency_social_dek` row from an old KEK to a new KEK. Refuses to run if old == new, refuses wrong-length keys, prints fingerprints for the audit log. Dry-run mode is supported.
- **Tests** — 18 new unit tests in `tests/unit/social-key-management.test.ts` (crypto roundtrip, AAD isolation, env handling, cache locality), 8 new unit tests in `tests/unit/rotate-social-kek-args.test.ts` (CLI surface), 6 new integration tests in `tests/integration/social-dek-repository.test.ts` (per-agency isolation, rotation re-seal, disable cascade, KEK re-wrap), and the existing `tests/integration/social-repository.test.ts` and `tests/unit/social-crypto.test.ts` were updated to drive the DEK-in-hand API.
- **Docs** — `docs/operations/runbook.md` § "Platform KEK rotation" rewritten with the exact script invocation, dry-run step, post-rotation runbook, and a clear "do not rotate without the script" warning. `docs/operations/environment.md` § M4.5 added explaining the multi-tenant key model and the boot behaviour.

## 2026-08-24 — Navigation-first UI/UX refinement

Commit `7536d4d` completes a screen-by-screen navigation and responsive-layout
pass. The application now has one route hierarchy across an expanded desktop
sidebar, 72px tablet rail, and context-aware mobile bottom navigation with an
accessible More sheet. Redundant Planning and Settings navigation was removed,
missing destinations were restored, creation became permission-aware, and the
mobile calendar now uses an agenda layout. The design record is
[`../design/UI_UX_REFINEMENT_2026-08-24.md`](../design/UI_UX_REFINEMENT_2026-08-24.md);
exact automated results are in
[`../production-readiness/TEST_EVIDENCE.md`](../production-readiness/TEST_EVIDENCE.md).
The release verdict remains `READY FOR INDEPENDENT REVIEW`.

## 2026-08-23 — Multi-agency SaaS Milestone 2

Milestone 2 adds plan templates, agency entitlements, transactional quotas, usage and threshold tracking, agency lifecycle controls, AI ceilings, the platform agency console, the four-step Add Agency flow, and the agency-admin Plan & Usage screen. The scoped plan and reproducible evidence are in [`../m2-multi-agency/PLAN.md`](../m2-multi-agency/PLAN.md); the implementation handoff prompt is [`../m2-multi-agency/MINIMAX_IMPLEMENTATION_PROMPT.md`](../m2-multi-agency/MINIMAX_IMPLEMENTATION_PROMPT.md). All M2 rows stop at `Tested` pending independent review.

## 2026-08-21 — Stitch production completion (Tasks 1–10)

All thirteen tasks in
[`../superpowers/plans/2026-08-21-stitch-production-completion.md`](../superpowers/plans/2026-08-21-stitch-production-completion.md)
landed between 2026-08-21 13:22 and 2026-08-22 00:10. The shared
release verdict across the tracker + this directory is
`READY FOR INDEPENDENT REVIEW` (the independent reviewer flips it to
`READY` in Task 13).

| Task | Focus                                                      | Key commits                                           | Evidence                                                                                                          |
| ---- | ---------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1    | Stitch contract locked                                     | `c2bfac5`                                             | `tests/e2e/stitch-cases.ts`, `tests/unit/stitch-cases.test.ts`, `docs/production-readiness/SCREEN_PARITY.md`      |
| 2    | Brand Kit section nav + 4 stitched cards                   | `b07654f`, `72f0fed`                                  | `/app/w/[slug]/brand-kit` page; `docs/design/SETTINGS_UI_LEARNINGS.md`                                            |
| 3    | Brand Kit R1 (CRUD command + Pillars + Color/Voice)        | `439a52d`, `ab47b3a`, `dc8c951`                       | 75/75 tests pass                                                                                                  |
| 4    | Brand Kit R2 (Logo + Typography + storage)                 | `03c9db9`, `d075841`, `6d7e48d`                       | Local-volume storage + signed URL                                                                                 |
| 5    | Brand Kit R3 (Bento + Stitch top tabs)                     | `b66d7ba`                                             | `/app/w/[slug]/brand-kit` aligned to `16aaf0a9` capture                                                           |
| 6    | Brand Kit R4 (publishing + linked resources) + admin E2E   | `cef5ca3`, `3dff494`, `94ed715`, `b84c945`, `6056b93` | `tests/e2e/administration.spec.ts`; 583/583 tests pass                                                            |
| 7    | Visual regression harness + 138 baselines                  | `a9fa300`, `3d40183`                                  | `tests/e2e/visual-regression.spec.ts`; deploy gated on critical visual tests                                      |
| 8    | Accessibility + UAT + external services evidence contracts | `2025602`                                             | `ACCESSIBILITY_CHECKLIST.md`, `EXTERNAL_SERVICES_UAT.md`, `UAT_RELEASE.md`                                        |
| 9    | Coverage thresholds restored to production targets         | `fd4a6e0`, `298edee`                                  | 861/861 unit tests pass; per-glob floors at 95/90/95/95 critical + 85/80/85/85 services + 87/85/100/87 validation |
| 10   | Settings-wide polish (4 pages)                             | `acda5ef`–`7f32060`                                   | Channels, team, workspace-settings, agency-settings aligned to their Stitch captures                              |
| 11   | Documentation reconciliation (this commit)                 | (this change set)                                     | Every status document now uses the same 49/27/23/39/10/138 numbers and the same shared release verdict            |

Definitions (used consistently across every doc above):

- **51 captured Stitch references** under `designs/stitch/` (PNG + HTML each, 102 files + `DESIGN.md`).
- **27 canonical route/surface rows** including `/signin/forgot-password`.
- **23 unique routes** deduped from the 27 canonical cases (the responsive matrix iterates over these).
- **41 active references** (27 canonical + 11 responsive + 3 supporting) at the Stitch capture viewport; 39 are route-backed exact-reference comparisons and two are shared-state evidence groups.
- **10 historical/superseded exclusions** (3 historical + 7 superseded) with successors.
- **138 responsive baselines** (23 unique routes × 6 viewports: 360, 390, 768, 1024, 1280, 1440).

`Implemented` means code exists; `Tested` requires committed automated/manual
evidence; `Verified` requires independent reviewer sign-off.
