# Implementation status

This file is a pointer, not a second tracker.

The prior goal-by-goal claims were stale and mixed scaffolding, compilation, partial UI, and production verification. They have been retired. Use the following sources:

- [`../../PRODUCTION_READINESS_TRACKER.md`](../../PRODUCTION_READINESS_TRACKER.md) for status, severity, acceptance criteria, and evidence.
- [`../production-readiness/SCREEN_PARITY.md`](../production-readiness/SCREEN_PARITY.md) for canonical Stitch screen coverage.
- [`../production-readiness/TEST_EVIDENCE.md`](../production-readiness/TEST_EVIDENCE.md) for commands, coverage, and browser results.
- [`../production-readiness/UAT_RELEASE.md`](../production-readiness/UAT_RELEASE.md) for the production-like release decision.

Only an independent reviewer may mark a tracker item `Verified`. Implementation agents stop at `Tested` and attach reproducible evidence.

## 2026-10-03 — Research evidence UX hardening

The source-only Research surface now includes a responsive evidence grid with
search, platform filtering, transparent sorting by saved date, publish date,
views, likes, or comments, explicit unavailable values, source links, and
brief handoff actions. The client component receives serializable localized
labels only. Account and watchlist membership mutations now handle network
failures by restoring optimistic state and exposing an announced error.

Focused research unit tests pass 12/12, and the named-watchlist Chromium flow
passes 1/1 with serious/critical axe checks. This does not close the broader
release work: multi-viewport/RTL visual evidence, the full Research browser
file, provider UAT, the competitor observation-source seam, ranking, entitled
AI insight, and independent review remain open.

## 2026-10-02 — Named research watchlists, M1 source-only slice

The first implementation slice from the Meedro integration plan is now in the
worktree. Migration `0067_aberrant_bishop` adds workspace-scoped named
watchlists and account membership without changing the existing source-only
account registry. The Research route adds bilingual list creation and
role-gated account assignment using accessible Radix checkboxes. New routes
cover list read/create and membership add/remove; no provider calls, scraping,
media copying, publishing, or new AI usage path was introduced.

Focused research unit tests pass 8/8, focused integration tests pass 2/2,
typecheck and lint pass, the migration journal parses, and the migration drill
passes 5/5 including skipped-migration repair and backup/restore. The full
verification pass passes 456 unit files / 4311 tests and the production build.
The focused Chromium flow passes 1/1 with serious/critical axe checks. The
broader Research browser file still has a stale pre-existing expectation for a
removed planning "Brief" tab; multi-viewport/RTL visual evidence and
independent review remain open. Independent verification is not claimed.

## 2026-09-30 — Meedro-informed theme foundation

The shared agent contract now documents the Meedro-informed shell ownership:
the sidebar owns workspace location and job groups, the top bar owns global
utilities, and the workspace root leads with the social Command Center before
planning execution KPIs. The overview order and contract pass formatting,
typecheck, and the focused Command Center/navigation/research suite (21/21).

The first slice of the Command Center/theme refactor is implemented: Account-
owned System/Light/Dark preference, server-resolved root theme, semantic dark
tokens, bilingual copy, and migration `0057_eminent_stryfe`. The migration drill
passes 5/5 and `pnpm verify` passes with 4,292 unit tests and a production build.
Theme browser/a11y/visual evidence and full Command Center completion remain
open. The authenticated Account theme journey now passes 1/1 in Chromium for
Light, Dark, and System persistence, and the dark Account route passes its axe
check 1/1. The Command Center implementation has now started on the existing
workspace root with an explicit 30/90-day social signal layer, accessible trend/table
fallback, strongest-account view, normalized channel comparison, connected
account health badges, freshness context, and planning handoff. Focused
Chromium route checks pass 3/3, including the narrow Arabic/RTL check. The
staged plan is
[`MEEDRO_REFACTOR_PLAN.md`](MEEDRO_REFACTOR_PLAN.md).

The no-data Command Center state now uses a short staged setup checklist:
connect a social account, collect the first metric snapshot, and review
analytics before planning the next move. It reuses existing Channels and
Analytics routes, stays honest about missing data, and renders cleanly across
the responsive overview baselines. The refreshed overview captures pass 3/3
at 360px, 768px, and 1440px; exact Stitch references pass 2/2; and the
connected Command Center axe matrix passes 10/10 across configured browsers.
Provider media teardown, wider bilingual/role evidence, and independent review
remain open.

The saved teardown loop now reaches planning: `Create draft` opens Quick Create
with an editable research-derived title and brief, and the created item keeps a
workspace-scoped provenance link to the saved teardown. The result is not
silently copied into structured `formatPayload`. Migration drill passes 5/5,
the schema integration slice passes 28/28, focused unit/catalog checks pass
65/65, and the all-browser create/apply journey passes 10/10. From the linked
draft's Brief tab, planners can explicitly apply only blank format-compatible
fields; existing planner copy is preserved.

The latest UI slice adds a Meedro-inspired Command Center section rail with
keyboard-accessible anchors for health, growth, channel performance, and the
planning handoff, plus a visible freshness line. The focused Command Center
unit test passes 3/3 and the touched files pass ESLint. The isolated browser
runner was attempted against `planner_test` but stalled before starting its
server, so it is not claimed as release evidence.

The trend visualization now adds a restrained area fill and data-point markers
while keeping the accessible table as the exact-value fallback. Focused
Command Center tests pass 10/10, and the touched component passes formatting,
ESLint, and strict typecheck. Responsive, role, visual, and production evidence
remain open.

The research-to-brief handoff now carries the latest linked post's normalized
account, format, duration, and available performance evidence into the existing
Improve brief request. The AI surface identifies that context to the planner,
and the prompt explicitly requires an original angle without source-copying or
unverified claims. The existing human preview/apply flow is unchanged; focused
AI and catalog tests pass 36/36.

The full local `pnpm verify` baseline is green after this slice: formatting,
lint, strict typecheck, 449 unit files / 4,298 tests, and the production build.
This is clean local evidence only; browser matrix, controlled provider UAT, and
independent production verification remain open.

The focused disposable Chromium matrix now passes 15/15 for the theme and
Command Center journeys. It covers Light/Dark/System persistence, empty and
connected overview states, the keyboard section rail, Arabic/RTL at 375px,
analytics comparison/filtering, workspace switching, client-reviewer denial,
and agency-admin access. This is `Tested` evidence for those journeys only;
the complete five-width visual/a11y matrix, provider UAT, and independent
review remain open.

The connected metric-backed Command Center now also passes the serious/critical
axe scan in both light and dark themes (2/2). That scan found and fixed a
shared-token contrast regression in legacy filled primary controls; future
filled controls must use the semantic primary foreground rather than hard-coded
white text.

The focused exact-reference pass now covers the complete canonical Stitch set
(20/20), including the planning list, planning content detail, workspace
settings, agency AI, Media, Account, Board, and Publish references. The settings
scan found and fixed a serious contrast issue in the active settings-sidebar
description by using the semantic primary token. The Media scan also found an
invalid `role="note"` inside the folder tree and now passes after that role was
removed. The full responsive visual matrix is still open and has not been
called green.

The next shell-focused responsive pass passes Account 3/3, Social Analytics
3/3, Trend Radar 3/3, and Channels 3/3 (12/12). The Account mobile axe scan
found a horizontally scrollable MCP endpoint without keyboard access; the
endpoint is now focusable and the full Account responsive set passes. The
broader responsive matrix, bilingual/role coverage, provider UAT, and
independent review remain open.

The research teardown contract is now represented by a versioned, pure parser:
it accepts only provider media, planner-owned asset, or planner-entered notes
as source evidence and requires structured hook/promise/format/beats/pacing/
CTA/evidence/uncertainty output. A notes/transcript-only preview is now
available to workspace managers and planners behind the existing
`brief_improvement` entitlement and budget gate. Generation remains
preview-only; a separate role-gated save route persists only the validated
structured result, never raw notes or provider bodies, in migration
`0064_plain_crusher_hogan`. Focused parser/catalog tests pass 13/13, the
all-browser blank-input journey passes 5/5, the migration drill passes 5/5,
and Research responsive comparison passes 3/3. Provider media, owned-asset
ingestion, and full bilingual/RTL/theme/axe evidence remain open.

The Research shelf is now included in the responsive visual harness with
captures at 360px, 768px, and 1440px (3/3). The captured states show the
job-grouped shell, source-only watchlist, notes-only teardown preview, and
honest empty saved-research state. The two previously stale Stitch mobile
references for workspace overview and planning were refreshed from the current
Command Center/empty-seeded-data contract and pass 2/2. The remaining broader
responsive matrix is still open.

The current working tree passes the full `pnpm verify` baseline after this
addition: formatting, lint, strict typecheck, 450 unit files / 4,302 tests,
and the production build. This is local `Tested` evidence only.

The workspace overview responsive matrix now passes 3/3 at 360px, 768px, and
1440px after the dense header actions were moved below the title until the
large breakpoint. The reviewed visual baselines now include the Command Center
empty state. Account theme persistence and the connected Command Center
serious/critical axe checks pass 3/3 in the same isolated run; this does not
close the remaining full route/width matrix or independent-review gates.

The canonical Stitch workspace-overview reference also passes 1/1 with the
Command Center included. A complete visual-suite attempt exposed stale exact
references on planning, content detail, settings, and agency AI surfaces; those
baselines were left untouched because they belong to separate existing changes.

A fresh authenticated read-only production check found no active agency or
workspace at `/app`, and the earlier `dr-reem-reda` URL still reports
`Workspace unavailable`. Meta controlled UAT therefore remains correctly gated
on selecting or provisioning an active LaraTik tenant before connecting an
owned test profile.

The authenticated Meedro reference session was re-checked across the remaining
top-level sections: Viral Finder, Viral Library, Content Ideas+, Viral Vault,
My Projects, Viral Scripts, MCP Connection, Workflows, and B-Roll Assets. The
feature audit records the observed empty/loading/locked states and the staged
LaraTik crosswalk. This is product-reference evidence only; no Meedro action
that generates, downloads, upgrades, connects, or persists data was performed.

The Command Center best-time section now includes a semantic weekday/hour
heatmap derived from the same timezone-aware observations as the recommendation.
Each populated cell exposes average views and sample size, and reliable cells
retain the three-observation threshold. Focused Command Center tests pass 10/10
with formatting and strict typecheck green.

The Meta setup slice now extends the existing agency-admin analytics probe
with read-only Instagram post-level capability checks. It tests one recent
owned media item and classifies `views`, `reach`, `saved`, `shares`, and
`total_interactions` without persisting raw provider data or changing OAuth
scopes. The provider now also collects up to 10 Facebook Page feed pointers
with aggregate engagement counts when the existing read-only scope permits
them; post-level reach/views and controlled production evidence remain open.

The first durable post-observation slice is now implemented: migrations
`0058_workable_prodigy` and `0059_wet_boomer` add provider-neutral observations
and provenance links; the normal
Meta snapshot stores available read-only views, reach, saves, shares, and
total-interactions plus likes/comments and provider-supplied video duration for
at most 10 recent Instagram media objects; unsupported metrics remain nullable;
and the Command Center renders top-content/outlier, best-time, and duration-band
cards with nullable-metric and sample-size context, and top posts can create a
provenance-linked Quick Create draft. Focused typecheck and
provider/Command Center tests pass. The migration drill passes 5/5; full
verification passes with 447 unit files / 4,292 tests plus production build;
the content detail page keeps the reference visible for review, and the full
integration suite is green. Browser evidence, historical pagination,
Facebook post-level insights, and independent review remain open.

The first disposable authenticated browser render also verified the intended
shell order: grouped workspace navigation, Command Center before planning KPIs,
an explicit empty connected-account state with an Open channels handoff, and
Account-owned Light/Dark persistence. This is local evidence only and does not
close the bilingual, responsive, role, axe, visual, or production-session
gates.

The Command Center now also exposes a manager-only Refresh data action. It
reuses the existing sequential `runChannelTest` pipeline for connected
channels, refreshes the overview/analytics/channels routes, and reports full or
partial completion without exposing provider error details or a second sync
implementation. Focused refresh, Command Center, and catalog tests pass 17/17.

Command Center planning signals now require a minimum sample of three posts per
timing slot or duration band. Smaller groups remain useful as visible context,
but no longer receive a recommendation label; this prevents the planner from
turning one or two posts into a false scheduling rule. The focused social
calculation, provider, and catalog checks pass 20/20. The repository-wide
`pnpm verify` gate now passes 448 unit files / 4,296 tests and the production
build after stabilizing the per-agency Meta callback test's module loading.

The Meta capability probe now also tests one Facebook Page post with the
Graph API v25 replacement metrics `post_media_view` and
`post_total_media_view_unique` using the required lifetime period. The result
is rendered in the existing agency-admin probe card with the same explicit
available/unsupported/no-data/error states. This is still a capability check:
normal Facebook observations remain engagement-only until a controlled Page
UAT proves the connected token and metric semantics.

The Facebook feed slice stores only permalink, type, timestamp, and aggregate
engagement counts; post bodies are discarded. Engagement-only observations can
still appear in Command Center rankings when views are unavailable. Focused
Meta/provider and Command Center tests pass 62/62; controlled Page UAT is still
required before claiming complete Facebook coverage.

Migration `0060_parallel_wallop` adds the first saved-research shelf. A planner
can bookmark a Command Center observation, open `/research` from the Understand
navigation group, and create a brief from the saved evidence. The bookmark
stores only workspace-scoped provenance; competitor watchlists, named
collections, and structured teardowns remain open. Migrations `0061_blue_hammerhead`
and `0062_zippy_karma` now add a role-gated source-only watchlist registry at
the same Research surface. It stores platform, normalized handle, profile URL,
optional display name, and explicit provider status; it does not scrape or
approximate competitor metrics. Focused watchlist, bookmark, and catalog tests
pass 13/13. Creating a disposable workspace exposed schema drift in the usage
threshold deduplication index, so `0063_repair_usage_threshold_dedupe` adds an
idempotent compatibility repair. The five-part migration drill now passes with
103 from-zero tables and 64/64 migration entries.

The shared workspace shell now implements the Meedro-informed job hierarchy:
`Plan` (planning, reviews, design queue), `Understand` (Trend Radar,
analytics, channels), `Produce` (library, media, brand kit), and `Manage`.
This preserves existing routes, permissions, and deep links; the focused
navigation/sidebar suite passes 65/65, with typecheck and formatting green.

The agency Meta provider screen now adds a bilingual readiness path for the
Command Center: app configuration, credential test, connected Meta profiles,
and the explicit read-only analytics probe. It reuses existing provider rows
and connected-profile data, and does not claim probe success until the operator
runs it. Catalog parity passes 9/9 and typecheck is green; responsive,
role-based, visual, and controlled provider UAT evidence remain open.

The next isolated Chromium evidence attempt found an environment collision,
not an application failure: a native PostgreSQL server and Docker both owned
loopback port 5432, and a stale Next dev process owned the default E2E port.
The runbook now requires verifying the host database endpoint and choosing a
free port before trusting migration or browser results. No release evidence was
upgraded from this attempt.

The isolated runner now allocates a free local port when `PORT` is omitted;
explicit `PORT` and `PLAYWRIGHT_BASE_URL` overrides remain available. The
change passes typecheck, ESLint, formatting, and `git diff --check`. The
current Meta Developer account was inspected read-only: the live Social Tracker
app belongs to Just Halal, while LaraTik has two in-development Ads Manager
apps, and both LaraTik candidates show no Login for Business configuration. No
app settings or permissions were changed; production UAT still needs the owner
to select the LaraTik GmbH-associated candidate and run the staged provider
configuration/probe path.

The Command Center section rail now reuses the shared scroll-spy hook: the
active health, trend, performance, content, recommendation, or planning anchor
is highlighted while scrolling and announced with `aria-current=location`.
The focused section-nav test passes 1/1; touched-file ESLint, typecheck, and
diff checks are green.

The agency provider setup card now includes localized direct links to the Meta
or TikTok developer console beside the callback registration instructions.
This is navigation only; it does not create an app, request permissions, or
transmit credentials.

The read-only Meta findings are now consolidated in
[`../operations/META_COMMAND_CENTER_SETUP.md`](../operations/META_COMMAND_CENTER_SETUP.md):
it names the inspected candidate apps, locks the five-scope read-only set,
defines the agency callback and evidence checklist, and gives explicit stop
gates for the controlled OAuth/probe/sync UAT.

## 2026-09-06 — Database-configured, agency-scoped R2 storage

Status: **Implemented; automated verification is green; production rollout and
independent verification are not claimed.**

Managed R2 configuration now lives in PostgreSQL, with credentials encrypted by
the existing persistent KEK. Agencies receive generated prefixes, quota-backed
upload intents, direct signed uploads, private signed previews, tenant checks,
cleanup, health reporting, and an additive local-volume migration path. The
platform owner and agency-admin surfaces are bilingual. See
[`../decisions/0010-r2-agency-storage.md`](../decisions/0010-r2-agency-storage.md)
and [`../operations/r2-storage.md`](../operations/r2-storage.md).

Evidence on the feature worktree: `pnpm verify` (340 files / 3,222 tests,
build included) and `pnpm migration-drill` (5/5). Real R2 credential UAT,
production media migration, restore proof including the encryption key,
browser E2E/a11y/visual evidence, and the deferred large-media processing
features remain deployment tasks.

## 2026-08-26 — Landing entry and sign-in refinement

Status: **Implemented and focused suites Tested; independent verification is
not claimed.**

Authenticated visitors now enter `/app` directly from `/`. Public visitors see
one contextual CTA: sign in on configured deployments, or identity-verified
first-time setup when no agency exists. The sign-in page is password-first for
returning users, keeps Google secondary, and replaces the password form with a
magic-link form only when requested. Setup offers only Google or magic link.

Implementation commit `caa349f` includes behavioral, accessibility, and real
unauthenticated visual coverage. The focused sign-in matrix passes 4/4 across
the canonical Stitch viewport plus mobile-s, tablet, and wide. The complete
unit suite passes 2,110 tests and the production build passes. Full pre-merge
browser gates were attempted on disposable databases but remain non-green due
to existing social-analytics/agency-switcher failures and a parallel visual
seed race outside this change; exact evidence is in
[`../production-readiness/TEST_EVIDENCE.md`](../production-readiness/TEST_EVIDENCE.md).

## 2026-08-25 — Platform role permissions and render-error hardening

Status: **Implemented and focused suites Tested; independent verification is
not claimed.**

The former binary Platform Admin assignment is now a closed four-role model:
Platform Owner, Agency Operator, Platform Auditor, and Support Operator. Exact
permissions are enforced in the service/DAL, existing assignments migrate to
Owner, role changes audit atomically, and concurrent changes cannot remove the
final Owner. Normal restore no longer acts as an unarchive path.

The new `/app/platform/access` surface provides Owner-only assignment
management and Auditor read-only oversight. Agency detail controls are
role-aware; archive/unarchive is Owner-only, while support requests remain
ticketed and agency-admin approved. Eleven selected Chromium journeys pass,
including explicit role behavior and six responsive viewports.

Browser testing also found and fixed two generic-render-error causes: a
non-function export from a `"use server"` action module and a server/browser
timezone-list hydration mismatch. The platform agency table now uses a stable
relative-time reference during hydration. These fixes prevent authenticated
agency/platform pages from falling into the reference-only error surface.

Decision: `docs/decisions/0005-platform-role-permissions.md`. Operations:
`docs/agency-setup.md`. Release evidence is recorded in the production-readiness
bundle after the full verification and migration drill.

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

| Task | Focus                                                      | Key commits                                           | Evidence                                                                                                                           |
| ---- | ---------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Stitch contract locked                                     | `c2bfac5`                                             | `tests/e2e/stitch-cases.ts`, `tests/unit/stitch-cases.test.ts`, `docs/production-readiness/SCREEN_PARITY.md`                       |
| 2    | Brand Kit section nav + 4 stitched cards                   | `b07654f`, `72f0fed`                                  | `/app/w/[slug]/brand-kit` page; `docs/design/SETTINGS_UI_LEARNINGS.md`                                                             |
| 3    | Brand Kit R1 (CRUD command + Pillars + Color/Voice)        | `439a52d`, `ab47b3a`, `dc8c951`                       | 75/75 tests pass                                                                                                                   |
| 4    | Brand Kit R2 (Logo + Typography + storage)                 | `03c9db9`, `d075841`, `6d7e48d`                       | Local-volume storage + signed URL                                                                                                  |
| 5    | Brand Kit R3 (Bento + Stitch top tabs)                     | `b66d7ba`                                             | `/app/w/[slug]/brand-kit` aligned to `16aaf0a9` capture                                                                            |
| 6    | Brand Kit R4 (publishing + linked resources) + admin E2E   | `cef5ca3`, `3dff494`, `94ed715`, `b84c945`, `6056b93` | `tests/e2e/administration.spec.ts`; 583/583 tests pass                                                                             |
| 7    | Visual regression harness + scoped baselines               | `a9fa300`, `3d40183`                                  | `tests/e2e/visual-regression.spec.ts`; 39 exact-reference + 73 scoped responsive assertions; deploy gated on critical visual tests |
| 8    | Accessibility + UAT + external services evidence contracts | `2025602`                                             | `ACCESSIBILITY_CHECKLIST.md`, `EXTERNAL_SERVICES_UAT.md`, `UAT_RELEASE.md`                                                         |
| 9    | Coverage thresholds restored to production targets         | `fd4a6e0`, `298edee`                                  | 861/861 unit tests pass; per-glob floors at 95/90/95/95 critical + 85/80/85/85 services + 87/85/100/87 validation                  |
| 10   | Settings-wide polish (4 pages)                             | `acda5ef`–`7f32060`                                   | Channels, team, workspace-settings, agency-settings aligned to their Stitch captures                                               |
| 11   | Documentation reconciliation (this commit)                 | (this change set)                                     | Status docs use the current 51/27/23/41/10/73 visual definitions and the shared release verdict                                    |

Definitions (used consistently across every doc above):

- **51 captured Stitch references** under `designs/stitch/` (PNG + HTML each, 102 files + `DESIGN.md`).
- **27 canonical route/surface rows** including `/signin/forgot-password`.
- **23 unique route surfaces** deduped from the 27 canonical cases (the responsive matrix iterates over these).
- **41 active references** (27 canonical + 11 responsive + 3 supporting) at the Stitch capture viewport; 39 are route-backed exact-reference comparisons and two are shared-state evidence groups.
- **10 historical/superseded exclusions** (3 historical + 7 superseded) with successors.
- **73 responsive baselines** under the current scoped harness: 19 non-planning surfaces × 3 viewports (360, 768, 1440) plus four planning surfaces × 4 viewports (375, 768, 1024, 1440).

`Implemented` means code exists; `Tested` requires committed automated/manual
evidence; `Verified` requires independent reviewer sign-off.

## 2026-09-01 — Localization foundation + Arabic UI preparation (Phase 1)

Status: **Implemented and the focused i18n suite Tested; independent
verification is not claimed.**

This is the localization foundation tracked by
`docs/i18n/CONTRACT.md` and the page-by-page audit. The product
as a whole does **not** claim Arabic support on production
surfaces yet. Independent review found open P0/P1 work recorded
in `docs/implementation/ui-ux-arabic-critical-todo.md`.
The foundation includes:

- `laratik_locale` HttpOnly / SameSite=Lax / Secure-in-prod
  cookie (365-day lifetime), mutated only by server actions.
- `resolveActiveLocale()` server resolver with the locked
  precedence from ADR 0009: authenticated `users.locale` →
  public `laratik_locale` cookie → English fallback. The
  agency locale is **not** in the interface chain; it is the
  _content_ default, exposed through the separate
  `resolveContentLocale()` helper so an Arabic agency
  writing Arabic content can serve a planner whose UI is
  English.
- Noto Sans Arabic loaded via `next/font/google` weights
  400 / 500 / 600 / 700; the body element switches to the
  face automatically when `<html dir="rtl">`.
- Profile form (`/app/account`) locale `<select>` widened
  from `["en"]` to the central `SUPPORTED_LOCALES` set;
  the intended save sequence is database write first, then
  cookie synchronization, revalidation, and client refresh.
- A compact `<PublicLocaleSwitcher>` for signed-out public and
  authentication surfaces, with a server action that validates
  the locale and a same-origin relative return path before
  writing the cookie. Its current root-layout mounting is an
  open P1 and must not be copied.
- `src/messages/{en,ar}/common.json` — `Common` +
  `Navigation` + `languageSwitcher` namespace pair.
  Missing-key parity is locked by `tests/unit/i18n/catalogs.test.ts`.
- `src/lib/i18n/format-locale.ts` — locale-aware number,
  percent, currency, date, time, relative-time, and list
  formatters, all with `numberingSystem: "latn"` so Arabic
  renders Western `0–9` digits per the locked decision.
- ADR-0009 (locale policy) and the page-by-page audit
  matrix (`docs/design/UI_UX_REFINEMENT_2026-09-01.md`)
  scaffolded for the remaining 64 surfaces.

Evidence: `pnpm typecheck` clean; `pnpm lint` clean;
`pnpm format:check` clean; `pnpm test:unit` 2950/2950 pass
(53 new i18n tests, 2897 pre-existing — zero regressions).
This historical unit/build evidence is not a release verdict.
Migration, authenticated browser, accessibility, and visual
evidence remain required at the exact clean release-candidate
HEAD; follow the critical TODO before requesting verification.

## Next planned arc — Command Center and theme refactor

The Meedro-informed refactor plan is tracked in
[`MEEDRO_REFACTOR_PLAN.md`](MEEDRO_REFACTOR_PLAN.md). The recommended sequence
is design contract → theme foundation → Command Center v1 → controlled Meta
validation → research enrichment. This entry is intentionally not a completion
claim; implementation starts only after the open theme/scope decisions are
locked and the required production-readiness evidence is defined.
