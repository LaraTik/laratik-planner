# StudioFlow Production-Readiness Tracker

> **2026-10-21 Architecture review verification checkpoint — implementation SHA `98c7040ca1327000283d2b6eeba8aaa379ca8d6a`** — `pnpm verify`, the full disposable-Postgres integration suite, and all five migration-drill scenarios passed. The pass includes the new authenticated, scheduled deadline-reminder path and its transaction, concurrency, deduplication, state-filter, and route-auth regressions. The preceding browser checkpoint on SHA `2bf9854f9f94c0c5ed30ae332280dfe00c638e75` remains partial: Chromium completed 278 cases with 6 timeouts; four focused reruns passed; Firefox could not launch under macOS permissions; visuals passed 208/264, with 56 comparisons requiring reconciliation. Production cron installation on the VPS, manual review of all routes, and independent verification remain open; do not mark this work **Verified** or treat the release matrix as green. Full details are in `docs/production-readiness/TEST_EVIDENCE.md`.

> **2026-10-20 Community & Inbox safety-control checkpoint** — The workspace
> emergency stop now has an audited, manager-only action on Automations and
> Settings. Its confirmation flow changes only the existing pause flag; reply
> capability checks and the default-off auto-send gate remain in force. The
> focused server-action integration tests passed (5/5), the manager stop/resume
> flow passed in Chromium, and the focused Community integration tests passed
> (5/5). `pnpm verify` passed (545 unit files / 4,892 tests and production
> build). A full 13-route EN/AR five-viewport sweep passed before the final
> copy and manager-fixture adjustment; the latest manager-role rerun passed
> all five interaction tests but the local app server refused a connection
> during the 3.4-minute route sweep, so that rerun is incomplete. Repeat
> affected gates at the exact clean commit and retain the full evidence bundle
> and external Meta UAT before calling the feature **Verified**.

> **2026-10-19 Community & Inbox interaction correction checkpoint** — Inbox
> conversation cards now select a URL-backed thread; Post comments lists the
> synced public conversations and opens the same thread; Team & routing can
> assign a conversation to an active workspace member through the existing
> server-side permission gate and writes an audit event. Priority and send
> attempt summaries now reflect stored counts, Activity renders stored events,
> and Analytics no longer presents sample bars as live measurements. The
> Planner MCP remains read-only with respect to Community & Inbox, documented
> in the API contract. `pnpm verify` and the full disposable-database
> `pnpm test:integration` suite passed in this worktree; focused assignment,
> catalog, and API-boundary unit checks also passed. The focused Community
> Playwright suite now passes inbox selection, comments deep-linking, audited
> Team assignment, and all 13 routes at 1440/1280/1024/768/375px in both
> locales with no serious axe violations or horizontal overflow. This remains
> **Implemented**, not **Tested/Verified**: current Stitch visual baselines,
> exact clean-commit evidence, and external Meta UAT are still outstanding.

> **2026-10-19 Advertising Reporting P3 completion checkpoint** — Reporting
> exports now include a server-generated XLSX alongside CSV, with the selected
> filters, metric definitions, data-health notes, attribution semantics, and
> local taxonomy labels preserved in the export. Authenticated tenant-scoped
> share links resolve only for signed-in workspace members with reporting
> access. Workspace-owned local labels support brand, platform, objective,
> topic, language, and month classification without changing Meta objects; the
> Creatives section provides the first accessible label editor. Migration 0089
> adds the tag and share persistence with replay-safe DDL. This remains
> **Implemented**, not **Tested/Verified**, until the exact clean commit has
> migration, bilingual browser, accessibility, visual, and release evidence.

> **2026-10-19 Advertising Action Center persistence checkpoint** — Action
> Center decisions are now durable per authenticated workspace member, ad
> account, signal, entity, and reporting period. Review, dismiss-with-reason,
> seven-day snooze, and reopen transitions are validated server-side through
> the tenant-scoped reporting boundary; each write emits a sanitized security
> audit event. The additive migration is registered as `0088_secret_thing` and
> the English/Arabic browser contract now verifies the review interaction.
> This remains **Implemented**, not **Tested/Verified**, until the exact clean
> commit has complete migration, browser, accessibility, visual, and release
> evidence.

> **2026-10-19 Advertising decision-rail refinement checkpoint** — The
> overview now places the evidence-backed Action Center beside the primary
> performance trend at wide desktop widths, with the objective mix remaining
> in the main reading column and responsive stacking below the desktop
> breakpoint. Metric dictionary surfaces now resolve metric names through the
> active EN/AR catalog instead of exposing raw keys or English-only labels.
> Focused type, browser, and five-viewport visual checks pass. This remains
> **Implemented**, not **Tested/Verified**, until the exact clean commit is
> covered by the full release evidence bundle.

> **2026-10-18 Advertising reporting safety checkpoint** — Objective-aware
> ingestion and every campaign/ad/report rollup now refuse to manufacture a
> heterogeneous result total: mixed result types remain unavailable while the
> original action evidence is preserved. Provider creative reads are bounded to
> fields Meta actually returns and sanitized presentation metadata is retained
> without fabricated previews. A typed `DataHealthSummary` now flows from the
> persisted sync state through the authenticated report API and dashboard,
> distinguishing complete, partial, delayed, and unavailable coverage. Focused
> unit, route, and strict type checks pass. This remains **Implemented**, not
> **Tested/Verified**, until the full disposable-database, bilingual browser,
> accessibility, visual, export, and production evidence gates are captured.

> **2026-10-19 Advertising explorer refinement checkpoint** — The dedicated
> Creatives section now uses provider-returned HTTPS preview metadata, explicit
> unavailable-preview states, fatigue evidence, and an accessible details
> drawer. The Targeting section now renders normalized age, gender, location,
> language, placement, audience, exclusion, and unknown-provider chips while
> retaining raw targeting JSON behind disclosure. Focused view/normalization
> tests and type/lint checks pass. This remains **Implemented**, not
> **Tested/Verified**, until the bilingual browser, axe, visual, export, and
> production evidence gates are captured at the exact clean commit.

> **2026-10-19 Audience intelligence refinement checkpoint** — The dedicated
> Audience section now provides Age, Gender, Country, and Placement views with
> selectable compatible ranking metrics, top-five progressive disclosure,
> spend share, responsive table fallback, and explicit Meta privacy and
> attribution limitations. It continues to use only authorized provider rows;
> unsupported Results/Cost per Result are not fabricated. Focused type, lint,
> catalog, and advertising unit checks pass. This remains **Implemented**, not
> **Tested/Verified**, pending the bilingual browser, axe, visual, and export
> evidence gates at the exact clean commit.

> **2026-10-19 Export context refinement checkpoint** — Authenticated CSV
> exports now include a metadata preamble for the authorized account, date
> range, timezone, currency, selected filters/comparison/trend state, metric
> definitions, attribution semantics, and data-health state. Boundary and
> route tests pass. This remains **Implemented**, not **Tested/Verified**, until
> export scope, bilingual browser, visual, and production evidence are captured
> at the exact clean commit.

> **2026-10-19 Action Center evidence refinement checkpoint** — Overview
> signals now prioritize underperforming campaigns and retain peer CTR/CPC
> baselines in the typed insight model. Each action exposes an accessible
> evidence disclosure with period, sample size, baseline, and sample-guard
> confidence in EN/AR. Focused intelligence, catalog, lint, and type checks
> pass. This remains **Implemented**, not **Tested/Verified**, until the
> bilingual browser, axe, visual, and production evidence gates are captured.

> **2026-10-19 Advertising explorer controls checkpoint** — Campaign sorting
> and visible metric columns are now backed by the typed URL view configuration,
> retained through filter submits, section navigation, exports, reloads, and
> saved-view restoration. The column picker uses the shared accessible Checkbox
> primitive and prevents an empty metric table. Focused hierarchy/configuration,
> catalog, lint, and type checks pass. This remains **Implemented**, not
> **Tested/Verified**, until bilingual browser, axe, visual, export, and
> production evidence are captured at the exact clean commit.

> **2026-10-19 Advertising Reporting visual baseline checkpoint** — The
> populated canonical advertising route is now in the app-only visual inventory
> with five responsive baselines at 375, 768, 1024, 1280, and 1440px. The
> strict Chromium slice passes 5/5, including the expanded desktop Advertising
> sidebar branch and the mobile section navigation. Sync timestamps are marked
> as dynamic data for stable captures. This is **Tested** visual evidence, not
> **Verified** release evidence; the supplied reference image still requires
> independent visual review and the broader advertising release gates remain.

> **2026-10-18 Advertising saved-view checkpoint** — The reporting header now
> persists a typed, versioned advertising view configuration through the
> authenticated `/api/advertising/saved-views` route. It reuses the existing
> workspace-scoped `saved_filter` persistence model, enforces active-agency and
> workspace membership on reads/writes, supports private/workspace sharing, and
> restores URL-driven filters and chart settings. Serialization and malformed
> configuration guards are covered by
> `tests/unit/advertising-reporting-view-config.test.ts`. This remains
> **Implemented**, not **Tested/Verified**, until the bilingual responsive
> visual and authorization evidence is captured at the exact clean commit.

> **2026-10-18 Advertising trend refinement checkpoint** — The executive
> trend chart now keeps metric pair, day/week/month granularity, and comparison
> period state in the URL. Complete comparable periods render a dashed
> comparison trace; incomplete result observations remain unavailable. The
> shared date-only bucketing helper is unit-tested in
> `tests/unit/advertising-reporting-trend.test.ts`, and the English/Arabic
> advertising browser contract covers URL-driven controls. This remains
> **Implemented**, not **Tested/Verified** for the full release visual matrix.

> **2026-10-18 Advertising Reporting 2.0 implementation checkpoint** — The
> workspace advertising route now has an objective-aware executive dashboard,
> typed metric definitions and availability states, safe comparison periods,
> data-health treatment, accessible trend/table fallback, objective mix,
> evidence-backed action cards, campaign explorer, and bilingual EN/AR copy.
> Focused unit coverage passes for aggregation, non-summed reach, unavailable
> actions, comparison boundaries, and lower-cost favorable direction. This is
> **Implemented**, not **Tested/Verified** for release: full integration,
> bilingual browser/a11y, visual baselines, export metadata, and production
> evidence remain required.

> **2026-10-18 Advertising Reporting 2.0 refinement checkpoint** — The
> reporting surface now uses URL-driven Overview, Campaigns, Creatives,
> Audience, and Targeting sections so detailed explorers do not render as one
> long page. The refinement adds the shared reporting section navigation and
> KPI card foundations, border-first Stitch-aligned light treatment, localized
> data-health timestamps, explicit partial/complete state text, accessible KPI
> delta semantics, missing-data chart gaps, objective spend donut, and a
> parity/future-alignment guide at
> `docs/visual-parity/ADVERTISING_REPORTING_UI_FOUNDATION.md`. Focused
> reporting tests and lint pass. This remains **Implemented**, not
> **Tested/Verified** for the full bilingual responsive visual gate.

> **2026-10-14 Graph-version migration checkpoint** — Exact clean local
> implementation commit `3a518784a4e977ddf54f08d9f03c314f01bc0c9e` adds the
> agency-admin path for migrating an existing explicit Meta Graph API pin to
> `v26.0`. The update preserves the encrypted credential, marks the connection
> invalid until fresh validation, pauses its account sync rows, clears worker
> leases, and records an audit event. Local verification passes formatting,
> lint, strict typecheck, production build, 508 unit files / 4,721 tests, the
> complete disposable-Postgres integration runner, focused advertising
> lifecycle 6/6 and tenant-guard 17/17, and migration drill 5/5 with 86/86
> ledger rows. The implementation was deployed as evidence commit
> `a458fa1c546f15c44bb63fb504bc5455ad0a3ecd`; controlled v26 read-only UAT
> passed identity, Page, campaign, ad-set, ad, and account discovery, with
> creative-field and Instagram-asset limitations recorded as partial results.
> Sync remains disabled. This remains **Tested**, not **Verified**: offsite
> recovery must pass and an independent reviewer must assign `Verified`.

> **2026-10-14 final local regression checkpoint** — Exact clean code commit
> `dd2135d13c613b1a4dc33fae00c9f5642a829746` passes `pnpm verify` with 507
> unit files / 4,718 tests and a production build. The canonical workspace
> a11y contract now passes content detail 5/5, publishing tab 5/5, and the
> Arabic RTL shell 5/5 across Chromium, Firefox, WebKit, mobile Chrome, and
> mobile Safari. The `/app/workspaces` admin query now includes its required
> agency join. Earlier evidence also records full integration, migration drill
> 5/5 with 85/85 ledger rows, and the advertising browser gate 30/30: 15/15
> functional plus 15/15 accessibility. No live
> Meta credential, provider mutation, push, or deployment was performed. This
> remains **Tested**, not **Verified**: live Meta UAT, offsite backup/restore,
> and independent review remain open; production flags stay disabled.

> **2026-10-14 advertising release-contract checkpoint** — The exact release
> candidate now distinguishes trusted worker ingestion from tenant disclosure:
> cron authorization and account-scoped claims govern canonical Meta ingestion;
> agency/workspace grants and financial authority govern reports, exports, and
> AI projections. Connection and account revocation now clear active lease
> metadata, and focused integration evidence passes lifecycle 3/3 and tenant
> guards 16/16. The operator handoff remains **NO-GO** pending live read-only
> Meta UAT, encrypted offsite recovery with observed RPO/RTO, and independent
> `Verified` review.

> **2026-10-13 multi-tenant advertising hardening checkpoint** — Exact
> implementation commit `8695adf92e611e5a7f03494157df3e90b5a02027` adds global
> provider-account identities, explicit platform-to-agency access grants,
> canonical spend facts, separate financial/post/completeness states, complete
> resumable production pagination, cursor persistence, approved-host URL
> validation, and inventory/audience pagination without the diagnostic page
> cap. The focused provider suite passes 14/14, the tenant-guard integration
> suite passes 14/14, the migration drill passes 5/5 with 85/85 ledger rows,
> strict typecheck, formatting, lint, and the production build pass. No live
> Meta credential was used, and no push or deployment was performed. This
> remains **Tested**, not **Verified**: controlled credentialed Meta UAT,
> external reconciliation, offsite backup/restore evidence, and independent
> review remain open.

> **2026-10-13 complete Meta Ads reporting checkpoint** — Exact clean code
> commit `d9f59b824df89212c45a537a7845aa4d6a1d2a72` completes the local
> read-only reporting surfaces: admin reconciliation history; campaign, ad-set,
> and ad tables; configured targeting; provider-returned audience delivery;
> exact paid/organic promoted-post joins; additive combined views; and
> server-rendered pagination. The summary exposes active ads from provider
> status. The synthetic fixture proves two ads can point to one exact promoted
> post without duplicate post rows; integration coverage proves duplicate
> credentials do not duplicate canonical spend, unassigned spend stays outside
> workspace reports, and revocation closes dashboard/export access immediately.
> `pnpm verify` passes 507
> unit files / 4,716 tests and the production build; the complete integration
> runner passes; the migration drill passes 5/5 with 84/84 ledger rows; and the
> focused advertising browser matrix passes 15/15 across five browser projects
> in English/LTR and Arabic/RTL. No live Meta request, production deployment,
> or provider mutation was performed. This remains **Tested**, not **Verified**:
> controlled credentialed Meta UAT, real-account reconciliation, and independent
> review remain open.

> **2026-10-13 SaaS-hardening checkpoint** — Implementation commit
> `06b41d8f` adds migration 0083 for reach/results, explicit provider-object
> scopes, per-account revocation, account-wide audience authorization, complete
> supported-breakdown retries, configurable sync windows, grant-based spend
> attribution, and bilingual targeting/results reporting. Migration drill is
> 5/5 with 84/84 ledger rows; advertising lifecycle and tenant-guard integration
> tests pass 13/13; `pnpm verify` passes 507 unit files / 4,714 tests and the
> production build; the focused advertising E2E matrix passes 15/15 across five
> browser projects in English/LTR and Arabic/RTL. No live Meta request,
> production deployment, or provider mutation was performed. This remains
> **Tested**, not **Verified** pending controlled credentialed Meta UAT,
> real-account reconciliation, and independent review.

> **2026-10-13 Meta Ads integration foundation checkpoint** — Exact clean code
> commit `ca9da4c` completes the read-only advertising control-plane and
> reporting foundation. Global Admin can review and revoke workspace visibility
> grants and financial authority, inspect sanitized validation/sync history, and
> run bounded account discovery. Sync now persists idempotent, tenant-guarded
> campaign/ad-set/ad/creative snapshots, exact promoted-post IDs, and provider-
> returned audience dimensions without inferring unsupported metrics. Reporting
> exposes lifecycle fields, objectives, budgets, paid promoted posts, and
> audience delivery only after the existing account/grant authorization seam.
> The same milestone adds bilingual copy, keyboard-focusable mobile table
> regions, cross-agency isolation coverage, grant/authority revocation audit
> coverage, and the executable blocked-live Meta UAT checklist. Migration drill
> passes 5/5 with 83/83 ledger rows; full integration passes; full unit passes
> 507 files / 4,712 tests; formatting, lint, typecheck, and production build
> pass; the focused advertising browser matrix passes 15/15 across Chromium,
> Firefox, WebKit, mobile Chrome, and mobile Safari in English/LTR and Arabic/
> RTL. No live Meta request, production deployment, or external Meta mutation
> was performed. This remains **Tested**, not **Verified**: controlled
> credentialed read-only Meta UAT, real ad-level reconciliation, independent
> review, and production deployment remain open.

> **2026-10-13 persisted reporting-scope checkpoint** — Code commit
> `a38fabc` adds an integration regression through the real membership, grant,
> observation, account-list, and reporting-query paths. It proves one shared
> canonical account can be granted to two workspaces without duplicating
> provider spend, each workspace sees only its campaign-scoped rows, and
> revoking one grant immediately removes the account from both report and
> account-discovery results. At exact clean HEAD
> `a142256861803b2aa1df09c5e0143c2f4ecc1957`, the focused tenant-guard suite
> passes 7/7, the credential lifecycle suite passes 3/3, the migration drill
> passes 5/5, and `pnpm verify` passes formatting, lint, typecheck, 507 unit
> files / 4,711 tests, and the production build. No live Meta request,
> production deployment, or external Meta mutation was performed. This remains
> **Tested**, not **Verified**: controlled live Meta credentials/UAT, provider
> reconciliation, independent review, and production deployment remain open.

> **2026-10-13 persistent advertising account dedupe checkpoint** — Code commit
> `2a3ca19da275b9dadbb0788760efb79927761e52` adds an integration regression for
> one canonical Meta provider account linked from two active connections. The
> test proves discovery refreshes the canonical row, creates both connection
> links, and does not persist token-like metadata. The focused advertising
> lifecycle suite passes 3/3. The migration drill passes 5/5, and the exact
> verification gate passes formatting, lint, typecheck, 507 unit files / 4,711
> tests, and the production build. No live Meta request, production deployment,
> or external Meta mutation was performed. This remains **Tested**, not
> **Verified**: controlled live Meta credentials/UAT, provider reconciliation,
> independent review, and production deployment remain open.

> **2026-10-13 populated advertising reporting + privacy checkpoint** — Exact
> clean code commit `0d64693648c85cddece91415de2763efa4985095` adds a
> test-only synthetic canonical advertising fixture that exercises encrypted
> credential storage, active connection/account linkage, workspace-scoped
> `read_reports` visibility, sync freshness, and idempotent ad-day ingestion
> through the production services. The populated reporting browser contract
> passes 2/2 in Chromium for English/LTR and Arabic/RTL with serious/critical
> axe violations absent. The same commit also normalizes unknown and forbidden
> advertising report responses to the same 404 shape, preventing account
> existence probing. Exact-clean verification passes formatting, lint,
> typecheck, 507 unit files / 4,711 tests, and the production build; the
> credential lifecycle integration passes 2/2. The fixture is synthetic and
> test-only: no live Meta request, production deployment, or external Meta
> mutation was performed. This remains **Tested**, not **Verified**: controlled
> live Meta credentials/UAT, real ad-level reconciliation, independent review,
> and production deployment remain open.

> **2026-10-13 advertising credential lifecycle hardening checkpoint** — Exact
> clean code commit `6727445b` prevents activation after revocation and requires
> a stored credential version before a connection can become active. The new
> disposable-Postgres lifecycle suite proves credential rotation increments the
> version and revokes the prior envelope, resolution uses only the current
> active version, revocation pauses sync state and disables provider reads, and
> revoked connections cannot be reactivated or receive new credentials. The
> focused integration suite passes 2/2; the exact-clean full verification gate
> passes formatting, lint, typecheck, 507 unit files / 4,710 tests, and the
> production build. No migration, production deployment, or external Meta
> mutation was performed. This remains **Tested**, not **Verified**: live Meta
> credentials, controlled read-only UAT, real ad-level reconciliation,
> populated-data browser evidence, independent review, and production
> deployment remain open.

> **2026-10-13 scoped advertising reporting UI checkpoint** — Exact clean code
> commit `c479ba62` adds the first read-only workspace reporting surface at
> `/app/a/[agencySlug]/w/[slug]/analytics/advertising`, backed by the existing
> pre-aggregation authorization seam. It includes explicit authorized account
> discovery, date-range filtering, spend/impression/click totals, CTR/CPC/CPM,
> daily spend, campaign rollups, freshness/partial-data states, loading/empty/
> error states, desktop/mobile navigation, and EN/AR catalog copy. The full
> `pnpm verify` gate passes formatting, lint, typecheck, 507 unit files / 4,710
> tests, and production build; the exact-clean Chromium accessibility checks
> pass 2/2 for English/LTR and Arabic/RTL with no horizontal overflow. No
> migration, production deployment, or external Meta mutation was performed.
> This remains **Tested**, not **Verified**: live Meta credentials, controlled
> read-only UAT, real ad-level reconciliation, populated-data browser evidence,
> independent review, and production deployment remain open.

> **2026-10-13 Trend Radar durable-job fencing checkpoint** — Exact clean code
> commit `9be3a6bf` prevents an expired worker from renewing its lease, clears
> lease ownership on completion/requeue/dead-letter transitions, and adds
> recovery, fencing, and active-dedupe regression coverage. The focused job
> suite passes 7/7; the full Trend Radar sidecar passes 129/129; Ruff passes
> for the changed modules. This remains **Tested**, not **Verified**: live Meta
> UAT, real ad-level reconciliation, workspace reporting UI evidence,
> independent review, and production deployment remain open.

> **2026-10-13 advertising admin browser checkpoint** — Exact clean code
> commit `85b5e25` fixes the Graph API version input pattern so an explicit
> `v25.0` compatibility pin is accepted, adds a Chromium browser contract for creating a
> platform-owned Meta connection and storing a local fixture credential without
> rendering the token, and adds the advertising settings route to the
> authenticated axe matrix. The focused unit suite passes 4/4; the focused
> browser workflow passes 1/1; the focused advertising accessibility check
> passes 1/1. The isolated runner now supplies a deterministic test-only
> platform KEK so this credential-envelope path is exercised offline. This
> remains **Tested**, not **Verified**: controlled live Meta UAT, real ad-level
> reconciliation, workspace reporting UI evidence, independent review, and
> production deployment remain open.

> **2026-10-13 Trend Radar HMAC review checkpoint** — Exact clean code commit
> `9f4be71` extends the service-auth regression suite to cover maximum timestamp
> skew, signed method/path/body binding, previous-key acceptance during rotation,
> and trusted-service identity rejection. The full sidecar suite passes 126/126
> and Ruff passes for the touched test module. No credentials or production
> state were used. This remains **Tested**, not **Verified**: controlled live
> Meta UAT, real ad-level reconciliation, workspace reporting UI evidence,
> independent review, and production deployment remain open.

> **2026-10-13 advertising replay-safety checkpoint** — Exact clean code
> commit `3a12930` adds an injectable provider boundary for the worker’s
> recovery harness and proves an at-least-once replay: the first run persists
> ad-level facts, fails during the later account read, and the retry succeeds
> without duplicating canonical observations or reconciliation rows. The
> focused integration suite passes 6/6 and the worker unit suite passes 6/6.
> This remains **Tested**, not **Verified**: controlled live Meta UAT, real
> ad-level reconciliation, workspace reporting UI evidence, independent
> review, and production deployment remain open.

> **2026-10-13 advertising retry/dead-letter checkpoint** — Exact clean code
> commit `eb08990` adds the replay-safe migration `0080`, bounded four-attempt
> advertising sync retries, explicit `dead_letter` state, admin re-enable
> reset, and scoped reporting freshness for dead-lettered syncs. Migration
> drill passes 5/5 with 81/81 ledger rows; worker/transition integration passes
> 5/5 and focused worker tests pass 10/10. This remains **Tested**, not
> **Verified**: controlled live Meta UAT, real ad-level reconciliation,
> workspace reporting UI evidence, independent review, and production
> deployment remain open.

> **2026-10-13 advertising sync-history fencing checkpoint** — Exact clean
> code commit `76d6ef0` fences creation of `advertising_sync_run` history
> behind the current sync lease token. A stale worker can no longer create a
> new `running` history row after recovery has replaced its lease. Concurrent
> claim and stale-history integration coverage passes 4/4. This remains
> **Tested**, not **Verified**: controlled live Meta UAT, real ad-level
> reconciliation, workspace reporting UI evidence, independent review, and
> production deployment remain open.

> **2026-10-13 advertising diagnostic remediation checkpoint** — Exact clean
> code commit `1a3e84e` adds bilingual operation labels, failure explanations,
> and recommended corrective actions to every non-success diagnostic in the
> Global Admin Meta Ads workflow. The focused admin-panel suite passes 4/4 and
> TypeScript reports no errors. The tenant-integrity migration and full
> integration evidence remain current below. This remains **Tested**, not
> **Verified**: controlled live Meta UAT, real ad-level reconciliation,
> workspace reporting UI evidence, independent review, and production
> deployment remain open.

> **2026-10-13 advertising tenant-integrity checkpoint** — Exact clean code
> commit `c4e97e2` adds replay-safe migration `0079` with
> database guards for cross-agency connection/account links, capabilities,
> sync state/history, identities, validation results, observations,
> reconciliations, visibility grants, and financial authorities. The
> disposable migration drill passes 5/5 with 80/80 ledger rows, and the new
> integration coverage passes 3/3. This remains **Tested**, not **Verified**:
> controlled live Meta UAT, real ad-level reconciliation, workspace reporting
> UI evidence, independent review, and production deployment remain open.

> **2026-10-13 advertising lease-fencing checkpoint** — Exact clean code
> commit `035d99b` closes the stale-worker write path in the bounded Meta
> sync. Provider ad-day facts and reconciliation rows are now persisted only
> while the claimed sync lease token is valid under a row lock; expired
> completion/failure transitions are rejected, and the run is recorded as
> skipped with `advertising_lease_lost`. Focused advertising tests pass 7/7;
> the full clean verification passes formatting, lint, typecheck, 506 unit
> files / 4,705 tests, and the production build. The disposable PostgreSQL
> migration drill passes 5/5 with 79/79 ledger rows, and the full integration
> suite passes. No migration was added, and no production deployment or
> external Meta mutation was performed. This remains
> **Tested**, not **Verified**: controlled live Meta UAT, real ad-level
> reconciliation, workspace reporting UI evidence, independent review, and
> production deployment remain open.

> **2026-10-13 current release validation checkpoint** — Exact clean code
> commit `15eadbf` keeps empty Meta account and Instagram probes explicitly
> `partial` in durable validation history instead of recording a false pass.
> The disposable PostgreSQL migration drill passes 5/5 with 79/79 ledger rows,
> including from-zero, repair, upgrade, backup/restore, and failed-migration
> abort; the full integration suite also passes after replaying migrations.
> No production deployment or external Meta mutation was performed. This
> remains **Tested**, not **Verified**: live Meta credentials and read-only
> UAT, real ad-level reconciliation, workspace reporting UI evidence,
> independent review, and production deployment remain open.

> **2026-10-13 Meta discovery diagnostics checkpoint** — Exact clean code
> commit `beddbe4` persists sanitized Facebook Page and Instagram identities
> from the bounded read-only probe, displays those identities in the Global
> Admin advertising workflow, records account-level capability outcomes for
> successful and failed probes, and keeps the capability review bilingual.
> Focused advertising tests pass 7/7; the clean verification passes
> formatting, lint, typecheck, 506 unit files / 4,705 tests, and the
> production build. No migration or production state changed. This remains
> **Tested**, not **Verified**: controlled live Meta UAT, ad-level
> reconciliation against a real account, workspace reporting UI evidence,
> independent review, and production deployment remain open.

> **2026-10-13 scoped advertising reporting checkpoint** — Exact clean code
> commit `b833946e` wires the persisted advertising observations through a
> server-only scoped reporting query and the default-off
> `ADVERTISING_REPORTING_ENABLED` route. The route validates bounded date
> ranges, resolves active agency/workspace access before aggregation, hides
> account and freshness metadata on denial, supports the shared JSON/CSV/AI
> projections, and requires financial authority for financial and AI surfaces.
> Grant revisions are included in authorized cache keys; cross-agency,
> workspace, connection/account, and hidden-row paths are covered by tests.
> The clean verification passes formatting, lint, typecheck, 506 unit files /
> 4,704 tests, and the production build. The migration drill remains 5/5
> with 79/79 ledger rows. This remains **Tested**, not **Verified**: live
> Meta credential/account UAT, report UI wiring, bilingual browser evidence,
> independent review, and production deployment remain open.

> **2026-10-13 bounded advertising ingestion checkpoint** — Exact clean
> implementation commit `7ce7bd72` adds replay-safe migrations `0077` and
> `0078`, bounded Meta collection pagination, explicit ad-level Insights
> normalization, fixed-point spend reconciliation, fenced advertising sync
> leases with retry backoff, the default-off `ADVERTISING_SYNC_ENABLED` cron
> route, and its VPS caller. The worker resolves encrypted credentials only at
> execution time, ingests only explicit ad-level facts, preserves partial-data
> state, and never allocates account totals to inferred workspace resources.
> The migration drill passes 5/5 with 79/79 ledger rows, and `pnpm verify`
> passes with 505 unit files / 4,699 tests, formatting, lint, typecheck, and
> production build. This remains **Tested**, not **Verified**: live Meta
> credential/account UAT, report/export/AI route wiring, bilingual browser
> evidence, independent review, and production deployment remain open.

> **2026-10-13 advertising foundation + admin workflow checkpoint** — Exact
> clean implementation commits `598d561`, `eace698`, `dbcb56e`, and
> `07971ba` add
> distributed HMAC replay protection, credential rotation/revocation,
> sanitized Meta diagnostics/discovery, tenant/workspace grant revisions,
> pre-aggregation reporting authorization, canonical ad-day
> spend/reconciliation storage, the bilingual Global Admin → Integrations →
> Advertising → Meta Ads workflow, and one shared reporting projection seam
> for dashboards, details, aggregates, exports, background reports, and AI
> context, an explicit agency-admin sync control plane, and revocation-driven
> sync pausing. The projection boundary authorizes before aggregation, requires
> financial authority for financial/export surfaces, emits no denied rows or
> cache keys, and keys authorized caches by grant revision. Migrations
> 0074–0076 are additive and replay-safe; the latest disposable PostgreSQL
> drill passes 5/5 with 77/77 ledger rows, including backup/restore and
> failed-migration abort. `pnpm verify` passes: 503 unit files / 4,687 tests,
> formatting, lint, typecheck, and production build; the Trend Radar sidecar
> passes 122 tests. This is **Tested**, not **Verified**: no live Meta
> credential/account UAT or production state was used. Paginated/rate-aware
> provider execution against real credentials, report/export/AI route wiring,
> worker ingestion, bilingual browser evidence, independent review, and
> production deployment remain open.

## Planned next product arc — Meedro-informed Command Center and theme refactor

The staged plan is recorded in
[`docs/implementation/MEEDRO_REFACTOR_PLAN.md`](docs/implementation/MEEDRO_REFACTOR_PLAN.md).
It is planning evidence only; no production-readiness item is marked complete by
the plan. The first implementation slice must preserve the current Stitch
source, extend the existing authorized social analytics read model, and add
light/dark verification before the Command Center surface is called ready.

> **2026-10-04 exact-SHA release checkpoint** — Commit `5f310cd2` is clean,
> pushed to `main`, and deployed. The release-blocking brand-kit build issue
> was repaired by removing module-load `next/font/google` preview loaders and
> using local CSS preview families with stable fallbacks. Focused typography
> tests pass 16/16; the full local unit suite passes 462 files / 4,341 tests;
> the full integration suite passes; CI `37191755586`, Deploy `37192724539`,
> and Release `37192802008` all passed. Production health reports version
> `5f310cd` with database/schema, storage/R2, and rate limiting healthy. The
> advisory Chromium run remains nonblocking with 236 passed, 1 skipped, and 9
> known fixture/source-data or timeout failures. This is `Tested`, not
> `Verified`: authenticated production MCP smoke, provider UAT, manual
> accessibility review, and independent review remain open.

> **2026-10-04 Research watchlist synchronization checkpoint** — Commit
> `3c2093e4` is clean, pushed to `main`, and deployed. Creating a named
> watchlist now refreshes the server-rendered sibling account controls, while
> the keyed editor remounts with the current membership options. Focused
> Research unit contracts pass 7/7; the isolated Research Chromium flow passes
> 3/3; the full local unit suite passes 462 files / 4,342 tests; and the full
> integration suite passes. CI `37195489762`, Deploy `37196630237`, and
> Release `37196710024` all passed. Production health reports version
> `3c2093e` with database/schema, storage/R2, and rate limiting healthy. The
> full Chromium advisory run remains nonblocking at 235 passed, 1 skipped, and
> 10 known fixture/source-data or timeout failures. This is `Tested`, not
> `Verified`: authenticated production MCP smoke, provider UAT, manual
> accessibility review, and independent review remain open.

> **2026-10-04 Trend Radar recovery and production checkpoint** — The source
> onboarding wizard now aborts a stalled bulk-enable request after 15 seconds,
> announces a localized timeout/error through an accessible alert, and offers a
> localized retry while preserving the selected sources. English and Arabic
> copy remain catalog-driven. Targeted i18n/Trend UX contracts pass 12/12;
> targeted lint and typecheck pass; the production build passes. The local full
> unit attempt was resource-stressed and ended at 4,338/4,340 with only the
> unrelated `dev-sign-in-retry` and `ui/combobox` timeout tests failing; the
> authoritative GitHub CI run `37184020252` passed the full quality,
> integration, audit, workflow, sidecar, and image gates. Commit `1f686f30`
> is deployed by `37184955989`; production health reports database/schema,
> storage/R2, and rate limiting up, with the app container healthy and VPS
> disk usage at 31%. This remains `Tested`, not `Verified`.

> **2026-10-04 MCP boundary status** — The public MCP transport boundary
> remains verified at the public layer: POST returns 401 with bearer challenge
> and GET returns 405 with `Allow: POST`. Commit `63105a64` also fixes a real
> persistence mismatch: the Account UI and token service exposed diagnostics
> scopes while the database constraint allowed only content scopes. Migration
> `0069_opposite_boomerang` widens that check compatibly. The disposable real
> HTTP smoke now passes authenticated `initialize` → `tools/list` →
> `list_research` plus immediate token revocation (HTTP 401 after revoke), and
> the full local unit suite passes 462 files / 4,341 tests. CI/deploy evidence
> for `63105a64`, production authenticated smoke, provider UAT, and independent
> review remain open.

> **2026-10-04 Viral Finder evidence-filter checkpoint** — The saved Research
> evidence grid now provides a Meedro-informed, provider-neutral filter loop:
> accessible quick presets for medium/high views, high engagement, outlier
> score, and recency; advanced nullable-safe ranges for views, engagement, and
> outlier score; and a reset recovery action. The filter panel uses native
> controls, visible EN/AR labels, pressed-state semantics, progressive
> disclosure, and a responsive layout. Focused unit/catalog tests pass 16/16;
> the isolated Chromium Research flow passes 3/3; the strict Research visual
> and Arabic/RTL matrix passes 6/6; lint, typecheck, and production build
> pass. Commit `6dd74600` contains the implementation and corrected Meedro
> reports. This is still source-only saved-observation capability, not
> provider-backed competitor discovery; the implementation remains `Tested`,
> not `Verified`.

> **2026-10-02 named research watchlist implementation checkpoint** — M1 source-only
> implementation is complete from the full Meedro integration plan. Migration
> `0067_aberrant_bishop` adds named workspace watchlists and account membership
> while preserving the source-only account registry. The Research route now
> supports bilingual list creation and role-gated account assignment through
> accessible checkbox controls. Focused unit tests pass 8/8, focused integration
> tests pass 2/2, typecheck and lint pass, the migration drill passes 5/5, and
> the focused Chromium Research flow passes 1/1 with serious/critical axe checks.
> The broader Research browser file still has a stale pre-existing expectation
> for a removed planning "Brief" tab; multi-viewport/RTL visual and independent
> review evidence remain open. This checkpoint is not a `Verified` claim.

> **2026-10-03 research browser contract checkpoint** — The source-neutral
> Research page and MCP projection now cast the connected-channel platform
> enum before coalescing it with the manual research-account text value, fixing
> the PostgreSQL render failure for mixed source types. The focused Chromium
> Research flow passes 3/3 with serious/critical axe checks: watchlist
> management, notes-only teardown preview, and teardown-to-draft handoff. The
> implementation remains `Tested`, not `Verified`; multi-viewport/RTL visual
> evidence, provider UAT, entitled AI, and independent review remain open.

> **2026-10-03 research AI governance checkpoint** — The existing notes-only
> teardown route now has route-level tests for capability-off, plan-off,
> successful preview reservation/reconciliation with a redacted context
> manifest, and provider-failure refunds plus failed usage events. Focused
> governance tests pass 4/4. The preview/save separation remains explicit;
> the implementation is `Tested`, not `Verified`, and broader entitled-AI
> product evidence and independent review remain open.

> **2026-10-03 research evidence UX checkpoint** — The source-only Research
> surface now has a responsive evidence grid with keyboard-accessible search,
> platform filtering, transparent metric sorting, localized result counts,
> unavailable metric semantics, source links, and brief handoff actions. The
> client boundary passes serializable localized strings only; network failures
> in account and membership mutations now restore optimistic state and announce
> a localized error. Focused research unit tests pass 12/12 and the named
> watchlist Chromium flow passes 1/1 with serious/critical axe checks. The
> implementation remains `Tested`, not `Verified`; full responsive/RTL visual
> evidence, the complete Research browser file, provider UAT, observation-source
> migration, ranking, entitled AI, and final MCP/release evidence remain open.

> **2026-10-03 named watchlist management checkpoint** — Named watchlists now
> support recoverable soft archive/restore, ordered member positions, keyboard
> up/down reordering, and explicit copy/move actions between active lists.
> Server routes validate workspace scope and reject incomplete reorder sets;
> the UI rolls back optimistic state on network failure. Focused watchlist
> route/component tests pass 11/11, and the Chromium create → reload → copy →
> archive → restore flow passes 1/1 with the Research axe check. M2 remains
> `Tested`, not `Verified`; full responsive/RTL evidence, the observation-source
> seam, provider UAT, ranking, entitled AI, and final MCP release evidence
> remain open.

> **2026-10-03 archived watchlist UI checkpoint** — The Research page now
> loads visible archived watchlists for managers/planners, presents a bilingual
> recoverable archive section, and restores the original member set and order
> through the existing role-gated PATCH route. Focused archived-list component
> tests pass 3/3, and the Chromium archive → restore journey is included in the
> 3/3 Research flow with serious/critical axe checks. The implementation
> remains `Tested`, not `Verified`; full responsive/RTL visual evidence and
> independent review remain open.

> **2026-10-03 Research visual evidence checkpoint** — The Research surface now
> has a strict five-width English responsive matrix at 375, 768, 1024, 1280,
> and 1440px, plus five committed Arabic/RTL screenshots covering the same
> widths. The focused visual run passed 6/6 tests, including serious/critical
> axe checks and no horizontal overflow at any width. This closes the
> Research-specific responsive/RTL evidence gap; the wider route/theme matrix,
> provider UAT, authenticated MCP smoke, and independent review remain open.
> The implementation remains `Tested`, not `Verified`.

> **2026-10-03 targeted visual baseline checkpoint** — The full strict visual
> matrix was run against the current workspace (219 passed, 28 failures).
> Review isolated intentional shipped-layout drift in the shell/overview, board
> mobile, and social-provider settings surfaces; six corresponding PNGs were
> refreshed in commit `c4e64632`. The committed follow-up passes 9/9, and the
> media route passes a separate strict 4/4 rerun without a snapshot change.
> Planning/detail, publish, and workspace-settings failures overlap separate
> uncommitted user edits, so their baselines were deliberately not refreshed.
> The implementation remains `Tested`, not `Verified`; independent review,
> provider UAT, authenticated MCP smoke, and the remaining clean planning
> visual pass are still open.

> **2026-10-03 planning visual baseline checkpoint** — After the related
> planning UI changes were committed, the reviewed English responsive planning
> list matrix passed 4/4 at 375, 768, 1024, and 1440px with serious/critical
> axe checks and no horizontal-overflow failure. The four corresponding
> baselines were refreshed in `ef0c2754`; the current layout intentionally
> records the shipped List/Board/Calendar switcher, search/filter controls,
> and responsive planning-card layouts. The broader detail, publish, settings,
> Arabic/RTL, full route matrix, provider UAT, authenticated MCP smoke, and
> independent review remain open. This evidence remains `Tested`, not
> `Verified`.

> **2026-10-03 planning detail/publish/settings visual checkpoint** — The
> reviewed responsive slice passed 29/29 with serious/critical axe checks:
> planning detail 4/4, Publish 4/4, workspace Settings 3/3, and the six
> settings subsections (approvals, defaults, lead times, lifecycle, templates,
> and trends) 18/18 at the configured mobile, tablet, laptop, and wide
> viewports. The eight detail/Publish baselines were refreshed only after
> inspecting the rendered captures: the detail route records the current
> workspace header/navigation and the Publish route records the current
> channel setup, audience, preview, readiness, and structured payload flow.
> No UI code changed in this checkpoint. The wider route/theme/role matrix,
> provider UAT, authenticated MCP smoke, and independent review remain open.
> This evidence remains `Tested`, not `Verified`.

> **2026-10-03 public MCP boundary checkpoint** — Against the deployed
> `ef0c275`, `/api/health` reports `db: "up"`, `schema: "ready"`, storage,
> R2 storage, and rate limiting healthy. An unauthenticated MCP POST returns
> HTTP 401 with `WWW-Authenticate: Bearer`, and GET returns HTTP 405 with
> `Allow: POST`. This confirms the public transport boundary only; the
> authenticated `initialize` → `tools/list` → `list_research` smoke and
> immediate token revocation remain pending explicit temporary-token approval.

> **2026-10-03 source-neutral observation checkpoint** — Migration
> `0068_source_neutral_post_observations` extends the existing normalized post
> observation read model with an explicit `source_kind`, a nullable research
> account relationship, source-aware daily uniqueness, and a database check
> requiring exactly one source. Connected-channel sync remains unchanged;
> research-account persistence and workspace-scoped reads now use the same
> table without treating a research account as a publishing channel. Bookmark
> and create-brief authorization accept either connected or active research
> sources. Repository integration coverage and the full schema/integration
> gates remain required before this M3 slice can move beyond `Tested`; provider
> refresh, ranking, AI insight, visual/RTL evidence, and independent review
> remain open.

> **2026-10-03 versioned ranking checkpoint** — Research evidence now uses a
> pure `research/metrics` service with formula version `v1`. Engagement is
> calculated only from normalized interactions and a known views/reach
> denominator; reach fallback is marked partial. Outlier score uses the median
> of at least two valid peer view values, with explicit performance bands and
> no coercion of missing or negative provider values. The bilingual evidence
> grid exposes engagement/outlier sorting and labels the results as
> Planner-derived. It also supports selecting up to three observations for a
> responsive comparison using the same metrics. Focused metric/evidence tests
> pass 10/10. The slice is `Tested`, not `Verified`; provider UAT, entitled AI,
> responsive/RTL evidence, and independent review remain open.

> **2026-10-01 visual reference checkpoint** — The reviewed exact-reference
> suite passes 24/24 after regenerating only the three references affected by
> the fixed visual fixture: workspace overview desktop/mobile
> and Planning mobile. The new renders preserve the current shell hierarchy
> and Meedro-informed spacing/content structure; the broader responsive matrix
> is still open and no blanket snapshot refresh was performed.

> **2026-10-01 responsive fixture checkpoint** — Visual fixtures now use the
> committed September 2026 reference month, while normal E2E fixtures retain
> their relative date behavior. The reviewed responsive slices pass: Planning
> 4/4 widths; Settings, overview, analytics, Agency AI, and Board 3/3 each.
> Only those affected baseline groups were refreshed; the broader matrix
> remains open and no blanket snapshot update was performed.

> **2026-10-01 hydration checkpoint** — The shared hash/scroll-spy hook now
> keeps its first render deterministic and applies deep-link hashes after
> mount. The full settings responsive slice passes 23/23 with no React
> hydration-mismatch output; the focused sidebar/settings unit slice passes
> 62/62.

> **2026-10-01 shell ownership checkpoint** — Workspace Settings now renders
> one compact in-page anchor strip at every viewport. The global sidebar is
> the only persistent navigation rail; the settings route no longer creates a
> second desktop rail. Routes, anchors, permissions, and forms are unchanged.

> **2026-10-01 Command Center theme/RTL checkpoint** — Analytics comparison
> series now use semantic light/dark chart tokens instead of fixed hex colors.
> The Command Center best-time heatmap keeps its RTL table inside a local
> horizontal scroller; the full Chromium analytics/Command Center E2E slice
> passes 14/14, including the 375px Arabic/RTL journey.

> **2026-10-01 accessibility checkpoint** — The annotated a11y suite now passes
> 215/215 when run one browser project at a time: Chromium, Firefox, WebKit,
> mobile-Chrome, and mobile-Safari each pass 43/43. This includes the corrected
> Arabic/RTL shell contract, dark-theme Account coverage, Command Center, and
> the mobile route checks. The earlier combined-run failures were caused by a
> stale Board assertion and long-lived dev-server resource pressure; neither
> reproduces in the isolated evidence runs.

> **2026-10-01 MCP research checkpoint** — The remote Planner MCP now exposes
> `laratik_planner_list_research` under the existing `content:read` scope. It
> reuses internal workspace access, applies private/workspace collection
> visibility, and returns only normalized research records: no provider media,
> raw provider bodies, OAuth tokens, or planner-entered raw notes. Focused MCP
> contract coverage passes 4/4; `docs/api/mcp.md`, `docs/api/README.md`, and
> `docs/api/mcp-evaluation.xml` are synchronized. This is local `Tested`
> evidence; remote deployment and independent review remain open.

> **2026-10-01 Command Center provenance checkpoint** — The KPI strip now
> exposes the latest metric date, authorized read-model source, and the
> contributing-channel coverage beside aggregate values. This prevents the
> overall sync timestamp from being mistaken for an atomic snapshot of every
> KPI. English/Arabic catalog parity and focused Command Center contracts pass;
> broader browser evidence remains part of the release queue.

> **2026-10-01 provenance browser checkpoint** — The focused Chromium
> Command Center journey passes 3/3: light theme axe, dark theme axe, and the
> Meedro-style observed-content filters/pagination. The KPI evidence strip is
> visible in both themes. This is tested local evidence; the full release
> matrix and independent review remain open.

> **2026-10-01 channel-health checkpoint** — Command Center data health now
> shows each connected account's platform, healthy/degraded/stalled status,
> and last-sync time while keeping provider error payloads out of the UI. The
> updated focused Chromium slice passes 3/3 with light/dark axe coverage and
> Meedro-style inventory interaction. Full release evidence remains open.

> **2026-10-01 Command Center watchlist checkpoint** — The workspace overview
> now surfaces the source-only research watchlist with a direct Research
> handoff. Manual entries remain explicitly labeled; provider-backed competitor
> snapshots stay gated on controlled capability evidence. Focused unit/catalog
> checks pass 20/20 and the Chromium Command Center journey passes 3/3.

> **2026-10-01 watchlist visual checkpoint** — The changed workspace overview
> passes the exact Stitch reference and mobile-s/tablet/wide responsive cases
> 4/4 without refreshing snapshots.

> **2026-10-01 overview visual checkpoint** — The changed workspace overview
> passes its exact Stitch reference 1/1 and responsive matrix 3/3 at mobile-s,
> tablet, and wide without refreshing a baseline. The broader visual matrix
> remains a deliberate review queue.

> **2026-09-30 M1 implementation checkpoint** — Per-user System/Light/Dark
> preference is implemented through Account and migration `0057_eminent_stryfe`.
> The disposable migration drill passes 5/5, and `pnpm verify` passes with
> 450 unit files / 4,304 tests plus the production build. This is tested local
> evidence only; authenticated theme visual/a11y evidence and the Command Center
> release gates remain open.

> **2026-09-30 theme browser checkpoint** — The authenticated Account journey
> passes 1/1 in Chromium: a user can switch Light, Dark, and System; the root
> `data-theme` state updates immediately; and the selected value persists after
> reload. The dark-theme Account axe check also passes 1/1 after adding
> theme-aware foreground tokens for filled primary/danger controls. Responsive,
> RTL, and cross-role evidence remain open.

> **2026-09-30 focused browser matrix checkpoint** — The disposable Chromium
> run passes 15/15 across the theme and Command Center journeys. It covers
> Light/Dark/System persistence, empty and connected Command Center states,
> the section rail, Arabic/RTL at 375px, analytics comparison and filtering,
> workspace switching, client-reviewer denial, and agency-admin access. This
> upgrades the implementation evidence to `Tested` for those journeys only;
> the five-width visual matrix, axe coverage beyond the existing checks,
> provider UAT, and independent review remain open.

> **2026-09-30 connected Command Center axe checkpoint** — The real
> metric-backed overview now passes the serious/critical axe scan in both light
> and dark themes (2/2). The scan caught and the shared token layer repaired
> a dark-theme contrast regression where legacy `text-white` filled controls
> bypassed the theme-aware primary foreground. Full route/width coverage,
> provider UAT, and independent review remain open.

> **2026-09-30 teardown boundary checkpoint** — The next research milestone is
> now explicitly gated on authorized source evidence (provider media payload,
> planner-owned upload, or user-entered transcript/notes). Metrics and source
> provenance will remain separate from creative interpretation, and teardown
> output will be preview-only. No AI teardown is being claimed from a permalink
> or performance metrics alone.

> **2026-09-30 teardown contract checkpoint** — The shared research module now
> validates those source types and parses a versioned teardown result with
> hook, promise, format, beats, pacing, CTA, evidence, and uncertainty. Four
> focused unit tests pass. This is contract groundwork only; no teardown button
> or provider-media claim is enabled yet.

> **2026-09-30 latest verification checkpoint** — After the teardown contract
> addition, `pnpm verify` passes with 450 unit files / 4,302 tests and the
> production build. This remains local `Tested` evidence; browser visual
> coverage, controlled Meta UAT, and independent review remain open.

> **2026-09-30 teardown preview checkpoint** — Research now exposes a
> notes/transcript-only structured teardown preview for workspace managers and
> planners. It reuses the existing `brief_improvement` AI entitlement and
> budget gate, validates the versioned result, and never saves raw notes,
> provider bodies, a draft, workflow status, or publish action. A separate,
> role-gated save route now persists only the validated result as a research
> artifact (`0064_plain_crusher_hogan`). Parser/catalog tests pass 13/13, the
> all-browser blank-input journey passes 5/5, the migration drill passes 5/5,
> and the Research responsive visual set passes 3/3. Provider media,
> owned-asset ingestion, broader bilingual/theme/axe evidence, and independent
> review remain open.

> **2026-09-30 research visual checkpoint** — The new Research shelf now has
> responsive visual captures at 360px, 768px, and 1440px (3/3). The capture
> covers the job-grouped sidebar, source-only watchlist, structured teardown
> preview, and honest empty saved-research state. The two previously stale
> Stitch mobile references for workspace overview and planning were refreshed
> from the current Command Center/empty-seeded-data contract and pass 2/2.
> The remaining broader responsive matrix is still open.

> **2026-09-30 overview visual checkpoint** — The workspace root now passes
> the visual responsive matrix at mobile-s (360px), tablet (768px), and wide
> (1440px), 3/3, after the header action group was kept below the title until
> the large breakpoint. The three Command Center-aware baselines were reviewed
> and refreshed. Theme persistence and serious/critical Command Center axe
> checks also pass 3/3 in the same isolated run; full route/width evidence and
> independent review remain open.

> **2026-09-30 staged setup checkpoint** — The no-data Command Center state now
> gives managers a three-step path: connect a social account, collect the first
> metric snapshot, then review analytics and plan the next move. The empty state
> remains honest and links only to existing Channels and Analytics routes. The
> responsive overview captures pass 3/3 at 360px, 768px, and 1440px; the exact
> Stitch overview references pass 2/2 (desktop and mobile), and the connected
> Command Center axe matrix passes 10/10 across the configured browsers. Full
> bilingual/role evidence, provider UAT, and independent review remain open.

> **2026-09-30 research-to-draft checkpoint** — A saved, validated research
> teardown can now seed an editable planner draft through an explicit
> `Create draft` handoff. The draft stores a separate provenance link to the
> teardown artifact (`0065_fat_kulan_gath`); the structured result is not
> silently written into `formatPayload`, and the planner can rewrite the seeded
> title/brief before creation. Migration drill passes 5/5, the social schema
> integration slice passes 28/28, focused unit/catalog checks pass 64/64, and
> the all-browser handoff journey passes 10/10. Provider media ingestion,
> wider bilingual/role evidence, and independent review remain open. A later
> checkpoint records the verified blank-field apply slice.

> **2026-09-30 teardown apply checkpoint** — A linked saved teardown can now
> explicitly fill blank structured fields from the content detail Brief tab.
> Existing planner values win; the helper supports common hook/message/CTA/
> notes fields plus scenes or slide outlines when the item format allows them.
> Focused unit/catalog checks pass 65/65 and the full five-project browser
> journey passes 10/10, including mobile section selection. Provider media
> ingestion, broader bilingual/role evidence, and independent review remain
> open.

> **2026-09-30 Command Center reference checkpoint** — The canonical Stitch
> workspace-overview reference now also passes 1/1 with the Command Center
> empty state and reviewed header layout. The complete visual suite was started
> but remains open: it exposed additional stale exact references on planning,
> content detail, settings, and agency AI surfaces, which were not refreshed
> because they are outside this focused Command Center change.

> **2026-09-30 focused exact-reference checkpoint** — The canonical Stitch
> reference set now passes exact Chromium assertions 20/20. The planning list,
> planning content detail, workspace settings, agency AI, Media, Account,
> Board, and Publish references were reviewed and refreshed where the shipped
> UI had intentionally moved. The settings pass exposed a serious contrast
> issue in the active settings-sidebar description; changing the selected
> state from `text-primary/80` to the semantic `text-primary` token cleared
> the axe gate. Media also exposed an invalid `role="note"` inside a
> `role="tree"`; removing that role cleared its critical axe gate. The full
> responsive visual matrix remains open and has not been called green.

> **2026-09-30 shell responsive checkpoint** — The focused responsive matrix
> passes Account 3/3, Social Analytics 3/3, Trend Radar 3/3, and Channels 3/3
> (12/12). Account’s mobile axe scan exposed a horizontally scrollable MCP
> endpoint without keyboard access; adding a focusable scroll target cleared
> it. The remaining full responsive matrix, bilingual/role coverage, provider
> UAT, and independent review remain open.

> **2026-09-30 production tenant checkpoint** — A fresh authenticated read-only
> check of `planner.laratik.com/app` found no active agency/workspace, and the
> previously inspected `dr-reem-reda` URL still renders `Workspace unavailable`.
> This does not change local implementation evidence; it makes the remaining
> controlled Meta UAT prerequisite explicit: select or provision an active
> LaraTik tenant before connecting an owned test Page/Instagram profile.

> **2026-09-30 Meedro section re-check checkpoint** — The authenticated
> reference pass revisited Viral Finder, Viral Library, Content Ideas+, Viral
> Vault, My Projects, Viral Scripts, MCP Connection, Workflows, and B-Roll
> Assets. The feature audit now records their current empty/loading/locked
> states and maps each to a LaraTik priority; no Meedro generation, download,
> connector setup, upgrade, or persistent mutation was performed.

> **2026-09-30 M2 Command Center checkpoint** — The workspace root now includes
> a Meedro-informed Command Center layer over the existing authorized social
> analytics read model. It has explicit empty/no-data and metric-backed states,
> 30-day follower trend with table fallback, strongest-account signals, freshness
> context, normalized channel comparison, connected-account health badges, and a
> planning handoff. Focused unit tests pass and the Chromium route checks pass
> 3/3, including a 375px Arabic/RTL route check. This remains `Tested` evidence
> only; theme, role, accessibility, visual, and Meta provider gates remain open.

> **2026-09-30 Command Center structure checkpoint** — The connected-data
> surface now exposes a Meedro-style keyboard-accessible section rail for data
> health, follower growth, channel performance, and planning handoff, plus a
> compact last-sync line in the header. The focused Command Center unit test
> passes 3/3 and the touched component/spec pass ESLint; the isolated browser
> runner was not used as release evidence because its local disposable run
> stalled before the test server started.

> **2026-09-30 Command Center chart polish checkpoint** — The follower trend
> now uses a restrained semantic area fill and point markers while preserving
> the accessible table as the exact-value fallback. Focused Command Center tests
> pass 10/10; formatting, ESLint, strict typecheck, and diff checks pass. This
> remains `Tested` local evidence only; responsive, role, visual, and production
> gates remain open.

> **2026-09-30 research-to-brief checkpoint** — Content drafts with a linked
> observed post now pass normalized source evidence (account, platform, media
> type, duration, and available metrics) into the existing Improve brief flow.
> The UI makes that context visible, and the prompt requires an original angle
> without copying source wording or inventing metrics. Focused AI and catalog
> tests pass 36/36; no auto-write or publishing behavior was added.

> **2026-09-30 verification checkpoint** — `pnpm verify` passes at the current
> working tree: formatting, lint, strict typecheck, 449 unit files / 4,298
> tests, and the production build. This is local `Tested` evidence only and
> does not close the required browser, provider-UAT, or independent-review gates.

> **2026-09-30 Command Center heatmap checkpoint** — The best-time surface now
> renders an accessible weekday/hour heatmap from the existing timezone-aware
> post observations. Cells expose average views and sample size; only slots with
> at least three observations remain recommendation-eligible. Focused Command
> Center tests pass 10/10, with formatting and strict typecheck green.

> **2026-09-30 Meta capability checkpoint** — The existing agency-admin
> analytics probe now performs a read-only Instagram media inventory check and
> tests one recent media item against `views`, `reach`, `saved`, `shares`, and
> `total_interactions`. The result is sanitized and classified per metric;
> focused Meta/provider and probe-card tests pass. No OAuth scopes, tokens,
> durable post-observation tables, or publishing behavior were changed by the
> probe itself. Facebook Page post probing and controlled production evidence
> remain open.

> **2026-09-30 post-observation checkpoint** — The first bounded observation
> slice is implemented behind the existing read-only Meta sync: migration
> `0058_workable_prodigy` adds provider-neutral `social_post_observation` rows,
> `0059_wet_boomer` adds provenance links from observed posts to drafts, and
> `0060_parallel_wallop` adds workspace-scoped research bookmarks;
> Instagram stores available read-only `views`, `reach`, `saved`, `shares`, and
> `total_interactions` plus likes/comments and provider-supplied video duration
> for at most 10 recent media objects; unsupported metrics remain nullable; and the Command Center
> exposes top-content/outlier, best-time, and duration-band cards with
> sample-size context. Focused provider/Command Center tests pass. Migration
> drill passes 5/5, full verification passes with 447 unit files / 4,292
> tests plus production build, and the full integration suite is green.
> Browser evidence, Facebook post-level insights, historical pagination, and
> independent review remain open.

> **2026-09-30 research watchlist checkpoint** — Migrations `0061_blue_hammerhead`
> and `0062_zippy_karma` add a workspace-scoped, role-gated account registry to
> the Research surface. It stores normalized platform/handle/profile references
> and explicit provider status (`manual`, `available`, `unsupported`, `error`),
> but performs no scraping and infers no competitor metrics. Focused watchlist,
> bookmark, and catalog tests pass 13/13; the five-part migration drill passes
> 5/5 with 103 tables and 64/64 migration entries. Provider-backed snapshots,
> freshness, and independent browser evidence remain open.

> **2026-09-30 local authenticated render checkpoint** — A disposable local
> workspace now renders the grouped shell and the Command Center as the first
> substantive overview block. Chromium inspection confirmed the light and dark
> themes, the empty connected-account state, its `Open channels` handoff, and
> the Account theme selector with persistence after navigation. This is local
> browser evidence only; it does not replace the required bilingual,
> responsive, accessibility, visual, role, or production-session gates.

> **2026-09-30 Command Center refresh checkpoint** — Workspace managers can
> now refresh all connected channels from the Command Center through the
> existing sequential `runChannelTest` pipeline. The action revalidates the
> overview, analytics, and channels surfaces and reports complete or partial
> results. Focused refresh, Command Center, and catalog tests pass 17/17; this
> does not replace controlled Meta provider UAT or production release gates.

> **2026-10-01 Command Center inventory checkpoint** — The authenticated
> Meedro re-check identified the next useful interaction and LaraTik now has
> an `Observed content` inventory driven by the existing authorized post
> observations. Recent / Most viewed / Outlier / Engagement filters,
> pagination, source links, research bookmarking, and Create brief preserve
> workspace scope and do not copy provider media. Typecheck, lint, formatting,
> and the Command Center calculation suite pass; browser visual and broader
> bilingual/role evidence remain open.

> **2026-10-01 inventory browser checkpoint** — The isolated Command Center
> journey passes 15/15 across Chromium, Firefox, WebKit, mobile Chrome, and
> mobile Safari, covering light/dark serious/critical axe scans and inventory
> filtering/pagination. The newly exercised heatmap exposed a scrollable table
> wrapper without keyboard focus; adding a focus target cleared the violation.
> The exact current-worktree repository gate also passes: 450 unit files /
> 4,304 tests, formatting, lint, strict typecheck, and production build. This
> is still local `Tested` evidence; provider UAT, wider role/locale coverage,
> and independent review remain open.

> **2026-10-01 research collections checkpoint** — Migration
> `0066_last_robin_chapel` adds named Research collections with explicit
> `me`/`workspace` visibility. Managers/planners can create a collection and
> assign an existing bookmark or validated teardown; reviewers can see shared
> collections but cannot mutate them. The one-collection-per-item v1 ceiling
> avoids a second generic project taxonomy. Focused collection unit tests pass
> 11/11 assertions and the integration test passes 1/1; the migration drill is
> 5/5. Responsive bilingual evidence and independent review remain open.

> **2026-10-01 visual-matrix investigation** — The isolated `pnpm test:visual`
> run was started against `planner_test` and reached 115/244 cases before
> stopping for review. Command Center, analytics, planning, settings, and the
> shell cases exercised so far passed. The first mismatches are concentrated in
> Media, Users, and Reviews: current renders have intentionally changed route
> state/content compared with their older references (workspace selection,
> member-management density, and empty-state action treatment). No snapshots
> were updated. Re-capture those reviewed references only after the current
> layouts are signed off; the full visual gate remains open. The four reviewed
> surfaces were then recaptured intentionally, and the targeted assertion
> passes 12/12 across mobile-s, tablet, and wide. The new Research collections
> section was reviewed separately, its three references were recaptured, and
> the complete priority group now passes 34/34. The next production-workflow
> group covered Channels, Library, Planning, and the Brand Kit routes. Its
> first run reached 45/48; Brand Kit Activity was the only mismatch because
> its reference still showed the retired short "Recent updates" card. After
> reviewing that current full activity/filter surface, its three references
> were recaptured and the targeted group now passes 48/48. The full visual
> matrix then completed at 226/244 on the broad pass; the remaining 19 cases
> were the reviewed Media, provider-readiness, platform access/admin/errors,
> and planning-edit references. Those targeted assertions pass 19/19, so the
> current five-width visual inventory is 244/244. Theme/locale variants,
> broader role evidence, provider UAT, and independent review remain open.

> **2026-09-30 Facebook post capability checkpoint** — The agency-admin Meta
> probe now tests one owned Facebook Page post with the v26-compatible
> replacement metrics (originally introduced as v25 replacements)
> `post_media_view` and `post_total_media_view_unique` using lifetime
> semantics, and renders each result with explicit capability status. Focused
> provider and probe-card tests pass. This does not promote those metrics into
> durable sync: controlled Page UAT is still required to verify the connected
> token, permissions, and viewer semantics before the Command Center labels or
> ranks Facebook posts by them.

> **2026-10-01 Meta account recheck** — The logged-in Business Suite session
> opens a Just Halal-branded asset with Facebook and Instagram entities; no
> separate LaraTik-owned test Page/profile was visible, and no settings,
> permissions, credentials, or connections were changed. The LaraTik-associated
> Ads Manager app is still unpublished/in development. Facebook Login for
> Business and testing requirements are present, while business/access
> verification and App Review remain incomplete. The Meta portfolio selector
> confirms LaraTik GmbH with one development app, but that does not prove a
> Page or Instagram asset is ready. Provider UAT stays staged behind a
> disposable LaraTik-owned Page plus linked Instagram profile.

> **2026-10-01 Food Game pilot checkpoint** — Read-only Meta Business Suite
> inspection confirmed the `LaraTik GmbH`-owned Food Game Facebook Page and
> linked Instagram professional account `@__foodgame`. Production Planner
> already shows both profiles connected and synced about four hours earlier;
> publishing remains disabled. Social Analytics reports 496 combined current
> followers (+11, +2.3% over seven days), Instagram healthy at 358 (+8), and
> Facebook at 138 (+3) with explicit `metric_unavailable` / provider-limited
> status. This provides controlled pilot evidence for freshness, KPI, and
> partial-data handling. It does not close the broader Meta UAT, bilingual,
> role, release, or independent-review gates, and Just Halal remains excluded.

> **2026-09-30 signal-confidence checkpoint** — Command Center timing and
> duration recommendations now require three observations per bucket. Smaller
> groups remain visible with sample size but are explicitly marked as
> insufficient for a reliable signal. Focused calculation and catalog tests
> pass; the responsive, bilingual, role, visual, and provider UAT gates remain
> open.

> **2026-09-30 verification checkpoint** — The full `pnpm verify` gate now
> passes at 448 unit files / 4,296 tests, including the per-agency Meta callback
> routing suite, followed by the production build for all 46 routes. The test
> stabilization removes an unnecessary per-case module-graph reset; it does not
> weaken the cross-tenant assertion or change runtime callback behavior.

> **2026-09-30 migration-drift repair checkpoint** — Creating that disposable
> workspace exposed a pre-existing local database where the usage-threshold
> table existed but its schema-required deduplication index did not. Migration
> `0063_repair_usage_threshold_dedupe` adds the idempotent unique index repair;
> the five-part migration drill passes 5/5 with 103 from-zero tables and
> `64/64` ledger entries. No production database was touched.

> **2026-09-30 provider-readiness checkpoint** — The agency Meta provider page
> now shows a bilingual four-step readiness path: app configuration,
> credential test, connected profiles, and the explicit read-only analytics
> probe. It reuses existing provider/profile data and does not claim probe
> success before the operator runs it. Catalog parity passes 9/9 and typecheck
> is green; responsive, role-based, visual, and controlled provider UAT gates
> remain open.

> **2026-09-30 browser-evidence environment checkpoint** — A focused isolated
> Chromium attempt was not counted as evidence after inspection found two local
> environment collisions: native PostgreSQL and Docker both exposed `5432`, and
> a stale Next dev process owned the default E2E port. The disposable database
> migration itself completed; the runbook now requires validating the host DB
> endpoint and using a free browser port. No application or production state
> was changed.

> **2026-09-30 shell-order checkpoint** — `AGENTS.md` now records the durable
> Meedro-informed ownership contract for sidebar, top bar, page header, and
> Command Center signals. The workspace root presents the social Command Center
> before planning execution KPIs. Formatting and typecheck pass; the focused
> Command Center/navigation/research suite passes 21/21. Authenticated browser
> visual evidence remains open because the inspected production tab currently
> resolves to `Workspace unavailable`.

> **2026-09-30 setup documentation checkpoint** — The operator runbook,
> environment reference, provider-extension guide, and `.env.example` now
> describe the M4.6 per-agency provider configuration truth: only the platform
> KEK and global sync switch are environment values; app credentials and Graph
> version are entered and tested in the agency provider UI. The isolated E2E
> runner now chooses a free port when no `PORT` is supplied and preserves
> explicit overrides. Typecheck, formatting, and diff checks pass. A read-only
> Meta Developer inspection found the live Social Tracker app belongs to Just
> Halal and LaraTik has two in-development Ads Manager apps, both without a
> Login for Business configuration; no settings or permissions were changed.
> The LaraTik GmbH-associated candidate is the preferred owner choice.
> Canonical-app selection and controlled provider UAT remain open.

> **2026-09-30 Command Center rail checkpoint** — The internal section rail
> now reuses the shared scroll-spy hook and marks the active section with
> `aria-current="location"`, preserving hash deep links and keyboard navigation.
> The focused section-nav test passes 1/1; touched-file ESLint, typecheck, and
> diff checks pass. Full responsive, bilingual, role, visual, and production
> evidence remain open.

> **2026-09-30 provider setup UX checkpoint** — The agency provider card now
> includes localized direct links to the relevant Meta/TikTok developer console
> beside callback registration instructions. This is navigation only; no app,
> permission, or credential mutation was performed. Catalog parity is 9/9,
> focused checks are 14/14, and typecheck/format/diff checks pass.

> **2026-09-30 Meta setup worksheet checkpoint** — The inspected Meta app
> decision, five read-only scopes, agency callback pattern, sanitized evidence
> checklist, and staged stop gates are now consolidated in
> `docs/operations/META_COMMAND_CENTER_SETUP.md`. It explicitly excludes the
> Just Halal live app and keeps publishing disabled. This is preparation only;
> canonical-app selection and controlled OAuth/probe/sync UAT remain open.

> **2026-09-15 Planning workspace UX/IA refactor** — Exact clean implementation
> commit `f992fb30` passes `pnpm verify` (377 unit files / 3,447 passing tests,
> 4 tracked todos, production build). The focused §23 lifecycle browser path
> passes 1/1, the Planning URL-filter case passes 1/1 when isolated, and the
> Planning-only strict visual/a11y subset passes 29/29 after reviewed baseline
> refresh. The new `Mark publishing setup ready` command validates the complete
> publishing package and advances the existing lifecycle without scheduling or
> publishing. Automatic publishing capability remains independent. Full
> cross-engine browser gates, manual accessibility/UAT, independent visual
> review and the shared `READY FOR INDEPENDENT REVIEW` verdict remain open.

> **2026-09-08 Trend Radar v1 ships (Milestone 8)** — Multi-platform
> trend intelligence lands behind the new `trend_radar` capability
> flag and the agency database master-switch gate. 12 additive trend
> tables in `src/lib/db/schema/trends.ts`; Python sidecar in
> `services/trends/`; 4 planner tabs (Discover / For You / Boards /
> Briefs) and 1 admin Sources page. Full details + outstanding
> follow-ups are in the "Milestone 8" section at the bottom of
> this file. Independent-reviewer sign-off, visual-matrix rerun on
> the new surfaces, and Trend Radar UAT steps in
> `docs/production-readiness/UAT_RELEASE.md` remain open.

> **2026-09-04 analytics reliability amendment** — The approved analytics
> refactor adds migration `0031_social_metric_workspace_dates` to backfill
> daily social metric dates from `observed_at` in each workspace timezone;
> latest `observed_at` wins collisions. It also separates provider setup and
> metric availability errors while preserving legacy `not_configured` reads.
> Exact-clean migration, integration, bilingual browser, accessibility, and
> visual evidence remains required before this work can move beyond `Tested`.

> **Release verdict: `READY FOR INDEPENDENT REVIEW`** (2026-08-24 — shared across this file and `docs/production-readiness/UAT_RELEASE.md`).
>
> This is the authoritative implementation and verification tracker. `STUDIOFLOW_MASTER_PROMPT.md` remains the product source of truth. MiniMax may move an item through `Tested`; only an independent reviewer may set `Verified` and flip the shared verdict to `READY`.

> **2026-09-01 local release-gate setup** — The Docker Postgres container
> `laratik-planner-pg-dev` is healthy and now has the disposable
> `planner_test` database. `NODE_ENV=test TEST_DATABASE_URL=… pnpm
migration-drill` passes 5/5; `TEST_DATABASE_URL=… pnpm test:integration`
> passes 22 files / 187 tests; the authenticated Chromium accessibility sweep
> passes 24/24 routes. The isolated E2E and visual commands now share
> `scripts/run-e2e-tests.ts`, which applies migrations, injects deterministic
> test-only Auth.js settings, and refuses non-test URLs. The visual suite reaches
> screenshot assertions. The candidate visual suite passed 112/112 on Chromium
> at snapshot `f702b46` (39 exact-reference + 73 scoped responsive assertions)
> after four stale development-error baselines were recaptured; candidate PNGs
> are present for human Stitch comparison. Because source and E2E changes landed
> after that snapshot, the final release candidate must rerun the visual suite
> at its exact HEAD. The release verdict
> stays `READY FOR INDEPENDENT REVIEW` until visual review, the full browser
> matrix, manual accessibility/UAT, and independent sign-off are complete.

> **2026-09-03 whole-repository audit follow-up** — The full audit and ordered
> remediation plan are recorded in `docs/audits/REPO_AUDIT_2026-09-02.md`.
> The planning toolbar now applies and preserves status, format, stage, channel,
> owner, health, density, search, pagination, and board/list navigation filters;
> parser, disposable-Postgres, and five-context browser evidence is recorded in
> commits `ad9cbd9`, `de9fabf`, and `013c1c9`. Setup metadata and placeholders
> now use both locale catalogs (`1b15de9`, `fa8d7bf`). A follow-up production
> dependency audit found four transitive `fast-uri` high advisories; override
> commit `bfb350d` resolves `fast-uri@4.1.4`, and frozen install plus
> `pnpm audit --prod` are clean. The exact-clean full `pnpm verify` evidence is
> recorded at `1b15de9`; the final production build also passes after the
> dependency override. The shared password visibility control now uses the
> active English/Arabic catalog for its accessible Show/Hide labels, with a
> focused Arabic toggle regression in `4fb9be8`. The visual matrix remains
> 73/112 with 39 deliberate deltas at exact clean HEAD `d6b3149`; no snapshots
> were updated. The planning header follow-up in `d6b3149` fixes the genuine
> tablet title squeeze by moving dense actions below the title until the large
> breakpoint; its remaining visual delta is reference/fixture height drift.
> The verdict stays `READY FOR INDEPENDENT REVIEW`.

> **2026-09-03 exact-clean cross-engine follow-up** — Clean HEAD `22aec64`
> passes `pnpm verify`: Prettier, ESLint, strict TypeScript, 319 unit files
> with 3,109 passing tests and 4 TODOs, and the production build. The full
> `pnpm test:a11y` matrix passes 145/145 across Chromium, Firefox, WebKit,
> mobile Chrome, and mobile Safari, including the Arabic/RTL shell contract.
> A WebKit/Safari hydration mismatch in the settings deadline date was fixed
> with stable numeric-part date formatting and a regression test. The exact
> visual matrix at this HEAD remains 73/112 with 39 reference/fixture deltas;
> no snapshots were changed. Manual accessibility/UAT, performance evidence,
> route-level visual review, and independent sign-off remain open.

> **2026-09-03 localization follow-up** — Clean HEAD `68222ec` passes
> `pnpm verify`: Prettier, ESLint, strict TypeScript, 320 unit files with
> 3,111 passing tests and 4 TODOs, and the production build. The readiness
> panel (`3b9cb24`) and the shared Brand Kit archive/undo control plus
> publishing-rule labels now resolve their user-facing copy through the active
> English/Arabic catalogs; focused Arabic regressions and catalog parity pass.
> The latest full cross-engine a11y evidence remains 145/145 at `22aec64` and
> must be rerun for this exact code SHA before final verification. Performance,
> manual accessibility/UAT, visual reference review, and independent sign-off
> remain open.

> **2026-09-03 exact-clean a11y follow-up** — Clean HEAD `a386ef3` passes
> `pnpm test:a11y`: 145/145 checks across Chromium, Firefox, WebKit, mobile
> Chrome, and mobile Safari, with zero critical/serious axe violations and a
> passing Arabic/RTL shell check. The Brand Kit localization changes are
> included in this exact run. Manual keyboard, screen-reader, 200% zoom,
> reduced-motion/UAT, visual reference review, performance evidence, and
> independent sign-off remain open.

> **2026-09-03 AI settings localization and coverage follow-up** — Source
> checkpoint `f232e32` passes `pnpm verify`: Prettier, ESLint, strict
> TypeScript, 320 unit files with 3,113 passing tests and 4 TODOs, and the
> production build. Agency AI settings and managed-secret controls now use
> the active English/Arabic catalogs, including capability metadata, provider
> status, test states, warnings, and usage labels. The added
> `/app/agency-settings/ai` accessibility route passes 5/5 Playwright projects
> at `a78ada0`. The full existing matrix remains 145/145 after the transient
> Firefox seed reset was confirmed by an isolated rerun. Manual accessibility/
> UAT, visual reference review, performance evidence, and independent sign-off
> remain open.

> **2026-09-03 exact-clean verification** — At clean HEAD `d6b3149`,
> `pnpm verify` passes: Prettier, ESLint, strict TypeScript, 318 unit files
> with 3,108 passing tests and 4 TODOs, and the production build. The exact-
> HEAD visual rerun also completed at this SHA: 73/112 assertions passed and
> 39 remained red; no snapshots changed. Visual reference reconciliation,
> performance, manual accessibility/UAT, and independent-review gates remain
> open.

> **2026-09-03 exact-clean database evidence** — At clean HEAD `5625acd`, the
> disposable `planner_test` migration drill passes 5/5, including from-zero,
> skipped-migration repair, in-place upgrade, backup/restore, and failed-
> migration abort checks. The integration suite passes 23 files / 189 tests.
> These checks use only disposable local data; no production database was
> touched. Visual, performance, manual accessibility/UAT, and independent-
> review gates remain open.

> **2026-09-03 localization follow-up** — The account application-information
> card now resolves its title, description, build, and environment labels from
> the active English/Arabic catalog, with a focused Arabic regression in
> `462db37`. The full catalog parity and static localization checks remain
> required after subsequent copy batches.

> **2026-09-03 visual follow-up** — The overview attention banner now uses a
> narrow-screen grid, keeps its message readable at 360px, and gives its CTA a
> 44px touch target (`85d026b`, focused unit coverage). The targeted visual
> assertion remains intentionally red: the committed reference has two seeded
> overview items while the current deterministic fixture has one, producing a
> 2949px expected image versus 2792px actual. No snapshot was updated; fixture
> and Stitch-reference reconciliation remains a reviewer-owned decision.
>
> **2026-08-26 update — landing entry and sign-in refinement** — Commit `caa349f` redirects authenticated `/` visits directly to `/app`, exposes one contextual public CTA, and redesigns `/signin` around one active method at a time. Password remains the default for returning users, Google is secondary, magic link is progressively disclosed, and first-time setup offers only identity-verifying providers. Evidence: clean-snapshot `pnpm verify` passes with 2,110 runnable unit tests and the Next.js production build; Chromium entry checks pass 4/4, public accessibility checks pass 4/4, and the `/signin` Stitch/responsive visual set passes 4/4. Full pre-merge browser gates were attempted against disposable Postgres but remain non-green on unrelated social-analytics/agency-switcher cases and a parallel authenticated visual-seed race; no unrelated test or production code was changed. The verdict remains `READY FOR INDEPENDENT REVIEW`.
>
> **2026-08-24 production incident — login render reference `1145607673`** — Authentication completed, but the first authenticated render for a platform administrator failed because `support_access_grant` did not exist in production. Migration `0012_support_access_grants` had been merged from a parallel branch with journal timestamp `1787544999872`, older than already-applied migrations `0007–0011`; Drizzle therefore skipped it while applying later entries. Migration `0017_repair_support_access_grants` is the additive forward repair: it restores all four M3 tables and reconciles the original ledger row. Deploy `32775688443` created a verified backup and applied that repair; its app image rolled back because the first readiness revision incorrectly required the production database's pre-ledger history to contain all 18 rows. The follow-up readiness check verifies the critical tables and complete recorded suffix, explicitly requires reordered journal entries, and still rejects gaps or unknown rows. A unit guard permits only the documented 0012 inversion and requires every post-repair timestamp to remain strictly monotonic. Local evidence: migration drill 5/5 PASS plus focused skipped-migration, baseline-ledger, and readiness regressions. No existing tenant row or identifier is modified; destructive rollback still requires the verified pre-deploy backup.
>
> **2026-08-20 update** — Production deploy complete and live. `https://planner.laratik.com/api/health` returns `{"ok":true,"version":"c2355c9...","env":"production","db":"up","schema":"ready"}`. M1 (auth/security), M2 (workflow/publishing/AI), M3a (infra/deploy), M3b (product + docs) and the post-M3a deploy chain are all in `main` (sha `c2355c9`). CI on `main` is green; the Deploy workflow ran end-to-end (build+push image+push migrator → SSH to `laratik-vps` → `docker login ghcr.io` → `docker compose pull` → backup → `docker compose run --rm migrate` (schema applied cleanly) → `docker compose up -d --no-deps app` → health-check 200) with conclusion `success`. Remaining work is owner-only: Sentry DSN + alert rules (OBS-001), manual a11y sign-off (QA-005), visual baselines on the stable UI (QA-004), and one independent reviewer flipping the verdict to `READY`.

> **2026-08-22 update (historical)** — The Stitch production completion program landed on `main` (12 atomic commits `c2bfac5`–`ba19f4e`, merge `735eb44`), but two regressions in the merge had to be repaired before the deploy could be re-attempted: (1) `a853683` accidentally tracked a `node_modules` symlink and 122 macOS-only visual snapshots with absolute paths in their filenames — both were non-portable to the GitHub Ubuntu runner. `f406fbc` untracked them; visual baselines were then reported as `PENDING` while the candidate capture was being repaired. (2) The RSC `#441` fix (Set→string[]) and the WorkflowBar full status ladder fix from a parallel AI session were never committed; `9a6f80d` lands them. CI is green on `9a6f80d`. The shared verdict remains `READY FOR INDEPENDENT REVIEW`; the `READY` flip and production re-deploy require final exact-HEAD visual evidence, manual a11y + UAT + external-services evidence.
>
> **2026-08-24 update — M3 merged; deploy chain hardened** — M3 (AI governance + support access) is on `main` (merge `4a999fe`, branch `feat/m3-ai-governance-and-support-access`). The `1dbba0d ci(workflow): remove daily 06:00 UTC schedule and chained auto-deploy` change is live; the CI SMTP-cert probe still runs on every push to `main` and the runbook-recommended VPS-side cron at 07:30 UTC is now codified in `scripts/vps/install-cron.sh`. `0687eac fix(proxy): bypass /api/health/{live,ready}` keeps the auth proxy from blocking the liveness/readiness probes. The `READY FOR INDEPENDENT REVIEW` verdict still requires owner action: Sentry DSN + alert rules (OBS-001), manual a11y + visual baseline evidence (QA-004 / QA-005), and the independent reviewer flipping the verdict to `READY` after the 30-step §23 journey.

> **2026-08-24 update — navigation-first UI/UX refinement** — Commit `7536d4d` replaces the duplicated navigation model with one responsive hierarchy: 248px expanded sidebar at `xl`, a real 72px tablet rail, and a context-aware mobile bottom bar plus accessible More sheet. Board, Calendar, Design Queue, Library, workspace administration, settings, agency, platform, account, and help destinations are reachable without page-local route duplication. Creation is context- and permission-aware; the mobile calendar uses an agenda rather than a horizontally clipped desktop grid. Evidence: `pnpm verify` passed 133 files / 1,543 unit tests plus the Next.js production build; integration passed 15 files / 106 tests on disposable Postgres; mobile and workspace Chromium suites passed 8/8 each; `pnpm audit --prod` found no known vulnerabilities. The screen-by-screen review is in `docs/design/UI_UX_REFINEMENT_2026-08-24.md`. No row was promoted to `Verified`; QA-004 Linux baselines and the manual portion of QA-005 remain pending.
>
> **2026-08-24 coverage follow-up** — Main CI run `32737748394` passed workflow/Dockerfile/shell lint, SMTP certificate validation, format, lint, strict typecheck, migrations, unit tests and integration tests, then correctly failed closed on the pre-existing security coverage gap (92.07% statements/lines versus the 95% floor). Commit `7dd678f` adds behavior coverage for empty-secret rejection and versioned encryption-key rotation without changing production code or lowering thresholds. The same local `pnpm test:coverage` gate now passes with `src/lib/security` at 100% statements/lines/functions and 91.83% branches.
>
> **2026-08-24 deployment follow-up** — Main CI runs `32738542623` and `32746320016` passed the complete deploy gate; Deploy runs `32739436859` and `32747249686` successfully released their exact SHAs to production. Release run `32739928044` exposed a checkout assumption; commit `04f045b` removed it. Release run `32747742108` then exposed a second fail-closed edge: `gh api` wrote a missing-ref 404 body to stdout and the fallback treated it as an existing tag SHA. The follow-up correction clears failed API output, enables the documented manual backfill path, creates immutable tags, refuses tag movement and keeps reruns idempotent. Regression tests pass 3/3; local `pnpm verify` passes 134 files / 1,548 tests plus the production build; `actionlint`, `zizmor` and `git diff --check` pass. These bookkeeping defects occurred after successful deployments and did not require application rollback. The operational correction does not change the `READY FOR INDEPENDENT REVIEW` verdict.

> **2026-08-24 update — M4 (social profile analytics) merged** — `feat/auto-20260824-3613c271` merged into `main` (merge `0f6d552`). The M4 work: ADR-0004 (`docs/decisions/0004-social-profile-analytics.md`), migration `0015_social_profile_analytics` (renumbered from `0013` to avoid colliding with main's `0013_ai_provider_secret`; 3 new tables — `social_connection`, `social_oauth_state`, `social_profile_daily_metric` — and 10 additive columns on `social_channel`), AES-256-GCM credential envelope (`src/lib/social/crypto.ts`) with versioned AAD `laratik-planner:social-credentials:v1`, provider-neutral types + safe HTTP client (`src/lib/social/types.ts`, `http.ts`), tenant-scoped repository with `FOR UPDATE SKIP LOCKED` lease-based claim (`src/lib/social/repository.ts`), Meta adapter (`src/lib/social/providers/meta.ts`) and TikTok adapter (`src/lib/social/providers/tiktok.ts`) implementing the same `SocialProviderAdapter` contract, OAuth start + callback routes for both providers, account picker (`meta-account-picker.tsx`), focus-managed revoke dialog (`connection-actions.tsx`) listing every affected channel, connection-status badge, social growth dashboard at `/app/w/[slug]/analytics/social` with hand-rolled dependency-free accessible SVG chart and exact-value table, bounded daily sync worker (`sync.ts`) with claim → refresh → fetch → upsert and a `/api/cron/social-metrics` route authenticated with `CRON_SECRET` + timing-safe comparison, `scripts/vps/social-metrics-sync.sh` (24h OAuth state + 25-month metric retention), `scripts/vps/install-cron.sh` updated to schedule the new call every 15 minutes, runbook § Social analytics + `EXTERNAL_SERVICES_UAT.md` Meta + TikTok tables added, and a focused `web-design-guidelines` review pass (focus-within rings, `aria-busy`, `aria-live="polite"`, role=dialog revoke confirmation, keyboard handlers on the picker, semantic heading hierarchy). The rollout is staged (see `docs/operations/runbook.md` § Social analytics): `SOCIAL_SYNC_ENABLED=false` ships first; Meta App Review evidence; `SOCIAL_SYNC_ENABLED=true` for one internal workspace; seven consecutive clean daily snapshots; Meta for all workspaces; TikTok after the seven-day gate (gated by `SOCIAL_TIKTOK_ENABLED`). **Evidence**: 1620 unit tests pass (141 files), 135 integration tests pass (17 files on disposable Postgres), `pnpm verify` green, `pnpm migration-drill` 4/4 PASS with Drizzle ledger reporting 16/16 migrations applied cleanly. M4 rows stop at `Tested`; the `READY FOR INDEPENDENT REVIEW` verdict still requires owner action (Sentry, manual a11y, visual baselines, Stitch MCP capture of the two new screens, independent reviewer).

## Status protocol

Allowed statuses: `Not Started`, `In Progress`, `Implemented`, `Tested`, `Blocked`, `Verified`.

An item may be marked `Tested` only when its evidence column contains the exact automated command/result and any required screenshots or operational proof. Compilation alone is never completion. Required tests may not be skipped. A blocker must name its owner and the external action required.

## Baseline evidence (2026-08-19)

| Check                                | Result                                                                                          | Evidence                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Format, lint, typecheck, unit, build | Pass                                                                                            | `pnpm verify`                                |
| Browser tests                        | 144 pass, 10 skip                                                                               | `pnpm test:e2e`                              |
| Vitest                               | 10 pass, 8 database tests skip                                                                  | `pnpm test:coverage`                         |
| Coverage                             | 26.88% statements; core content/delivery/publishing/invitation/AI services effectively untested | `pnpm test:coverage`                         |
| Dependency audit                     | 23 advisories: 3 critical, 5 high, 12 moderate, 3 low → **post-M3: 0 advisories**               | `pnpm audit --prod` (2026-08-19 → post-M3)   |
| Production health                    | HTTP 200, DB up, version incorrectly reports `0.0.0` → **post-M3a: real release SHA**           | `https://planner.laratik.com/api/health`     |
| Screen completeness                  | Numerous canonical routes absent; placeholder and Goal copy remain                              | `docs/production-readiness/SCREEN_PARITY.md` |

## Refinements (2026-08-21)

Twenty-one atomic commits in one day, all on `main`. Every commit
passes `pnpm verify` (format / lint / typecheck / unit / build) and
`pnpm audit --prod` (0 advisories). Pushed to origin in three
batches during the day. The 4 settings-polish commits
(`acda5ef`–`7f32060`) close the polish pass on channels, team,
workspace-settings and agency-settings per
`docs/design/SETTINGS_UI_LEARNINGS.md`; the chore commit `d8fd846`
adds `issues.md` (the agent triage queue) to the repo.

| Commit         | Focus                                                        | Files  | +         | -         | Tests    | Verifies                                                                                                                                          |
| -------------- | ------------------------------------------------------------ | ------ | --------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `471e5cf`      | FormSubmitButton + KPI refactor + brand-kit voice rules      | 12     | +227      | -87       | +8       | All 6 forms share one submit primitive; planning uses `calculateWorkspaceKpis`; voice rules inline `[Tone] content`                               |
| `0838de8`      | Email + AI service tests + dev/signin FormSubmitButton       | 3      | +364      | -4        | +16      | 5 email tests, 11 AI tests (gate / fetch / response parse / prompt shape)                                                                         |
| `7b2ced5`      | PlanningFilters + content/status tests                       | 4      | +290      | -41       | +19      | 14 status tests (exhaustiveness invariants), 5 filters tests                                                                                      |
| `f7a6531`      | DataTable (channels + team pages)                            | 4      | +410      | -182      | +7       | Typed `<DataTable<T>>` with `hideOn`; -190 lines of duplicate table styling                                                                       |
| `792f5e6`      | Tracker refinement log + KpiCard tests                       | 3      | +262      | -1        | +4       | Tracker log bumped to "Refinements 2026-08-21"; 4 KpiCard tests for the extracted-but-untested primitive                                          |
| `907f3be`      | KpiTile extracted from users page                            | 3      | +176      | -53       | +7       | `KpiTile` extracted (typed `tone` prop owns border+icon color); 7 tests for tone/label/data-testid forwarding                                     |
| `a271731`      | Workspaces page adopts KpiTile + DataTable                   | 2      | +65       | -91       | +0       | Kills the last inlined KpiTile (drops `text-warning`/`text-success` icon double-styling); columns helper takes lookup maps                        |
| `67b7ebd`      | Library page adopts DataTable for Content pillars            | 1      | +28       | -36       | +0       | Pillars table moves to `<DataTable>`; -8 lines of hand-rolled table styling                                                                       |
| `ca7ea77`      | CommentItem + CommentForm extracted from discussion          | 5      | +676      | -243      | +38      | 362-line `discussion-section.tsx` becomes a 131-line orchestrator; 21 comment-item + 17 comment-form tests                                        |
| `8d5f74c`      | WorkflowBoard extracted (board page)                         | 3      | +247      | -51       | +11      | 93 → 55 lines in board page; typed `<WorkflowBoard>` with `WorkflowBoardColumn` + `WorkflowBoardItem` types                                       |
| `6bf94bf`      | Reviews adopts KpiTile for Pending/Overdue/On-time           | 1      | +17       | -46       | +0       | Three inlined "mini-KPI" cards collapse into `<KpiTile tone="danger">` for overdue                                                                |
| `f814f45`      | RecentItemsCard extracted + Button asChild on overview       | 3      | +236      | -71       | +10      | 256 → 215 lines in workspace overview; action links use `<Button asChild>`; 10 RecentItemsCard tests                                              |
| `1df8f32`      | ReviewRow extracted (reviews queue)                          | 3      | +209      | -28       | +13      | 161 → 124 lines in reviews; 13 tests cover due-date visibility, overdue predicate, gate humanization                                              |
| `8c16f28`      | Centralize `.replace(/_/g, " ")` in `humanize()`             | 7      | +16       | -10       | +0       | 7 call sites switch to `humanize()` / `humanFormat()`; title-case behaviour now consistent app-wide                                               |
| `029d945`      | NotificationItem extracted (notifications bell)              | 3      | +214      | -49       | +12      | 40-line inline `<li>` per row collapses into 8-line map; bell 227 → 192 lines; 12 tests covering unread + mark-on-open                            |
| `0571e69`      | Discussions service schema tests                             | 1      | +166      | -0        | +18      | 18 tests for `CreateCommentSchema` + `ResolveCommentSchema` + visibility/label unions; covers body length cap + UUID validation                   |
| `acda5ef`      | Settings polish — channels (Stitch top tabs, CTA, FormField) | 6      | +488      | -33       | +6       | `AddChannelButton` client component; `FormField` adoption on add card; `channels-empty-state` testid; SETTINGS_UI_LEARNINGS doc                   |
| `dfda274`      | Settings polish — team (card layout, edit trigger testids)   | 2      | +65       | -6        | +2       | `member-edit-trigger` testid+aria-label; team-empty-state tone matches actor permission; pending/members card testids                             |
| `a8dacb8`      | Settings polish — workspace settings (section nav anchors)   | 3      | +284      | -44       | +4       | Reorganized into 4 anchor sections (`#lifecycle`, `#lead-times`, `#approvals`, `#defaults`); `Label htmlFor`+`aria-required`; settings-form tests |
| `7f32060`      | Settings polish — agency-settings (cards, Lucide icons)      | 2      | +137      | -23       | +5       | Lucide `Building2`/`Server`/`KeyRound` icons; `border-b` card rhythm; 5 data-testids; 5 page tests including forbidden + no-emoji                 |
| `d8fd846`      | chore: add issues.md as agent triage working notes           | 1      | +118      | -0        | +0       | Cross-session triage queue (P0–P3 severity, skill, branch strategy); tracked in `docs/design/SETTINGS_UI_LEARNINGS.md` patterns                   |
| **Cumulative** |                                                              | **73** | **+4991** | **-1099** | **+202** | **42→47 test files, 283→485 tests**                                                                                                               |

Reusable components added in this batch (all extracted from inlined
page-local code): `FormSubmitButton`, `PlanningFilters`, `DataTable`,
`KpiTile`, `CommentItem`, `CommentForm`, `WorkflowBoard`,
`RecentItemsCard`, `ReviewRow`, `AddChannelButton`. `AD-001`
(component-library extraction) component count moved from **19 → 40**
(35 new shared primitives + 5 new co-located modules: comments,
board, channel-form, channel-button, settings-form).

## P0 release blockers

| ID      | Status | Source                   | Gap and required implementation                                                                                                                                                          | Acceptance and required tests                                                                                                                    | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | ------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-001 | Tested | §13, §21, §24            | Upgrade Auth.js/NextAuth, Drizzle, Nodemailer and all transitive packages until the production audit has no critical/high advisories.                                                    | Frozen install, full verification and `pnpm audit --prod` exit successfully with zero critical/high.                                             | M3a `a7a6cd0`: dependency upgrades — `next-auth` 5.0.0-beta.25 → .32, `drizzle-orm` 0.36.4 → 0.45.2, `drizzle-kit` 0.30.0 → 0.31.10, `@sentry/nextjs` 9.10.0 → 10.70.0, `nodemailer` 6.9.16 → 9.0.5, `@auth/drizzle-adapter` 1.7.4 → 1.11.3. `pnpm audit --prod` post-upgrade: 0 advisories (was 23: 3 critical, 5 high, 12 moderate, 3 low). Tested on `main` run `32306459911` (sha `908c992`, 2026-08-19). Follow-up audit remediation `bfb350d` adds a `fast-uri >=3.1.6` pnpm override; frozen install resolves `fast-uri@4.1.4`, and `pnpm audit --prod` reports no known vulnerabilities.                    |
| SEC-002 | Tested | §13 invitation invariant | Invitation acceptance must require an authenticated, verified, normalized email equal to the invitation email. Token reuse by another identity must fail without information disclosure. | Unit/integration cases: matching email, case normalization, mismatch, expired, revoked, already accepted, concurrent acceptance.                 | M1 `e7cd510`: `lib/auth/invitation-identity.ts` (`normalizeEmailAddress`, `invitationIdentityMatches`), `invitation-command.ts` (typed input), rewired `invitations.ts`. Unit: `invitation-command.test.ts` 2/2, `invitation-identity.test.ts` 3/3 pass. Concurrent grant dedup: `ba2d4fa` (SELECT FOR UPDATE in tx). Integration: `tests/integration/invitation-concurrency.test.ts` 2/2 pass.                                                                                                                                                                                                                     |
| SEC-003 | Tested | §9, §13, §24             | Audit every route/action for active agency/workspace membership, exact role, client visibility and cross-workspace denial.                                                               | Role-by-command and role-by-route matrix passes for admin, manager, planner, designer, internal reviewer, client reviewer, publisher and viewer. | M3b `23706b1`: `tests/e2e/role-authorization.spec.ts` runs the role-by-route matrix; `src/app/api/dev/seed/route.ts` accepts explicit `workspaceRoles` and `agencyAdmin` so each scenario is isolated. Cross-workspace denial asserted at the policy layer (canAccessInternalWorkspace vs canAccessClientWorkspace, M1).                                                                                                                                                                                                                                                                                            |
| SEC-004 | Tested | §13                      | Prevent self-deactivation and deactivation of the final active agency admin. Validate invite workspace IDs/roles against the active agency.                                              | Integration tests prove both lockout paths fail and valid changes succeed.                                                                       | M1 `e7cd510`: `lib/auth/member-safety.ts` (`assertCanDeactivateAgencyMember`); `invitations.ts` validates workspace IDs in same tx. Unit: `member-deactivation.test.ts` 3/3 pass.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| SEC-005 | Tested | §15, §21                 | Add bounded rate limits and audit events for bootstrap, invitation mutations, AI generation and sensitive auth flows. Redact provider errors.                                            | Limit/retry tests, redaction tests and audit-event integration tests.                                                                            | M1 `e7cd510`: `lib/security/rate-limit.ts` (`enforceRateLimit`, scoped rules, audit insert) wired into `bootstrap/admin/route.ts`; `public-error.ts` redacts upstream detail. Unit: `rate-limit-policy.test.ts` 2/2 pass.                                                                                                                                                                                                                                                                                                                                                                                           |
| SEC-006 | Tested | §21, §24                 | Add CSP, frame, content-type, referrer and permissions headers; review OAuth account linking.                                                                                            | Production header smoke test and OAuth configuration tests.                                                                                      | M1 `e7cd510`: `lib/security/headers.ts` (`buildSecurityHeaders`) wired in `next.config.ts`; `auth/config.ts` env-gates providers and removes `allowDangerousEmailAccountLinking`. Unit: `security-headers.test.ts` 2/2 pass.                                                                                                                                                                                                                                                                                                                                                                                        |
| WF-001  | Tested | §10, Goal 7              | Centralize the typed workflow transition table and structured domain errors. Server derives permitted next actions.                                                                      | Exhaustive status/action/role/reason table tests with 95% statements and 90% branches.                                                           | M2 `193c1a5`: `lib/content/workflow.ts` (`WORKFLOW_RULES`, `resolveWorkflowTransition`); `service.ts` derives permitted actions; `status.ts` is the single source for human labels and badge variants. Unit: `workflow-state-machine.test.ts` 7/7 pass.                                                                                                                                                                                                                                                                                                                                                             |
| WF-002  | Tested | §10                      | Content submission/decision must create and decide the correct approval request in the same transaction as the status change and activity/outbox event.                                  | Planner→reviewer request-changes→resubmit→approve integration journey; duplicate/stale decision cases.                                           | M2 `193c1a5`: `deliveries/service.ts` wraps submission/decision in `db.transaction` with `FOR UPDATE` locking and `deriveCreativeApprovalOutcome`; `activityEvents` and approval-history writes are co-committed.                                                                                                                                                                                                                                                                                                                                                                                                   |
| WF-003  | Tested | §10, Goal 9              | Delivery allocation must be concurrency-safe, immutable, invalidate obsolete approvals, create correct internal/client gates and advance status atomically.                              | V1→changes→V2, concurrent version, stale approval and both approval-mode tests.                                                                  | M2 `193c1a5`: pending approvals are cancelled inside the submit tx, `approvedDeliveryVersionId` and `changeRequestGate` are set, and `creative_internal` vs `creative_client` gates are decided by `approvalMode`. Unit: `creative-approval.test.ts` 4/4 pass.                                                                                                                                                                                                                                                                                                                                                      |
| WF-004  | Tested | §10                      | Correct change-request gate/return target, unblock to saved state, assignment default/claim/release/reassign history and concurrent claim.                                               | Exhaustive unit/integration coverage.                                                                                                            | M2 `193c1a5`: `changeRequestGate` distinguishes creative internal vs creative client; unblock preserves the prior status and clears the gate. Default assignees come from `workspaceSettings`.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| PUB-001 | Tested | §10, Goal 10             | Restrict publishing to approved items and atomically derive per-channel aggregate status for pending, failed, skipped, retried and concurrent updates.                                   | Exhaustive aggregation and concurrent publisher tests plus publisher-role E2E.                                                                   | M2 `193c1a5`: `lib/publishing/aggregate.ts` (`derivePublicationAggregate`); `service.ts` checks status pre-state and again post-lock; updates contentItems with derived status. Unit: `publication-aggregate.test.ts` 4/4 pass.                                                                                                                                                                                                                                                                                                                                                                                     |
| DEP-001 | Tested | §21, Goal 13             | Deploy only after quality/security jobs pass. Use immutable image metadata and a dedicated migrator containing migrations/runtime. Never swallow migration failure.                      | CI dependency proof, from-zero and upgrade migration tests, failed-migration abort test.                                                         | M3a `a7a6cd0`: deploy workflow triggers on `workflow_run` CI success, checks out the head_sha, builds both `laratik-planner` and `laratik-planner-migrator` images, pushes them SHA-tagged. `scripts/deploy.sh` aborts on any migration failure (no more swallowed exit). **End-to-end verified on `main` by deploy run `32346174802` (sha `c2355c9`, 2026-08-20)**: `Build + push image` ✅, `Build + push migrator` ✅, `Deploy to laratik-vps` (SSH → `docker login ghcr.io` → `docker compose pull` → backup → `docker compose run --rm migrate` → `docker compose up -d --no-deps app` → health-check 200) ✅. |

## P1 required product completion

| ID      | Status                           | Source / Stitch                                                                                                                    | Required implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Acceptance and required tests                                                                             | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-001  | Implemented                      | Overview `f2bf40…`                                                                                                                 | Real Total Ideas, Ready to Publish, Published, At Risk, plan coverage, delivery health, milestone and on-track KPIs; cards link to filtered planning.                                                                                                                                                                                                                                                                                                                                                                  | KPI/timezone tests; desktop/tablet/mobile visual and E2E.                                                 | M2 `193c1a5`: `lib/dashboard/kpis.ts` (`calculateWorkspaceKpis`); `w/[slug]/page.tsx` renders real cards that link to filtered planning. Unit: `workspace-kpis.test.ts` 2/2 pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| UI-002  | Implemented                      | Planning `96f0dd…`, Board `f9e58…`, Calendar `8c0ec…`                                                                              | Month navigation, grouped list, URL filters, density, seven-column board with mobile list, month/week calendar, channel-effective dates, drag and keyboard move.                                                                                                                                                                                                                                                                                                                                                       | Consistency, DST, filters, reschedule approval-reset and responsive tests.                                | M3b `23706b1`: `/app/w/[slug]/board` (status consistency + desktop/mobile), `/app/w/[slug]/calendar` (month/week/DST/move + responsive), `planning/page.tsx` (month nav, grouped list, density). M2 `193c1a5` added the planning list with status helpers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| UI-003  | Implemented                      | Quick Create `9794f1…`, Batch `43a166…`                                                                                            | Four-field quick surface with server defaults, optional details, all active channels by default and validated batch paste/create.                                                                                                                                                                                                                                                                                                                                                                                      | All eight formats, defaults, invalid row and batch atomicity tests.                                       | M2 `193c1a5`: Quick Create honors `workspaceSettings` defaults (designer, reviewers); `lib/content/batch.ts` (BatchCreateSchema, parseBatchRows); `batchCreateContentItems` is atomic. Unit: `batch-create.test.ts` 1/1 pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| UI-004  | Implemented                      | Detail `f7159c…`, Delivery `879e75…`, four-workspace implementation checkpoint (working tree; exact clean SHA pending)             | Complete format-aware content editing, assignments, activity, immutable delivery history, discussions, approvals, AI assistance and publication history. The final planning detail contract uses four workspaces: Overview, Create, Publish, and Activity. Overview is read-only; Create owns creative and delivery; Publish owns copy, destinations, schedule, previews, readiness, and publishing. Permitted edits remain available after review/approval in every non-cancelled status without resetting approvals. | Role journeys and desktop/tablet/mobile visual tests.                                                     | Existing detail and delivery foundations remain covered by the earlier milestones. The current checkpoint adds grouped panels, legacy hash aliases, role-preserving post-approval edits, approval-history transparency, server-owned final-copy approval, and focused unit/integration/E2E evidence. Exact clean-commit SHA and release matrix results must be recorded after commit verification.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| UI-005  | Implemented                      | Reviews `bb6ac0…`, Client `c7dd77…`, Client Calendar `218f25…`                                                                     | Internal queues, due indicators, safe client portal, approved history and read-only calendar. Client responses must never fetch internal data.                                                                                                                                                                                                                                                                                                                                                                         | Data-shape denial, role navigation and decision E2E.                                                      | M3b `23706b1`: `/app/w/[slug]/reviews` (internal queues, due indicators), `/app/w/[slug]/client` and `/app/w/[slug]/client/calendar` (client-safe, uses `canAccessClientWorkspace` from M1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| UI-006  | Implemented                      | Publishing `9cf65e…`, Recovery `382b94…`                                                                                           | Per-channel confirmation, manual-publish notice, failed edit/retry and mobile confirmation.                                                                                                                                                                                                                                                                                                                                                                                                                            | Publication E2E and visual tests.                                                                         | M3b `23706b1`: `/app/w/[slug]/design-queue` includes the publication flow with per-channel confirmation and recovery; M2 `193c1a5` provides the `derivePublicationAggregate` + status guard.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| UI-007  | **Rebuilt 2026-08-26** (Round 5) | Channels `45d945…`, Brand Kit R1–R4 `471e5cf…b84c945` + rebuild `f7e9115…c4e9038` (31 commits), Team `2db8ec…`, Settings `2f6acd…` | Social channel CRUD/archive, Brand Kit (full UI/UX rebuild — 24 bugs closed, 4 new shared primitives, 9 features deferred to follow-up worktrees), team access editing, timezone, targets, approval mode, default assignees/reviewers and lead times.                                                                                                                                                                                                                                                                  | Validation, privacy, upload authorization, responsive admin + 370 unit tests covering the new primitives. | M3b `23706b1` for the original Brand Kit; **2026-08-26 Round 5 rebuild** (31 atomic commits on `main`, `docs/design/BRAND_KIT_AUDIT_2026-08-26.md`): C-1.1–C-1.13 (consistency + hero honesty + loading skeleton), C-2.1–C-2.7 (form unification, `FormField` + `useSuccessReset` + `CharacterCountInput` migration), C-3.1–C-3.4 (polish: `getErrorMessage`, drop test-only DOM hook, `touch-action: manipulation`), C-4.1–C-4.4 (section primitives: `SectionCard` + `SectionEmptyState`, page.tsx migration), C-5.6 data layer (plumb `includeArchived` through 3 listers). 12 Phase 5 UI commits deferred (Pillar CRUD, edit-in-place, sort/filter, pagination, archived view UI, share link, OpenGraph, keyboard shortcuts, preview-as-client, recent-updates filter, mobile voice tab strip, Source Sans 3 rename) — see the audit doc.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| UI-008  | Implemented                      | Library `749387…`, Design Queue `5ad5ff…`, AI `cb0de6…`                                                                            | Campaigns, pillars, templates, unassigned design queue and agency-managed AI settings/test/usage UI.                                                                                                                                                                                                                                                                                                                                                                                                                   | Unit/integration/E2E with AI disabled and fake provider.                                                  | M3b `23706b1`: `/app/w/[slug]/library` and `/app/agency-settings` (agency-setting gated). AI disabled + fake provider tests live in `lib/ai/` and are exercised through the existing e2e + integration suite.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| UI-009  | Implemented                      | My Work `f4dc67…`, Workspaces `01aa8f…`, Operational `21068e…`                                                                     | Role-specific categories, workspace setup/archive/restore, complete states, working authorized navigation and real search or no search control.                                                                                                                                                                                                                                                                                                                                                                        | Role navigation, archive history, keyboard and visual tests.                                              | M3b `23706b1`: `/app` and `/app/workspaces` (workspaces setup, archive, restore via M2 workspaces service), operational states (loading/empty/error/denied/archived) covered by the modified app-shell + error-states spec.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| UI-010  | Implemented                      | Responsive reference set                                                                                                           | Intentional layouts at the scoped responsive viewports (planning: 375 / 768 / 1024 / 1440; other surfaces: 360 / 768 / 1440); status icon+text; no dead links/Goal copy/placeholders.                                                                                                                                                                                                                                                                                                                                  | Chromium, Firefox, WebKit, mobile Chrome/Safari; axe and visual baselines.                                | **Current harness contract (reconciled 2026-09-02):** five functional Playwright projects plus the dedicated `visual-chromium` project. The manifest contains 51 captures (27/11/3/3/7 split, 41 active, 10 historical/superseded); 39 active route-backed exact-reference assertions and 73 scoped responsive assertions (23 unique route surfaces: 19 non-planning × 3 viewports [360, 768, 1440] and four planning × 4 viewports [375, 768, 1024, 1440]). Exact-clean rerun at `22aec64` passed 73/112 assertions; 39 remain under route-level Stitch/fixture review. No row is `Verified` without independent review.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| AI-001  | Tested                           | §15                                                                                                                                | Provider abstraction, safe context allowlist, fake provider, capabilities, human-controlled insert/replace, timeout/retry/rate/token limits and usage logging.                                                                                                                                                                                                                                                                                                                                                         | Context deny/allow tests; disabled workflow E2E; controlled provider smoke.                               | M2 `193c1a5`: `src/app/api/ai/generate/route.ts` enforces the agency master switch and capability allowlist, applies `enforceRateLimit('ai_generation')`, scrubs via `public-error`, writes `aiUsageEvents` per request. Provider context allowlist and fake provider live in `lib/ai/`. Tested on `main` run `32306459911`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| OBS-001 | Partial                          | §21                                                                                                                                | Complete Sentry initialization/source maps, structured request-correlated logs, secret/private-data scrubbing and alerts.                                                                                                                                                                                                                                                                                                                                                                                              | Production-like captured error/release proof.                                                             | M1 `e7cd510`: `lib/observability/logger.ts` (structured logs, recursive secret/private-data scrubbing). M3a `a7a6cd0`: `next.config.ts` wired with `withSentryConfig` (source maps deleted after upload, debug logging treeshaken); `instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` register the runtime. Production proof and alert rules still require owner-supplied DSN — see OPS-001. **2026-09-27 — app-error capture is now the primary signal, not Sentry.** `instrumentation.ts` `onRequestError` was `Sentry.captureRequestError`, a no-op without the owner-supplied DSN, so all 84 route handlers, every server action, and every server render had **no durable error record**; it now writes to `app_error_event` first and still forwards to Sentry. Two further defects fixed: `sanitizeLogContext` collapsed every Error to `{name, message:"[redacted]"}` (no message/stack in the log stream), and the client-boundary path sent a plain object that the `instanceof Error` helpers rejected — so **every client-boundary row stored `message="Unknown error"`** with NULL error_name/stack/cause_message. Both are regression-locked in tests. Added `app_error_group` fingerprint grouping with an atomic `ON CONFLICT` upsert, a per-fingerprint burst cap (`APP_ERROR_BURST_LIMIT`), 30/90-day retention (`/api/cron/error-retention` + `scripts/vps/error-retention.sh`), a 50-line request log ring buffer flushed into `context.logs`, `unhandledRejection`/`uncaughtException` capture, and five `laratik_planner_*` diagnostics MCP tools behind the new `platform:diagnostics:*` scopes (two-gate: scope AND `platform.console.read`). Migration `0054_app_error_diagnostics` (additive + idempotent). Evidence: `tests/unit/observability-redact.test.ts` (57), `observability-fingerprint.test.ts` (15), `observability-on-request-error.test.ts` (18), `mcp-diagnostics-tools.test.ts` (28), `tests/integration/error-diagnostics.test.ts`, full unit suite 427 files / 3992 tests green. **Remaining owner action is unchanged** (Sentry DSN + alert rules); it is no longer on the critical path for "what broke". Live production proof of server-side capture still requires one deploy + a forced 500. |
| OPS-001 | Tested                           | §21, §24                                                                                                                           | Encrypted offsite backups, timed disposable restore, real OAuth/SMTP/MiniMax/Sentry validation and credential rotation.                                                                                                                                                                                                                                                                                                                                                                                                | Evidence in operations report; owner supplies/rotates external credentials.                               | M3a deploy chain live on `laratik-vps` (sha `c2355c9`, 2026-08-20). Parts the deploy chain now owns: VPS SSH (`VPS_HOST=217.154.124.83`, `VPS_USER=root`, `VPS_SSH_KEY=~/.ssh/claude_vps` — all wired in the repo), GHCR PAT (`GHCR_PAT` = fine-grained `read:packages` on LaraTik), Docker push + pull + login on the VPS. Parts the owner still owns: Sentry DSN + alert rules (was blocking OBS-001 production proof); restic offsite repo + OAuth app (current backups are local-only in `/var/backups/laratik-planner/`); Mailcow SMTP password for `no-reply@planner.laratik.com`; Google OAuth client id+secret; MiniMax API key; credential-rotation calendar for the 90-day PAT/SSH key.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## P2 quality and maintainability

| ID      | Status      | Required implementation                                                                                     | Acceptance                                                              | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | ----------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| QA-001  | Tested      | Split unit and integration configs; isolated disposable Postgres; no configuration-based skip.              | Unit, DB and coverage commands have distinct deterministic results.     | M3a `a7a6cd0`: `vitest.integration.config.ts` (separate config, single fork, 30s timeouts); `scripts/run-integration-tests.ts` + `scripts/run-e2e-tests.ts` both refuse URLs without `test` or `ci` in the host. Old `describe.skip` removed from `tests/integration/{discussions,schema}.test.ts`; replaced with a hard `TEST_DATABASE_URL` guard. Tested on `main` run `32306459911`: unit 51/51, integration 20/20, coverage passes the per-glob regression floor, 0 advisories.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| QA-002  | Implemented | Role-separated factories and realistic journeys; remove conditional assertions that allow missing controls. | Every assertion is mandatory for its fixture role; zero required skips. | M3 `f081c19` + `4b4b0bf`: `tests/integration/journey.test.ts` is the §23 4-step service-level primary acceptance journey (all 4 service-level journeys pass with role-separated accounts). The 2 conditional e2e assertions in `content-flow.spec.ts` and `workspace.spec.ts` were removed in favour of role-specific session bootstrap so the assertion is mandatory for its fixture role.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| QA-003  | Implemented | Coverage thresholds: critical domains 95/90; application services 85/80.                                    | CI fails below threshold.                                               | **Task 9 (2026-08-21, `feat/stitch-production`):** `vitest.config.ts` thresholds raised to the aspirational targets. Critical domains 95/90/95/95 (auth, security, content, deliveries, publishing, observability); application services 85/80/85/85 (channels, brand, storage, dashboard, workspaces, ai, email) with validation floored at 87/85/100/87 to keep the 1-point buffer required by the plan. Actual per-glob coverage post-Task 9: auth 96.15/92.09/97.67/96.15, security 100/94.11/100/100, content 99.56/92.76/100/99.56, deliveries 100/94.20/100/100, publishing 98.66/92.59/100/98.66, observability 100/97.50/100/100, channels 100/100/100/100, brand 99.75/93.75/100/99.75, storage 99.06/90.16/100/99.06, dashboard 100/96.15/100/100, workspaces 100/100/100/100, ai 100/87.87/100/100, email 100/100/100/100, validation 87.28/85.36/100/87.28. Workspaces functions, AI functions, and Email statements are all positive (non-zero) as the plan required. New unit tests added in `tests/unit/{auth,security,content,deliveries,publishing,observability,workspaces,email,validation}-*.test.ts` and `tests/unit/observability-*.test.ts` mock the DB boundary so the unit suite is fast. Integration tests remain a separate mandatory gate (`pnpm test:integration` with `TEST_DATABASE_URL` set). Gate self-test: removing `tests/unit/deliveries-service.test.ts` causes `pnpm test:coverage` to exit 1 with four `ERROR: Coverage ...` lines; restoring the file makes it exit 0. Full quality gate result: format, lint, typecheck, test:unit (82 files, 861/861 pass), test:coverage (pass with new thresholds), audit (no known vulnerabilities). `pnpm build` skipped in the worktree because the symlinked `node_modules` points outside the Turbopack sandbox; the change set adds no application code, only tests + threshold config, so the failure is environmental. **Re-tightened (2026-09-28):** the 2026-08-26 temporary relaxations are CLOSED. `pnpm test:coverage` was failing on clean `main` (`894f79e5`) with **14 threshold errors across 6 globs** plus the `src/**/*.ts` safety-net floor, because the tests promised in that comment block had never landed. Root gaps closed: `observability/app-errors.ts` 50.81% lines / 61.90% funcs (the whole triage read path — listAppErrorGroups, triageAppErrorGroup, getAppErrorDiagnostics, getAppErrorHealth, pruneAppErrorRetention, burst limiter — had never executed) → 98.61/100; `ai/{monthly-planning,instruction-packs,default-planning-pack,governance-index}.ts` all 0% → 100%; `content/enriched-list.ts` 0% → 100%; `content/inline-update.ts` 32.35% branches → 97.43%; `deliveries/service.ts` — `setMediaRequired` shipped in `4eadc7f1` with zero tests and the `decideApproval` notification fan-out was unreachable because the existing mock never primed the item-meta row (~125 dead lines) → glob 96.42/90.45/100; `auth/config.ts` 65.71% branches → 97.87; `storage/read-service.ts` 71.88% branches → 97.91. Floors raised to measured values, never lowered: auth 90→**95/90/95/95**, deliveries 85→**95/90/95/95**, content 65→**80/80/85/80**, ai 85→**90/84/90/90**, storage 85→**95/82/95/95**, channels 80/70/80/85→**85/75/83/85**, brand 85→**93/83/90/93**, dashboard 85→**96/90/95/96**, email 85→**92/86/95/92**, validation 87→**93/91/100/93**, workspaces 85→**100/100/100/100**; observability + publishing unchanged at 95/90/95/95. **`src/lib/security` stays at 93 and is the one glob short of its 95 target** — the residual is the `upload_sign` / `password_reset_request` rate-limit scopes, which are integration-covered but not unit-covered; the reason is recorded in `vitest.config.ts` rather than waived. Result: 440 files / 4,252 tests, zero threshold errors, `src/**/*.ts` floor satisfied. Pre-Task-9 baseline per-glob coverage: auth 15.27/88.67/28.12/15.27, security 60.82/100/80/60.82, content 40.17/90.56/52.94/40.17, deliveries 7.56/85.71/50/7.56, publishing 11.33/92.30/50/11.33, observability 75/65.21/69.23/75. |
| QA-004  | Implemented | Canonical visual baselines with dynamic values masked and reviewed diffs.                                   | Every canonical viewport has an approved baseline.                      | **Task 7 (`c2bfac5`, `a9fa300`, `3d40183`, 2026-08-21) + 2026-08-24 Build Identity update:** `tests/e2e/visual-regression.spec.ts` is wired for 39 route-backed exact-reference comparisons from 41 active captures (27 canonical + 11 responsive + 3 supporting; two evidence-group captures are reviewed separately), plus the 73 scoped responsive matrix baselines (23 unique route surfaces: 19 non-planning × 3 viewports [360, 768, 1440] and four planning × 4 viewports [375, 768, 1024, 1440]). Manifest is locked in `tests/e2e/stitch-cases.ts` and asserted by `tests/unit/stitch-cases.test.ts` (51 captures, 27/11/3/3/7 split, 41 active, 10 historical/superseded with successors). Dynamic data (timestamps, IDs, hash-like strings) is masked via injected CSS. 1% pixel-ratio tolerance. **Exact-clean rerun at `22aec64`: 73/112 assertions passed and 39 failed; no snapshots changed.** The planning header and cross-engine settings hydration defects identified during triage are fixed; remaining deltas require deliberate Stitch/reference review. The row remains `Implemented` until the reviewer approves the visual evidence; only independent review may promote it to `Verified`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| QA-005  | Tested      | WCAG 2.2 AA automated and manual keyboard, screen-reader, zoom and reduced-motion checks.                   | No serious/critical axe issue; manual checklist signed.                 | M3b `23706b1` + 2026-08-22 regression-guard (`53219c0`, merge `7f8b1dc`): `tests/e2e/a11y-routes.spec.ts` runs axe-core per authenticated route; `tests/e2e/auth-middleware.spec.ts` (19 tests) locks in the proxy auth contract that prevents the `<meta http-equiv="refresh">` WCAG 2.2.2 violation. **Exact clean HEAD `22aec64`: `pnpm test:a11y` passes 145/145 across all 5 Playwright projects (chromium, firefox, webkit, mobile-chrome, mobile-safari), with zero critical/serious violations and passing Arabic/RTL shell checks.** The automated side of QA-005 is Tested. Manual screen-reader / zoom / reduced-motion checklist is still pending the 27-row `ACCESSIBILITY_CHECKLIST.md` owner actions. The `meta-refresh` P1 #3 in `issues.md` is closed (resolved by the existing `src/proxy.ts`; the regression-guard prevents recurrence).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| DOC-001 | Tested      | Replace stale README, progress, architecture, testing and operations claims with evidence-backed status.    | No contradictory Goal status or nonexistent architecture remains.       | `56c621f` + `f5ee2a9` + `fd4f913` (PR #6): README, `docs/testing/strategy.md` and `docs/operations/runbook.md` updated to reflect the M3a/M3b truth. The `docs/production-readiness/*` bundle and `docs/implementation/progress.md` (now a pointer) were updated in M3b `23706b1`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## P3 architectural debt

| ID     | Status      | Source / gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Required implementation                                                                                                                                                                                                                                                                                                                                                                                              | Acceptance                                                                                                                                                                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AD-001 | Complete    | Master prompt §17 expects ~60 named components. Repo has 43 in `src/components/` (was 19 pre-2026-08-21); ~8 inlined forms/sections remain in route-local files (page.tsx + co-located `*-form.tsx` / `*-section.tsx` / `*-list.tsx`).                                                                                                                                                                                                                                                                                                                                                                                          | Continue extracting shared primitives and per-feature compositions. Extracted in 2026-08-21 batch: `FormSubmitButton`, `PlanningFilters`, `DataTable`, `KpiTile`, `CommentItem`, `CommentForm`, `WorkflowBoard`, `RecentItemsCard`, `ReviewRow`, `NotificationItem`. Task 12 pass added: `CalendarEventCard`, `ApprovalTimeline`, `DeliveryVersionList`, plus the new `listDeliveryVersionsForItem` server function. | Each extracted component: typed props, 100% prop-coverage unit tests, no visual diff in the consuming page, at least 2 consumer pages using the same primitive.                  | `docs/production-readiness/DESIGN_AUDIT.md` (2026-08-19 audit + 2026-08-21 Brand Kit + 2026-08-21 Task 12 cleanup sections) + the 2026-08-21 refinement log above. Not a release blocker: every screen renders, every behavior is tested at integration + E2E level.                                                                                                                                                                                                                                                                                                                                                                                            |
| AD-002 | In Progress | Review 2026-10-20: full tree lacks feature ownership; Trends catalog pilot completed. Confirmed and fixed Trends policy drift/review gate, rich PageHeader markup, Brand Kit stale server-rendered lists, agency-switch navigation race, stale workflow views after assignment, delivery, and publication outcomes, account-theme route mismatch, discussion visibility/refresh defects, deep-link hydration mismatch, and invalid watchlist URL handling. Canonical agency routes and role chips corrected across affected E2E fixtures. Historical findings, forms, cron scaffolding, and route review remain in the backlog. | Complete inventory and reconcile historical findings; adopt `module-ownership.md`; migrate one feature slice at a time; fix only confirmed high-risk defects.                                                                                                                                                                                                                                                        | Evidence-backed backlog; each extraction has one owner and regression coverage; contracts remain stable except separately reviewed bug fixes; required gates pass at clean HEAD. | `docs/audits/ARCHITECTURE_REVIEW_2026-10-20.md`; Trends parity/review-gate tests; PageHeader, Brand Kit, agency-switcher, and workflow refresh regressions; full §23 and account-theme Chromium journeys pass; 76/77 affected Chromium cases passed before A16 fix, then 4/4 research teardown/watchlist tests passed; full integration + migration drill passed before current test-only edits; focused visual suite passed 18/18 on exact implementation SHA `7e4e4b13c590d31f080ff71480903addd33d10ea`; `pnpm verify` passed on that SHA; full five-browser release matrix, manual review of every route, and independent reviewer verification remain open. |

**AD-002 architecture-refinement batch (2026-10-21):** The ownership manifest
now accounts for the canonical 91-page route tree and its focused browser
areas. Confirmed fixes include the lead-time setup state, media-folder
classification, the invalid typography token, workspace AI tenant scope, and
the missing-key status label. Bounded ownership changes move media sharing,
folder management, imports, trash lifecycle, and library commands behind
server-only feature entry points; route adapters now use the media feature
entry point. The library review fixed cross-workspace folder moves and storage
object reuse during duplication. AI settings, workspace Settings, and
workspace Media have bilingual five-width visual and accessibility evidence;
the media snapshot harness normalizes only the disposable agency UUID while
component coverage preserves the real value. Exact clean-SHA verification,
media integration, and migration-drill evidence are recorded in
`docs/production-readiness/TEST_EVIDENCE.md`. R2 production UAT, broader manual
route review, the full five-browser release matrix, and independent review
remain open before `Tested`.

## M1 — Multi-agency tenancy and authorization

> **2026-08-22** — Milestone 1 of the M1 program lands on `feat/m1-multi-agency`. The schema, runtime, and policy layer are no longer single-agency: a second agency can coexist with the production agency, two agencies with the same workspace slug don't collide, cross-tenant reads are denied with `404` (anti-IDOR), and platform authority is disjoint from agency authority. The cookie is HMAC-signed, the resolver is fail-closed, and the singleton invariant is gone. Sub-task evidence below; architecture is documented in `docs/architecture/authorization.md`, `docs/architecture/data-model.md`, and `docs/architecture/overview.md`.

| ID    | Status | Source / scope                                                        | Required implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Acceptance and required tests                                                                                                                                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | ------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1.1  | Tested | M1 plan §1.1 — `platform_administrator` table + backfill              | New `platform_administrator(user_id PK, granted_by, granted_at, revoked_at, reason)` table; `src/lib/auth/platform-admin.ts` (`isPlatformAdmin`, `requirePlatformAdmin`); migration `0007_platform_administrator.sql` backfills every existing `is_agency_admin = true AND status = 'active'` user as a platform admin.                                                                                                                                                                                                                                                                         | Unit tests for membership, revocation, actor-deleted, never-throws-for-non-admin.                                                                                       | M1.1 `2ea37fc` `feat(db+auth): add platform_administrator table and backfill (M1.1)` — `src/lib/db/schema/identity.ts:135-149` (table), `src/lib/auth/platform-admin.ts` (helpers, `PermissionDeniedError("platform-admin-required")`), `tests/unit/platform-admin.test.ts` (membership + revocation + actor-deleted + non-admin paths).                                                                                                                                       |
| M1.2  | Tested | M1 plan §1.2 — agency context cookie (signed, HttpOnly)               | `src/lib/auth/agency-context.ts` exports `AGENCY_CONTEXT_COOKIE_NAME = "laratik_active_agency"`, `encodeAgencyContext` / `decodeAgencyContext` (HMAC-SHA-256 with `AGENCY_COOKIE_SECRET`, base64url payload `<agency_id>.<expires_at_unix>.<user_id>`), `setActiveAgencyCookie` / `clearActiveAgencyCookie`. HttpOnly + Secure + SameSite=Lax + 8h Max-Age.                                                                                                                                                                                                                                     | Unit tests for roundtrip, tamper-rejection, expiration, wrong-secret rejection.                                                                                         | M1.2 `2cfbc32` `feat(auth): HMAC-signed HttpOnly agency context cookie (M1.2)` — `src/lib/auth/agency-context.ts:70-306` (encoder, decoder, constant-time HMAC check, DB membership re-check on every decode). `tests/unit/agency-context-cookie.test.ts` covers roundtrip + tamper + expiry + wrong-secret + non-member-after-revoke.                                                                                                                                         |
| M1.3  | Tested | M1 plan §1.3 — `resolveActiveAgencyContext` resolver (priority chain) | Resolver in `src/lib/auth/agency-context.ts` (steps: explicit `requestedAgencyId` → cookie → single-membership fallback). Each step is fail-closed: an explicit denial or a tampered/expired/missing-membership cookie returns `null` and does NOT fall through. Result is `{ agencyId, source: 'requested' \| 'cookie' \| 'fallback-single-agency' }`.                                                                                                                                                                                                                                         | Unit tests for fallback ordering, cookie match, requested-denied, requested-granted, no-membership, multi-membership deterministic.                                     | M1.3 `d8109c5` `feat(auth): resolveActiveAgencyContext resolver with priority chain (M1.3)` — `src/lib/auth/agency-context.ts:308-490` (resolver, `findSingleActiveAgency` with `limit(2)` short-circuit). `tests/unit/resolve-active-agency.test.ts` covers the priority chain and the fail-closed semantics.                                                                                                                                                                 |
| M1.4  | Tested | M1 plan §1.4 — wire agency context into `/app/w/[slug]` resolution    | `findWorkspaceBySlug(actor, slug, agencyId?)` in `src/lib/workspaces/context.ts`; `/app/(app)/app/w/[slug]/layout.tsx` accepts `?agency=<id>` or cookie and threads the resolved `agencyId` into the lookup. Cross-agency slug access denied with `404` (anti-IDOR), not `403`.                                                                                                                                                                                                                                                                                                                 | Unit + E2E: two agencies, same slug, second-actor 404s on `/app/w/<slug>`; `?agency=<other>` also 404s.                                                                 | M1.4 branch `feat/m1-multi-agency-1.4` — `src/lib/workspaces/context.ts` (param `agencyId`), `src/app/(app)/app/w/[slug]/layout.tsx` (cookie + `?agency=` resolution), `tests/unit/workspace-context-isolation.test.ts` (two-agency, same-slug, deny path). Plan reference: `docs/m1-multi-agency/PLAN.md` §1.4. The plan's E2E counterpart (`tests/e2e/workspace-tenant-isolation.spec.ts`) is owned by the tenant-isolation suite in M1.9 and is covered there.              |
| M1.5  | Tested | M1 plan §1.5 — agency switcher UI                                     | `src/components/app-shell/agency-switcher.tsx` (Radix Popover + Command) wired into the sidebar above the workspace switcher; `listActorAgencies(actor)` data source in `src/lib/auth/agency-context.ts`. Selecting an agency atomically navigates to the new agency's first accessible workspace (`/app/w/<slug>`), re-issues the signed `laratik_active_agency` cookie, and surfaces a Sonner error toast if the server action refuses (e.g. revoked membership, missing `AGENCY_COOKIE_SECRET`). See ADR 0008 for the atomic-navigation contract that superseded the v1 `?agency=<id>` push. | Unit: `listActorAgencies` ordering, deactivated filter, `isAdmin` correctness. E2E: multi-membership user sees both agencies, switching round-trips through the cookie. | M1.5 branch `feat/m1-multi-agency-1.5` — `src/components/app-shell/agency-switcher.tsx` (new), `src/lib/auth/agency-actions.ts` (new — `setActiveAgency` server action), `tests/unit/list-actor-agencies.test.ts` (new), modified `tests/unit/app-shell/sidebar.test.tsx` (agency-switcher mount assertion). Plan reference: `docs/m1-multi-agency/PLAN.md` §1.5.                                                                                                              |
| M1.6  | Tested | M1 plan §1.6 — replace `activeAgencyId()` callsites                   | New `src/lib/auth/current-actor.ts::currentActor()` returns `{ id: session.user.id }` or throws. All 30+ production callsites of `activeAgencyId()` rewritten to `currentActor()` + `resolveActiveAgencyContext(actor)`. `activeAgencyId()` is `@deprecated` and survives only in the bootstrap path.                                                                                                                                                                                                                                                                                           | Unit: sample of the most-trafficked callsites (agency-settings/ai, workspaces, users, w/[slug]/*) — new resolver returns equivalent results.                            | M1.6 branch `feat/m1-multi-agency-1.6` — `src/lib/auth/current-actor.ts` (new), 30+ callsites rewritten across `src/app/(app)/app/agency-settings/**`, `src/app/(app)/app/users/**`, `src/app/(app)/app/w/[slug]/**`, `src/lib/auth/{invitations,policy}.ts`, `src/lib/workspaces/context.ts`, `src/lib/ai/feature-settings.ts`, `src/app/api/ai/generate/route.ts`. `tests/unit/replace-active-agency-id.test.ts` (new). Plan reference: `docs/m1-multi-agency/PLAN.md` §1.6. |
| M1.7  | Tested | M1 plan §1.7 — drop the `singleton_key` constraint                    | Migration `0008_drop_agency_singleton_constraint.sql` drops `agency_singleton_true` check + `agency_singleton_unique` index, makes `singleton_key` nullable, then asserts pre-flight (`count(*) = 1` AND no `WHERE singleton_key = true` callsites). Drizzle schema: `singletonKey` removed from `agencies`. `activeAgencyId()` is removed; bootstrap uses `firstAgencyForBootstrap()`.                                                                                                                                                                                                         | Integration: create two agencies, both persist; two workspaces with the same slug in different agencies, both persist; cross-agency access denied.                      | M1.7 branch `feat/m1-multi-agency-1.7` — `src/lib/db/migrations/0008_drop_agency_singleton_constraint.sql` (new), `src/lib/db/schema/identity.ts` (singletonKey removed), `src/lib/auth/bootstrap.ts` (replaced global lookup with `firstAgencyForBootstrap()`), `src/lib/auth/policy.ts` (no more global helper), `tests/integration/agency-singleton-constraint.test.ts` (new). Plan reference: `docs/m1-multi-agency/PLAN.md` §1.7.                                         |
| M1.8  | Tested | M1 plan §1.8 — platform routes (`/app/platform/*`)                    | New `src/app/(app)/app/platform/` route group: `overview/page.tsx` (KPIs), `agencies/page.tsx` (list), `agencies/[agencyId]/page.tsx` (detail). `layout.tsx` calls `requirePlatformAdmin(actor)`; non-admins see a "Forbidden" message (not a redirect — keeps the URL stable for the audit log). `src/lib/auth/platform-admin-gate.ts` is the boundary helper.                                                                                                                                                                                                                                 | E2E: non-platform-admin sees forbidden; platform admin sees the list. Unit: layout gate returns the forbidden state when the check fails.                               | M1.8 branch `feat/m1-multi-agency-1.8` — `src/app/(app)/app/platform/` (new — overview, agencies, agencies/[id]), `src/lib/auth/platform-admin-gate.ts` (new), `tests/e2e/platform-overview.spec.ts` (new — admin sees list, non-admin sees forbidden), `tests/unit/platform-layout-gate.test.ts` (new). `tests/e2e/_helpers.ts` extended with the platform-admin devSeed path. Plan reference: `docs/m1-multi-agency/PLAN.md` §1.8.                                           |
| M1.9  | Tested | M1 plan §1.9 — tenant isolation test suite                            | Two agencies (A, B) with one member each and one workspace each, same slug. Member A at `/app/w/<slug>` → A's workspace; `?agency=<B>` → 404; PATCH `/api/workspaces/<B's id>` → 403; A cannot list B's invitations / channels / members. Service-layer tests cover `isAgencyAdmin(actor, agencyId)`, `canAccessWorkspace`, `canReview`, `canManageContent` for the cross-agency case.                                                                                                                                                                                                          | All cross-agency denials are tested at unit + E2E.                                                                                                                      | M1.9 branch `feat/m1-multi-agency-1.9` — `tests/e2e/tenant-isolation.spec.ts` (new — two-agency journey: workspace visibility, `?agency=` denial, PATCH denial, list-deny on invitations/channels/members), `tests/unit/cross-agency-tenant-deny.test.ts` (new — service-layer denies for every policy helper when the resource is in a different agency). Plan reference: `docs/m1-multi-agency/PLAN.md` §1.9.                                                                |
| M1.10 | Tested | M1 plan §1.10 — architecture documentation + tracker update           | `docs/architecture/authorization.md` (new) — "Platform authority vs. agency authority" + "Agency context resolution" (priority chain, source field, fail-closed semantics, cookie format, anti-IDOR, bootstrap exception). `docs/architecture/data-model.md` (new) — `platform_administrator` table; singleton invariant removed; cross-agency slug uniqueness on workspaces. `docs/architecture/overview.md` — runtime diagram updated for multi-agency + platform-admin separation. This tracker section.                                                                                     | Docs reflect the new state; M1 items below are `Tested` with one-line evidence.                                                                                         | M1.10 commit (this row) `docs(architecture): multi-agency + platform admin docs + M1 tracker (M1.10)` on `feat/m1-multi-agency-1.10`. The three architecture docs (authorization, data-model, overview) are now in `docs/architecture/`. The PRODUCTION_READINESS_TRACKER's M1 section is the canonical status for the milestone; only an independent reviewer may move these rows to `Verified`.                                                                              |

**Sub-task sequence on `feat/m1-multi-agency`:** `2ea37fc` (M1.1) → `2cfbc32` (M1.2) → `d8109c5` (M1.3) → `feat/m1-multi-agency-1.4` → `1.5` → `1.6` → `1.7` → `1.8` → `1.9` → `1.10`. Architecture docs:
`docs/architecture/authorization.md`, `docs/architecture/data-model.md`, `docs/architecture/overview.md`. Plan: `docs/m1-multi-agency/PLAN.md`. **No M1 row is `Verified`** — the `Verified` transition is the independent reviewer's, per the status protocol at the top of this file.

### 2026-08-23 independent implementation-review correction

This note supersedes the browser-evidence wording in M1.4, M1.5, and M1.9. Commit `6009904` replaced the former `skip`/`fixme` placeholders with executable Playwright coverage in `agency-switcher.spec.ts`, `tenant-isolation.spec.ts`, and `workspace-tenant-isolation.spec.ts`; the focused group passes 10/10 and the repository contains no `test.skip`, `test.fixme`, or skipped suites. The actual browser contract is that the signed active-agency context remains authoritative: a hostile `?agency=<foreign-id>` value is ignored, the current agency's workspace remains visible, and foreign tenant data never appears. Cookie-based switching succeeds only for an active membership. The previously named PATCH/list examples do not exist as application routes and are therefore not valid browser contracts; cross-agency denials for the supported service boundaries remain covered by 12 unit policy cases and 3 integration client-isolation cases. These corrections narrow stale evidence claims without weakening the tenant boundary.

## Platform access roles — least-privilege global operations

> **2026-08-25** — The binary Platform Admin assignment is replaced by one
> closed role per active assignment. Existing rows migrate to Platform Owner,
> so deployment is access-compatible. Exact service permissions remain
> separate from agency/workspace membership and from approved support grants.
> Status is capped at `Tested`; an independent reviewer has not assigned
> `Verified`.

| ID     | Status      | Required implementation                                                                                | Acceptance                                                                                                                 | Evidence                                                                                                                                                                                      |
| ------ | ----------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PAR-01 | Tested      | Additive role migration and closed schema vocabulary.                                                  | Four roles only; existing active rows become Owner; partial Owner index and updated timestamp exist.                       | `0018_platform_access_roles`; migration/schema unit guards; real-Postgres constraint coverage in `tests/integration/platform-access.test.ts`.                                                 |
| PAR-02 | Tested      | Central role-to-permission DAL with fail-closed lookup.                                                | Revoked/malformed/missing assignments deny; services require exact permissions rather than console-entry checks.           | `src/lib/auth/platform-access.ts`; `tests/unit/platform-access.test.ts`; agency/entitlement/support focused service regressions.                                                              |
| PAR-03 | Tested      | Serialized role grant/change/revoke, audit, and last-Owner invariant.                                  | Mutation + audit are atomic; failed audit rolls back; concurrent Owner removals leave one active Owner.                    | `src/lib/platform/access.ts`; `tests/unit/platform-admins.test.ts`; `tests/integration/platform-access.test.ts`.                                                                              |
| PAR-04 | Tested      | Role-aware agency lifecycle and support operations.                                                    | Operator cannot archive; archived restore is rejected; only Owner unarchives; support requests remain separately approved. | `tests/integration/platform-agencies.test.ts`; `tests/unit/platform/agency-permission-ui.test.tsx`; `tests/unit/platform/support-request-form.test.tsx`; `tests/unit/support-access.test.ts`. |
| PAR-05 | Tested      | Platform Access UI, role-aware navigation, compatibility redirect, and responsive behavior.            | Auditor is read-only; unauthorized controls absent; 44px actions; no overflow across six viewports; old URL is 308.        | `tests/e2e/platform-access.spec.ts` and `platform-access-responsive.spec.ts`: selected Chromium role group 11/11 PASS on disposable PostgreSQL.                                               |
| PAR-06 | Implemented | ADR, bootstrap/recovery, quarterly review, testing contract, migration/rollback, and release evidence. | Emergency SQL grants Owner explicitly; old-image rollback revokes active non-Owners first; no self-claimed Verified.       | ADR 0005, `docs/agency-setup.md`, authorization/testing docs, and production-readiness evidence bundle. Full verification evidence is appended only after the commands complete.              |

## Milestone 2 — plans, quotas, AI ceilings, and platform console

> Implementation branch: `feat/m2-multi-agency`. Status ceiling is `Tested`; independent review is required for `Verified`. Detailed scope: `docs/m2-multi-agency/PLAN.md`. Architecture decision: `docs/decisions/0002-multi-agency-saas-entitlements.md`.

| ID    | Status | Required implementation                                                                                                     | Acceptance                                                                                                                          | Evidence                                                                                             |
| ----- | ------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| M2.1  | Tested | Plan templates, agency entitlements/change history, threshold events, platform audit, lifecycle columns, additive backfill. | Four seeded plans; append-only history; compatible existing-agency backfill; migrations through `0011`.                             | Migrations `0009`–`0011`; schema/unit/integration coverage; ledger-safe 4/4 migration drill.         |
| M2.2  | Tested | Effective entitlement resolution and atomic plan changes.                                                                   | Template defaults merge with replacement overrides; change + audit commit or roll back together; reason required.                   | `src/lib/entitlements/`; plan-service unit and integration tests.                                    |
| M2.3  | Tested | Usage counters, cycle-aware AI resources, 80/90/100 threshold events.                                                       | Per-resource counters remain independent; duplicate threshold events are suppressed within a cycle.                                 | Usage unit/integration suites and database constraints.                                              |
| M2.4  | Tested | Transactional quota reservations at every supported create/release boundary.                                                | Concurrent and bulk requests cannot oversell; total plus platform profile limits are all-or-nothing; structured limit error.        | Advisory-lock integration cases; workspace, invitation/member, channel, and AI wiring tests.         |
| M2.5  | Tested | Four-step Add Agency drawer and atomic provisioning.                                                                        | Organization → admin → plan/limits → review; no empty override payload; email only after commit; delivery failure is a warning.     | `91e2fd9`; provisioning component, service, rollback, and integration tests.                         |
| M2.6  | Tested | Platform overview, agency listing, and lifecycle actions.                                                                   | KPI/list surfaces are platform-only; suspend/archive block tenant resolution; restore is recoverable; audit rows written.           | Platform page/action tests and lifecycle gate tests.                                                 |
| M2.7  | Tested | Agency detail Plan tab and plan/lifecycle controls.                                                                         | Effective plan and overrides visible; lower limits preserve data and block only new allocation; old overrides do not leak.          | Plan UI/action tests plus entitlement integration cases.                                             |
| M2.8  | Tested | Agency detail AI tab and enforcement.                                                                                       | Global flag ∩ plan ceiling ∩ agency allowlist; 501 capabilities reserve nothing; request/token limits reconcile on success/failure. | AI route/service tests and usage-metrics UI coverage.                                                |
| M2.9  | Tested | Read-only agency-admin Plan & Usage screen.                                                                                 | Current/limit/threshold state for workspace, users, profiles, storage, and AI; no tenant self-edit.                                 | Route authorization and page-render tests.                                                           |
| M2.10 | Tested | Portable database, browser-isolation, build, coverage, and evidence gates.                                                  | No skipped required tests; restored DB keeps real migration ledger; production build, coverage floors, and tenant journey pass.     | `f098d6d`, `6009904`, `4409f7e`, `0f5b5bc`, `1a75dc3`; `docs/production-readiness/TEST_EVIDENCE.md`. |

## Milestone 3 — AI governance and controlled support access

> **2026-08-24** — Implementation branch `feat/m3-ai-governance-and-support-access` lands M3 in 7 sub-tasks. The AI capability intersection is server-enforced (`resolveEnabledCapabilities`); the per-user daily AI budget is enforced inside the same transaction as the monthly reservation (`enforceAiBudget`); the support-access workflow replaces any implicit-impersonation model with a ticketed request → agency-admin approval → grant → tenant-view flow. Every state transition and every view through an active grant is audited in `support_access_audit` (append-only, trigger-enforced). A persistent banner surfaces the active session on every (app)/* page the platform admin lands on. Architecture: `docs/architecture/ai-governance-and-support-access.md`. Plan: `docs/m3-ai-governance-support/PLAN.md`.

| ID   | Status | Required implementation                                                              | Acceptance                                                                                                                                                                                                        | Evidence                                                                                                                                                     |
| ---- | ------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M3.1 | Tested | Support access + AI daily budget schema; append-only audit; additive backfill.       | Migration 0012 lands on an empty DB; new tables and triggers install cleanly; agency / workspace / user data unchanged.                                                                                           | `src/lib/db/migrations/0012_support_access_grants.sql`; Drizzle schema `src/lib/db/schema/support.ts`.                                                       |
| M3.2 | Tested | Ticketed support-access workflow service (create / decide / revoke / expire / gate). | Authority split enforced (platform admin vs agency admin); UNIQUE on request_id blocks double approval; revocation immediately deactivates; expiry sweep flips status.                                            | `src/lib/support/access.ts`; `tests/unit/support-access.test.ts` (15 cases); `tests/integration/support-access.test.ts` (7 cases).                           |
| M3.3 | Tested | AI capability intersection and per-user daily budget enforcement.                    | Agency can never widen beyond plan ceiling; daily counter cap throws `LimitExceededError` (route 429); reconciliation refunds unused tokens.                                                                      | `src/lib/ai/governance.ts`; `tests/unit/ai-governance.test.ts` (9 cases); `tests/integration/ai-governance.test.ts` (4 cases).                               |
| M3.4 | Tested | Platform console security tab + agency admin request list.                           | Platform-only access to security console; cross-agency workspace scope rejected (IDOR); agency admin sees pending requests; no tenant self-edit.                                                                  | `/app/platform/security/{page,actions}.tsx`; `/app/platform/agencies/[agencyId]/support-section.tsx`; `/app/agency-settings/plan/support-requests-card.tsx`. |
| M3.5 | Tested | Persistent support-session banner for active grants.                                 | Banner appears on every (app)/* page when the platform admin holds an active grant; revocation / expiry remove the banner on the next request; React 19 purity rule respected (`Date.now()` moved to the layout). | `src/components/app-shell/support-session-banner.tsx`; `src/app/(app)/layout.tsx` integration.                                                               |
| M3.6 | Tested | Unit + integration tests for the full M3 surface.                                    | 1,374 unit tests + 98 integration tests green; `pnpm verify` clean; no skipped required tests.                                                                                                                    | `pnpm test:unit` 1,374/1,374; `TEST_DATABASE_URL=… pnpm test:integration` 98/98; `pnpm verify` exits 0.                                                      |
| M3.7 | Tested | Architecture doc, M3 plan, and tracker update.                                       | New `docs/architecture/ai-governance-and-support-access.md` describes the gate, audit, and intersection; M3 row visible in this tracker; no M1 / M2 regression.                                                   | `docs/m3-ai-governance-support/PLAN.md`; this section; full integration suite re-runs at 98/98.                                                              |

**Sub-task sequence on `feat/m3-ai-governance-and-support-access`:** `05982c4` (M3.1) → `c9d0288` (M3.2) → `7424cb1` (M3.3) → `(M3.4 platform+security)` → `4701985` (M3.5) → `b4fc136` (M3.6). Architecture: `docs/architecture/ai-governance-and-support-access.md`. Plan: `docs/m3-ai-governance-support/PLAN.md`. **No M3 row is `Verified`** — the `Verified` transition is the independent reviewer's, per the status protocol at the top of this file.

## Milestone 4 — Publish-ready Post and Reel packages

> **2026-08-24** — Implementation branch `feat/m4-publish-packages` (in the worktree `../laratik-planner-m4`) lands M4 in 4 atomic commits. The publish package is a Zod discriminated union covering Instagram Post, Instagram Reel, Facebook, TikTok, LinkedIn, YouTube, Pinterest, X, and Other. Every material edit routes through a central materiality service that increments the content item's revision, resets pending approvals, records an immutable `activity_event` row, and notifies reviewers. A server-authoritative readiness service evaluates blockers per platform (hashtags are never globally mandatory). The publish UI lives at `/app/w/[slug]/planning/[id]/publish` with a 3-column desktop layout, accordion mobile layout, sticky bottom action bar, and 44px touch targets. Plan: `docs/m4-publish-packages/PLAN.md`.

| ID   | Status | Required implementation                                                                | Acceptance                                                                                                                                             | Evidence                                                                                                                                                             |
| ---- | ------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M4.1 | Tested | Zod schemas for every platform + common fields + discriminated union.                  | 9 platforms in the discriminated union; common fields shared via `merge()`; `PLATFORM_KEYS` export; 19 unit tests cover happy + error paths.           | `src/lib/publishing/payload-schemas.ts`; `tests/unit/payload-schemas.test.ts` (19 cases).                                                                            |
| M4.2 | Tested | Platform payload service (save / read / clear / final-copy approval) + IDOR gate.      | Draft saves strip browser approval metadata; agency-admin approval is server stamped; material edits revoke it; cross-workspace access is rejected.    | `src/lib/publishing/platform-payload-service.ts`; 21 focused unit cases + `tests/integration/publishing-m4.test.ts` approval/IDOR cases.                             |
| M4.3 | Tested | Central materiality service (revision + approval reset + audit + notify).              | Revision increment is atomic; pending approvals are cancelled; audit row is written; reviewers are notified. Administrative changes skip all of this.  | `src/lib/publishing/materiality.ts`; `tests/integration/publishing-m4.test.ts` "saving a payload increments revision" + "internal note does NOT increment revision". |
| M4.4 | Tested | Server-authoritative readiness service (blockers + recommendations + AI fold-in).      | `confirmPublishReadiness` re-checks role, blockers, workflow status and revision, then records an immutable event; hashtags remain optional.           | `src/lib/publishing/readiness.ts`; 17 readiness unit cases + integration confirmation case.                                                                          |
| M4.5 | Tested | New route `/app/w/[slug]/planning/[id]/publish` + 3-column desktop + accordion mobile. | Page renders summary/tabs; labelled responsive fields, live status/errors, 44px targets, admin approval and server readiness commands are operational. | Publish route files; `tests/e2e/publish-package.spec.ts` 2/2; authenticated publish-route axe case passes.                                                           |
| M4.6 | Tested | Integration tests for the full M4 surface.                                             | 1,469 unit tests + 106 integration tests green; coverage and `pnpm verify` clean; no M1 / M2 / M3 regression.                                          | `pnpm test:unit` 1,469/1,469; `TEST_DATABASE_URL=… pnpm test:integration` 106/106; publishing library 98.93% statements.                                             |
| M4.7 | Tested | M4 plan + tracker update.                                                              | New `docs/m4-publish-packages/PLAN.md` describes the schemas, materiality, readiness, and UI; M4 row visible in this tracker.                          | `docs/m4-publish-packages/PLAN.md`; this section.                                                                                                                    |

**Sub-task sequence on `feat/m4-publish-packages`:** `8dde94c` (M4.1–M4.4 services) → `03aae35` (M4.5 UI) → `a7b86c4` (M4.6 tests) → `9c21d40` (M4.7 docs). Plan: `docs/m4-publish-packages/PLAN.md`. **No M4 row is `Verified`** — the `Verified` transition is the independent reviewer's, per the status protocol at the top of this file.

## Milestone 6 — Database-configured, agency-scoped R2 storage

> **2026-09-06** — Implementation is present on `codex/agency-r2-storage`. R2 connection details and encrypted credentials are database-managed; no R2-specific environment variables are used. The migration remains additive and local-volume access is retained for the documented rollback window. This milestone is `Implemented`, not independently `Verified`: external R2 UAT, browser upload/preview checks, migration of production media, restore evidence including the persistent encryption key, and operational billing alerts remain deployment work.

| ID   | Status      | Required implementation                                                                                                           | Acceptance                                                                                                                                                                                                               | Evidence                                                                                                                                                 |
| ---- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S6.1 | Implemented | Platform-managed R2 config, encrypted credentials, platform audit, connection test, agency config and quota summary.              | Platform owner can configure/test without secrets being returned; agency admin sees usage, reservations, quota and warnings.                                                                                             | `src/lib/storage/config.ts`; `/app/platform/storage`; `/app/agency-settings/storage`; `docs/decisions/0010-r2-agency-storage.md`.                        |
| S6.2 | Implemented | Provider-neutral adapter, direct signed upload/read flow, intent state machine, quota reservation/release, tenant checks.         | Authorized uploads complete through R2 without VPS buffering; cross-agency reads/writes are denied; failed/expired uploads release quota.                                                                                | `src/lib/storage/adapter.ts`, `r2-adapter.ts`, `intent-service.ts`; upload and object routes; storage unit tests.                                        |
| S6.3 | Implemented | Additive schema, agency prefixes, object references, local-to-R2 migration utility, cleanup cron, health signal and bilingual UI. | From-zero, upgrade, restore and repair migrations succeed; legacy local media remains available during rollback; all new UI is EN/AR.                                                                                    | Migration `0033_r2_storage`; `scripts/migrate-local-uploads.ts`; `scripts/vps/storage-cleanup.sh`; `pnpm migration-drill` 5/5 PASS; `pnpm verify` green. |
| S6.4 | Pending     | Production rollout and operational evidence.                                                                                      | Backup + migration + restore rehearsal, real R2 credential rotation, browser E2E/a11y/visual evidence, orphan reconciliation, thumbnails/posters, multipart for large media, and Cloudflare billing alerts are complete. | Runbook and evidence bundle updates required before independent review.                                                                                  |

## Milestone 7 — Agency/workspace media library

> **2026-09-07** — The media catalog and upload/import vertical slice is
> implemented in the current worktree. It adds workspace and agency views,
> direct-to-configured-storage uploads, public-link imports with provider
> detection, bilingual provenance/status UI, safe naming, quarantine, and a
> guarded legacy migration utility. No legacy media data currently exists.
> This milestone is `Implemented`, not independently `Verified`: production
> R2 UAT, browser evidence, malware scanning, previews, resumable uploads,
> OAuth connectors, and restore/reconciliation evidence remain open.
>
> **2026-09-08** — Media sharing and organization is implemented on the
> isolated feature branch: workspace folders with `Unfiled`, upload/move
> destinations, rename/archive behavior, internal agency-share feedback,
> and expiring image-only public links with anonymous view/download,
> WhatsApp/native/copy actions, token hashing, rotation, revocation, rate
> limiting, and generic unavailable responses. Migration `0036_media_sharing`
> passed the migration drill; independent browser, accessibility, visual, and
> production-storage evidence remains open.

| ID   | Status      | Required implementation                                                                                                 | Acceptance                                                                                                                                                                                                                                                               | Evidence                                                                                                                                                                                                                                                                   |
| ---- | ----------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M7.1 | Implemented | Logical media catalog, explicit consuming links, workspace ownership, agency visibility, and lifecycle.                 | Every asset has one owning workspace; access is role-checked; processing/failed/trashed assets are not downloadable.                                                                                                                                                     | `src/lib/db/schema/media.ts`; migration `0034_media_catalog`; `src/lib/media/service.ts`; `/app/media`; `/app/w/[slug]/media`; ADR 0011.                                                                                                                                   |
| M7.2 | Implemented | Generic direct upload and server-mediated source import boundary, including per-agency R2 backends.                     | Browser files upload directly to the selected agency's configured private storage; HTTPS/public provider links are verified before catalog registration; managed and agency-owned R2 use one adapter contract.                                                           | `src/components/media/media-upload-form.tsx`; `src/components/media/media-link-importer.tsx`; `src/lib/media/source.ts`; `src/lib/storage/config.ts`; media import routes.                                                                                                 |
| M7.3 | Implemented | Safe naming, bounded signature/metadata validation, provider provenance, quarantine, cleanup, and legacy compatibility. | Keys are server-generated; misleading extensions are corrected; image dimensions are captured when available; failed objects are quarantined; migration is idempotent and guarded; legacy reports are versioned and testable.                                            | `src/lib/media/contract.ts`; `src/lib/media/validation.ts`; `src/lib/media/quarantine.ts`; `scripts/migrate-local-uploads.ts`; `0035_agency_owned_r2`; `docs/media-library-plan.md`.                                                                                       |
| M7.4 | Pending     | Production hardening and operational evidence.                                                                          | Malware scan, metadata/previews, resumable video, explicit duplicate reuse/copy UX, Drive/OneDrive OAuth, R2 UAT, E2E/a11y/visual, and restore/reconciliation evidence pass; folder/public-link behavior is implemented but still needs browser and production evidence. | `0036_media_sharing`; `src/lib/media/service.ts`; `/share/media/[token]`; `tests/integration/media-sharing.test.ts`; focused unit tests; `pnpm migration-drill` 5/5 PASS. The exact clean-commit evidence bundle and phases B–E remain required before independent review. |

## Final release gates

- [ ] All P0 and P1 rows are independently `Verified`. _(pending independent reviewer sign-off; every row is at least `Tested`)_
- [x] Zero required skipped/flaky tests. _(no test is `test.skip`-by-default any more — the visual baselines ship in `a9fa300` + `3d40183`; `tests/integration/global-setup.ts` was removed in `ba2d4fa`)_
- [x] Zero unaccepted critical/high dependency or secret-scan findings. _(post-M3a: 0 of 23; `pnpm audit --prod`)_
- [x] Coverage thresholds pass. _(per-glob regression floor restored to 95/90/95/95 critical + 85/80/85/85 services + 87/85/100/87 validation in `fd4a6e0` + `298edee`)_
- [x] Complete 30-step primary acceptance journey passes with separated accounts. _(`tests/integration/journey.test.ts` 4/4 service-level; M3 `f081c19`)_
- [x] All Section 24 functional, security, quality and operational gates have evidence. _(evidence bundle at `docs/production-readiness/{README,SCREEN_PARITY,TEST_EVIDENCE,SECURITY_AUDIT,MIGRATION_DEPLOYMENT,UAT_RELEASE,MIGRATION_DRILL_RESULTS}.md`)_
- [x] Canonical Stitch parity matrix has no unexplained gap. _(`docs/production-readiness/SCREEN_PARITY.md` — 27 rows including Forgot Password)_
- [x] From-zero and in-place migrations, backup, restore, failed-migration abort, and post-restore migrator compatibility are proven. _(`scripts/migration-drill.ts` + `MIGRATION_DRILL_RESULTS.md`; M2 ledger correction `0f5b5bc`)_
- [ ] Forward-fix schema rollback rehearsal is complete. _(application-image rollback and the forward-only procedure are documented; a destructive/down-migration drill remains intentionally deferred in `MIGRATION_DEPLOYMENT.md`)_
- [x] Production-like deploy verified end-to-end. _(deploy run `32346174802` (sha `c2355c9`, 2026-08-20) = `conclusion: success`; `https://planner.laratik.com/api/health` returns `{"ok":true,"version":"c2355c9...","env":"production","db":"up","schema":"ready"}`; Traefik + TLS resolution working; OAuth/magic-link/Sentry production checks are still owner-supplied secrets per OBS-001/OPS-001 sub-items)_
- [ ] Independent reviewer changes the shared release verdict to `READY`. _(pending Task 13 sign-off; current shared verdict is `READY FOR INDEPENDENT REVIEW` in this file + `UAT_RELEASE.md`)_

## 2026-08-21 — Evidence contracts (plan Task 8)

Three owner-side evidence contracts landed with Task 8. They are the
human / external-service side of the §23 / §24 release gate; the
automated axe-core sweep below is the automation side. All three
files are `Ready for independent review` — no row in the per-row
matrices is `Pass` until an operator runs the check on a real
account. **QA-005 moved to `Tested` on 2026-08-22** (see the QA-005
row above) after the meta-refresh P1 was closed by the existing
`src/proxy.ts` and the `tests/e2e/auth-middleware.spec.ts` 19-test
regression-guard was added (`53219c0` / `7f8b1dc`).

| Deliverable                                                                               | Status (2026-08-21)                                             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/production-readiness/ACCESSIBILITY_CHECKLIST.md`                                    | **created**                                                     | One row per canonical surface (27 rows from `tests/e2e/stitch-cases.ts` `classification === "canonical"`). Columns: keyboard-only, focus, screen-reader name/role/value + heading hierarchy, 200% zoom, reduced-motion, 360px reflow + 44px targets, reviewer, browser/AT, date, result, issue link. Empty value cells; reviewer fills them in Task 13.                                                                                                                                                                                                                                                                                                                                                             |
| `docs/production-readiness/EXTERNAL_SERVICES_UAT.md`                                      | **created**                                                     | One row per external-service check: Google OAuth (3), Mailcow SMTP (3), MiniMax AI (3), Sentry (4), encrypted offsite backup (2), credential rotation (5) = 20 rows. Columns: service, check, owner, environment, date, result, evidence link. Empty value cells; owner fills them in.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `docs/production-readiness/UAT_RELEASE.md` § "2026-08-21 — 30-step separated-account UAT" | **extended**                                                    | 30 steps enumerated from `STUDIOFLOW_MASTER_PROMPT.md` §23, 6 separated accounts (Maya / Omar / Elena / Jon / Sophie / Daniel) with their roles, and a 30-row record table (account / operator / date / environment / result / evidence link). Empty value cells; independent reviewer fills them in Task 13.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `pnpm test:a11y` (chromium, firefox, webkit, mobile-chrome, mobile-safari)                | **PASS — 50 / 50 axe-core checks across all 5 projects**        | The `meta-refresh` WCAG 2.2.2 violation that was reproduced in 2026-08-21 is **closed** by the existing `src/proxy.ts` (Next.js 16's replacement for the deprecated `middleware.ts` convention; the proxy returns a real 307 `NextResponse.redirect()` instead of a `<meta http-equiv="refresh">` tag). The bug is documented in `issues.md` (P1 entry #3, now closed). A 19-test regression-guard (`tests/e2e/auth-middleware.spec.ts`, `53219c0` / `7f8b1dc`) locks the contract: 8 unauthed `/app/*` paths return 307 with no meta-refresh; 5 public routes return 2xx; 3 NextAuth callback routes are not blocked; authed `GET /signin` redirects to `/app`; `POST /api/ai/generate` returns 3xx when unauthed. |
| `QA-005` row status                                                                       | **Tested** (was `Partial` until 2026-08-22)                     | Automated axe-core sweep is green across all 5 Playwright projects; `QA-005` can move to `Verified` only after the manual a11y checklist in `docs/production-readiness/ACCESSIBILITY_CHECKLIST.md` is signed off by the reviewer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Shared release verdict (this file + `UAT_RELEASE.md`)                                     | **`READY FOR INDEPENDENT REVIEW` (was `NOT PRODUCTION READY`)** | Evidence contracts in place; the §23 journey and every owner gate still need an actual `Pass` row from the independent reviewer before the orchestrator flips the verdict to `READY` (Task 13). Both the tracker and `UAT_RELEASE.md` now expose the same shared verdict with the same `2026-08-21` date.                                                                                                                                                                                                                                                                                                                                                                                                           |

The 2026-08-22 commit `53219c0` (merge `7f8b1dc`) closed the P1
described above. The next worker is the independent reviewer
(Task 13) who runs the §23 30-step UAT, signs the 27-row
`ACCESSIBILITY_CHECKLIST.md`, signs the 20-row
`EXTERNAL_SERVICES_UAT.md`, reruns and reviews the 73 scoped visual baselines
on the release candidate, and flips the shared release verdict to
`READY`.

## Milestone 5 — Planning Content Detail UX refactor

> **2026-08-30** — Implementation lands in 4 atomic commits on
> `main` (via the `ui-ux-pro-max` worktree, then merged
> forward). The Planning Content Detail page used to render
> every concern (header, workflow, blockers, brief, schedule,
> channels, creative brief, preview, AI, delivery, publishing,
> activity) in a single long scroll. The refactor splits the
> page into five task-oriented sections, each answering one
> question. No domain logic changed — workflow, publishing,
> delivery, permissions, approval, and persistence behaviour
> are all untouched. The change is information-architecture,
> interaction design, and component refactor only.
>
> **Sub-task sequence:**
> `9075459` (M5.1: five-section workspace + Creative tab +
> AiAssistancePanel) → `4605645` (M5.2: merge ui-ux-pro-max
> → main) → `51153af` (M5.3: Activity tab filters) →
> `af63844` (M5.4: wire OverviewCommandCenter into the page
> — second-pass review caught an unwired-component bug) →
> `68a49f6` (M5.5: drop unused Badge import).
>
> **New components:**
>
> | File                                                  | Purpose                                                                                                                                                                                                                                                               |
> | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | `src/components/planning/overview-command-center.tsx` | At-a-glance summary: Next Action card (workflow-aware headline + CTA), 4-line readiness list (Content / Creative / Publishing / Schedule) with deep links, at-a-glance content summary, recent activity preview (last 5 events). Hidden when the item is fully ready. |
> | `src/components/planning/ai-assistance-panel.tsx`     | Contextual AI launcher — small `✨ AI` button in the Content section opens a side panel with the full capability surface (Campaign ideas, Improve brief, Adapt to platform, Related format ideas, Check completeness). Per-field AI buttons remain inline.            |
> | `src/components/planning/activity-with-filters.tsx`   | Activity timeline with five filter chips (All / Comments / Workflow / Publishing / System) and stable per-bucket counts. `aria-pressed` on the active chip; `role="status"` on the empty filtered state.                                                              |
>
> **Updated types / components:**
> `WorkspaceTabId` gains `"creative"` (icon: `Palette`); tab
> order is now `overview / content / creative / publishing /
activity`. `data-testid="app-sidebar"` added to the Sidebar
> nav element.
>
> **Tests:** 13 new unit-test cases (7 for
> OverviewCommandCenter, 6 for ActivityWithFilters). Full
> suite: **2696 / 2696** pass. `pnpm typecheck`, `pnpm lint`,
> `pnpm build` all green. UI-004 row above updated with the
> three new SHAs.
>
> **Outstanding:** the 27-row
> `docs/production-readiness/ACCESSIBILITY_CHECKLIST.md`
> needs independent-reviewer sign-off for the 5 planning
> surfaces; the 30-step UAT in
> `docs/production-readiness/UAT_RELEASE.md` is still Task 13
> (independent reviewer).

## Milestone 5.6 — Final four-workspace planning contract (2026-10-02)

This supersedes the historical M5.1–M5.5 five-section navigation shape for the
planning detail route. The current contract is:

- `Overview`: read-only progress, blockers, freshness, details, and recent activity.
- `Create`: planning basics, format-specific creative fields, production notes,
  references, assets, and immutable delivery versions.
- `Publish`: canonical copy, translations, channel overrides, destinations,
  schedule, previews, readiness, approvals, and publishing actions.
- `Activity`: the complete audit timeline and filters.

Legacy hashes remain supported: `content`, `assets-versions`, and `delivery`
resolve to Create; `copy`, `preview`, `publishing`, and `messages` resolve to
Publish; `workflow` resolves to Overview.

The shared service layer now preserves role and field allowlists while removing
workflow-status locks from permitted edits in every non-cancelled status.
Material edits increment revisions and record activity, but do not cancel,
invalidate, recreate, or re-notify approval requests. New delivery versions
still create their own approval request, and internal edits never mutate an
already-published external post.

Evidence is in the current working tree: static verification (`format:check`,
lint, typecheck, and build), the disposable-database integration suite,
focused bilingual/a11y E2E, the focused §23 content-flow path, and the three
promoted planning visual references. The full unit run had one unrelated
child-process timeout under suite load; its isolated test passes. Exact
clean-commit SHA and full release browser matrix must be added here after the
final commit is verified.

## Milestone 8 — Trend Radar (multi-platform trend intelligence)

> **2026-09-08** — v1 ships. The Python sidecar `services/trends/`
> owns extraction, scoring, and analysis; the Next.js app owns the
> planner UI and the admin Sources page. The 12 additive trend
> tables are in `src/lib/db/schema/trends.ts`; no existing column
> is altered. The capability is gated behind the existing
> agency database master switch and the new `trend_radar` capability
> flag.

**Architecture (per `docs/operations/TREND_RADAR.md`):**

```
Next.js planner UI ──HTTP──► services/trends (FastAPI + asyncpg)
        │                            │
        │ reads/writes 12            │ scrapes, normalises, scores
        │ trend tables               │ (BART-MNLI, VADER, Detoxify,
        ▼                            │  sentence-transformers, MiniLM)
Postgres (Drizzle ORM)               ▼
                              ML models cached in
                              /app/data/models
```

**12 additive tables** (source of truth:
`src/lib/db/schema/trends.ts`):

| #   | Table                     | Purpose                                         |
| --- | ------------------------- | ----------------------------------------------- |
| 1   | `trend_source`            | Per-agency source enablement + config           |
| 2   | `trend_signal`            | Normalised trend data + embeddings              |
| 3   | `trend_board`             | User-curated collections                        |
| 4   | `trend_board_item`        | Board ↔ signal link with feedback               |
| 5   | `trend_brief`             | Closed-loop: trend → published content item     |
| 6   | `trend_fetch_job`         | Sync job log                                    |
| 7   | `trend_source_health`     | Per-source health snapshot (circuit state)      |
| 8   | `trend_source_audit`      | Append-only audit of source-config changes      |
| 9   | `trend_source_activity`   | Per-source activity feed (capped at 100/source) |
| 10  | `trend_feedback`          | User feedback events for Fit score training     |
| 11  | `saved_filter`            | Saved Trends filters (per-user)                 |
| 12  | `workspace_source_optout` | Per-workspace opt-out override                  |

**Planned vs shipped (v1):**

- [x] 12 additive tables (Drizzle + SQLAlchemy mirror).
- [x] Python sidecar scaffold: FastAPI + asyncpg + APScheduler.
- [x] 5 first-class extractors (TikTok via tamnd, YouTube Data API v3,
      Reddit OAuth, Meta Ads Library, Google Trends via SerpAPI).
- [x] 7 stubbed extractors (X, Instagram, Threads, LinkedIn, Pinterest,
      Spotify, Apify).
- [x] Analysis pipeline: `compute_velocity`, `apply_bayesian_smoothing`,
      `wilson_lower_bound`, `compute_lifecycle`, `classify_lifecycle`,
      `dedupe_and_correlate`, `analyze_sentiment` (VADER + Detoxify),
      `classify_vertical` (BART-MNLI), `compute_fit`,
      `update_workspace_weights`.
- [x] 3-state circuit breaker (CLOSED → OPEN → HALF_OPEN → CLOSED),
      persisted to `trend_source_health` so it survives process
      restarts.
- [x] Per-platform fallback chain (primary → fallback 1 → fallback 2
      → last-good cache), recorded in the fetch-job error/attempt log.
- [x] GDPR "Delete my trend data" action with typed-phrase
      confirmation, per-table delete counts, and a single
      `security_audit_event` row.
- [x] ToS acknowledgement modal for grey-area sources (twikit,
      instaloader, tomquirk, kawsarlog) → `trend_source_audit`.
- [x] Bilingual EN/AR strings (71 keys each, registered in
      `src/messages/{en,ar}/trends.json`).
- [x] Sentry tags (`capability=trend_radar`, `platform`, `source`,
      `costCents`) on both Next.js and the sidecar.
- [x] Prometheus metrics
      (`ai_trend_signals_total{platform, source, status}`,
      `ai_trend_extraction_duration_seconds{platform, source}`,
      `ai_trend_cost_cents_total{platform, source}`,
      `ai_trend_source_status{agency_id, source, status}`) in the
      sidecar's `app.observability`.
- [x] Operator manual (`docs/operations/TREND_RADAR.md`, ~2,000 words).
- [x] 12 per-source setup guides under `docs/operations/trend-sources/`.
- [x] 11 Python unit-test files under `services/trends/tests/`.
- [x] 7 E2E test files under `tests/e2e/trends-*.spec.ts`.

**Privacy & retention (plan §18):**

- `_scrub_sentry_event` in `services/trends/app/observability.py`
  strips every trend label, source URL, raw payload, and embedding
  from Sentry breadcrumbs.
- `security_audit_event.metadata` for trend operations carries source
  key + counts only — never user data.
- Trend signals carry an `expires_at` (7 days default); the cron
  prunes expired rows on the daily cycle.
- Source enablement (`trend_source`), source audit
  (`trend_source_audit`), saved filters (`saved_filter`), and
  per-workspace opt-outs (`workspace_source_optout`) are
  operational, not user data, and survive the GDPR delete.

**Out of scope for v1 (planned for v2):**

- Bass-diffusion fit instead of the velocity + accel heuristic.
- Auto-pilot: the sidecar proposes a content item when a trend
  crosses the Fit threshold; the human accepts or dismisses.
- Cross-workspace trend deduplication (currently each workspace
  has its own signal table).
- The 7 stubbed extractors graduating from `experimental` to
  `paid` or `free` (per the per-source guides).

**Release evidence recorded for 2026-09-08:**

- [x] Drizzle migrations `0037`–`0040` are registered and exercised by
      `pnpm migration-drill` (from-zero, skipped-migration repair, in-place,
      backup/restore, and failed-migration abort paths).
- [x] `pnpm verify` passes on the release candidate: format, lint, strict
      typecheck, 351 unit files / 3,312 tests, and production build.
- [x] Workspace feed queries exclude expired signals and enforce workspace
      scope; the sidecar uses Drizzle-owned migrations rather than startup
      `create_all()`.
- [x] Quick Create records the `trend_brief` relationship, saved filters are
      server-persisted and workspace-scoped, and the four planner tabs have
      functional data paths.

**Outstanding:**

- Independent-reviewer sign-off on the 12 new tables, the GDPR
  delete action, and the 5 first-class extractor contracts.
- Visual matrix rerun on the Trends page, Sources page, and the
  per-source modals (current HEAD did not change those surfaces,
  but the brand-new testids need a fresh `pnpm test:visual:update`
  pass).
- The 30-step UAT in `docs/production-readiness/UAT_RELEASE.md`
  needs Trend Radar-specific steps appended (Task 13, independent
  reviewer).

## Milestone 8 — Semi-automated Meta publication linking

> **2026-09-22** — The implementation adds read-only candidate discovery,
> explicit per-channel linking, external scheduled/live state, manual refresh,
> unavailable preservation, and scheduled-link reconciliation. Direct Meta
> publishing remains out of scope. This milestone is `Implemented`, not
> independently `Verified`: migration drill, authenticated bilingual browser
> evidence, Meta UAT, and production backup/rollback evidence remain required.

| ID   | Status                      | Required implementation                                                                                                                                                                               | Acceptance                                                                                                                                                                                                           | Evidence                                                                                                                                                 |
| ---- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M8.1 | Implemented with limitation | Normalized Facebook/Instagram candidate provider with independent Facebook cursors, 90-day filtering, scheduled Page reads, deduplication, ownership validation, and least-privilege scope expansion. | Candidates are token-free, normalized, ranked, and support Facebook feed/scheduled plus Instagram published image/video/carousel/reel media. Instagram scheduled visibility remains a read-only Meta UAT limitation. | `src/lib/social/meta-publications.ts`, `src/lib/social/providers/meta.ts`, focused social unit tests                                                     |
| M8.2 | Implemented                 | External publication metadata, identity uniqueness, sanitized snapshots, service authorization, link/unlink/refresh, and unavailable/error handling.                                                  | Existing Planner publication state is preserved; scheduled Meta links remain Planner-pending; live confirmation marks Planner published; duplicate links are rejected.                                               | Migration `0049_meta_external_publication_links`, `src/lib/social/meta-publication-service.ts`                                                           |
| M8.3 | Implemented                 | Bilingual per-channel candidate dialog and server actions.                                                                                                                                            | English/Arabic UI has loading, empty, pagination, permission/error, refresh, explicit confirmation, and keyboard-accessible selection states.                                                                        | `src/components/planning/meta-publication-link-dialog.tsx`, channel card, bilingual catalog, `tests/unit/planning/meta-publication-link-dialog.test.tsx` |
| M8.4 | Implemented                 | Background reconciliation for linked scheduled objects plus activity events.                                                                                                                          | Only scheduled links are reconciled; missing objects become unavailable without erasing provider identity/history.                                                                                                   | `src/lib/social/sync.ts`, `src/lib/social/meta-publication-service.ts`                                                                                   |
| M8.5 | Pending                     | Release evidence and Meta UAT.                                                                                                                                                                        | Migration drill, integration/browser/a11y/visual checks, App Review, Page/Instagram professional test accounts, pagination, scheduled visibility, and reauthorization evidence are recorded at the exact clean SHA.  | `docs/production-readiness/MIGRATION_DEPLOYMENT.md`, `docs/production-readiness/EXTERNAL_SERVICES_UAT.md`                                                |

## 2026-10-03 — Full visual matrix checkpoint

The complete Chromium visual run executed all **247 assertions**. Before the
baseline refresh, **231 passed** and **16 failed** only on screenshot references
for the intentionally shipped Command Center/planning/Publish/admin layout
changes; no route/runtime or serious/critical axe failure was reported. The
affected references were reviewed from actual and diff captures, refreshed
selectively, and the affected assertion set now passes **17/17** (the extra
capture is a stable media-wide regeneration). The full matrix remains `Tested`,
not `Verified`: independent visual/a11y review, external-service UAT, provider
UAT, and authenticated MCP smoke evidence remain release gates.

## Milestone 9 — Agency tasks and global calendar

| ID   | Status      | Required implementation                                                                                                                                                                                                                                                                          | Acceptance                                                                                                                                                                          | Evidence                                                                                                        |
| ---- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| M9.1 | Implemented | Agency-scoped tasks with optional workspace relation, creator/assignee/admin policy, lifecycle checks, automatic cycle timing, pagination, filters, append-only activity, bilingual list/detail/create UI, and accessible archive confirmation.                                                  | Unit workflow/time coverage, authorization and transaction integration coverage, authenticated bilingual browser/a11y journeys, responsive visual review, and exact-clean evidence. | `src/lib/tasks/`, `/app/tasks`, `tests/unit/tasks/{workflow,time}.test.ts`, ADR 0016; release evidence pending. |
| M9.2 | Implemented | Direct-to-R2 task attachment intents with allowlisted type/size, pending-to-ready metadata verification, and signed downloads.                                                                                                                                                                   | Unauthorized signing/completion is denied; invalid metadata never becomes downloadable; upload errors are announced in the UI.                                                      | `src/lib/tasks/attachments.ts`, task attachment API routes; integration/browser evidence pending.               |
| M9.3 | Implemented | Agency global calendar combining all visible planned content and dated tasks with agency-timezone month boundaries, Today jump/current-day highlight, workspace/assignee/status filters, independent Plans/Tasks visibility, unscheduled-task visibility, desktop month grid, and mobile agenda. | Admin cross-workspace visibility, filter persistence, empty states, deep links, Arabic/RTL, responsive and a11y checks.                                                             | `src/lib/planning/calendar.ts`, `/app/calendar`, `tests/integration/tasks.test.ts`; release evidence pending.   |

## 2026-10-21 — Architecture review implementation follow-up

- The import-direction, ownership, DRY extraction, page-quality, and migration
  rules are documented in `docs/architecture/module-ownership.md` and linked
  from the architecture overview and contributor guidance. Trends remains the
  first feature-module pilot; broad migration is intentionally incremental.
- The first review batch has centralized repeated form-action error UI and cron
  authorization, fixed confirmed Trends policy and social connection tenant
  defects, and added a concurrency-safe outbox claim. Each fix has focused
  regression coverage; the outbox change adds no schema migration.
- The historical visual-harness claim TEST-03 is stale: committed baselines and
  assert-mode checks exist. Exact-clean-commit visual comparison and independent
  visual review remain release evidence. Historical FEAT-01/FEAT-02 are stale
  about event dispatch and scheduling; source/configuration presence does not
  certify a live VPS cron installation or production UAT. See A6 and A22 in
  `docs/audits/ARCHITECTURE_REVIEW_2026-10-20.md`.
- Verification on the current uncommitted implementation tree: `pnpm verify`
  passed (format, lint, strict typecheck, 552 unit files / 4,967 tests, and
  production build); all 43 integration specs passed; the new concurrent
  outbox regression passed against the disposable Postgres database; and
  `pnpm migration-drill` passed all five scenarios. This is candidate evidence
  only, not clean-SHA evidence.
- The latest full `pnpm test:e2e:release` attempt progressed through Chromium
  but logged a missing mobile More dialog, several Trends journey failures,
  and closed response streams before reaching Firefox. An isolated fresh-DB
  retry reproduced the missing More dialog; its screenshot shows the menu
  closed and the Next dev server logged a late Fast Refresh / closed stream.
  The test now uses the canonical agency-qualified workspace URL, but the
  More sheet and calendar checks subsequently passed individually, and the
  full Chromium mobile spec passed 9/9; close the mobile fixture concern from
  this interrupted run. The Firefox project then timed out
  launching its local Nightly binary after 180 seconds, reporting
  `sandbox_extension_issue_file_to_process ... Operation not permitted`; a
  focused retry with `MOZ_DISABLE_CONTENT_SANDBOX=1` failed the same way. The
  visual phase did not run. Keep the Trends failures and full five-browser
  matrix open for a stable run.
- `AD-002` remains **In Progress**. The route/domain/database inventory is not
  yet complete; the full five-browser matrix, visual gate, exact clean-SHA
  evidence, and independent review are still required. No `Verified` status
  is assigned by this implementation update.

## 2026-10-21 — Validation efficiency follow-up

- The documented validation cadence now uses focused checks during edits,
  batches independent final checks once per milestone, runs shared-database
  checks sequentially, and reserves the full browser/visual release suite for
  the final candidate. Documentation-only edits require formatting and diff
  checks rather than unrelated full-suite reruns.
- The latest `pnpm verify` run passed formatting, ESLint, strict TypeScript,
  and 4,966 of 4,967 unit tests. One social Meta callback test exceeded its
  5-second timeout under suite load; its focused 3-test rerun passed. The
  production build passed. Since there was a suite timeout, the aggregate
  verify gate is recorded as incomplete, not passed.
- A temporary Next Webpack memory-optimization setting did not prevent the
  Linux dev server from restarting or a first-visit route from exceeding its
  30-second navigation timeout, so the setting was reverted. The full browser
  and visual gates remain open; no status is advanced from the incomplete run.
- `AD-002` remains **In Progress**; the full route/domain/database inventory,
  clean-SHA release evidence, and independent review remain open.

## 2026-10-21 — Affected-test runner correction

- The affected-test runner now passes Playwright projects using
  `--project=<name>`, escalates when any changed test file lacks ownership, and
  avoids Git diff discovery for explicit manual-area runs. The ownership map
  now covers Advertising, Trends, Command Center accessibility, and mobile
  browser specs.
- Runner-core tests passed 14/14; the manual workspace unit batch passed
  396/396. Earlier affected Discussion/notification browser checks passed
  14/14 and Advertising checks passed 11/11 including visual assertions.
  These targeted results improve feedback speed but do not close the full
  browser/visual gate.
- The latest runner and fixture edits pass strict TypeScript, targeted
  Prettier checks, and `git diff --check`.
- `AD-002` remains **In Progress**. Route/domain/database inventory, exact
  clean-SHA release evidence, full browser/visual checks, and independent
  review remain open.

## 2026-10-21 — Sidebar context ownership correction

- Restored agency and workspace selectors to the persistent sidebar beneath
  the brand. The top bar now contains global utilities only. Expanded, tablet,
  and collapsed layouts keep selector names accessible; shared workspace
  switcher copy is centralized. The mobile context header remains the compact
  mobile navigation surface.
- Updated affected workspace and agency browser specs to target the sidebar
  selectors. The focused sidebar unit suite passed 48/48; the agency,
  workspace, mobile, and social-analytics Chromium batch passed 42/42 including
  Arabic RTL journeys. Seven focused visual comparisons passed after reviewing
  the updated captures. The full visual matrix and five-browser release check
  remain pending.
- Recorded the confirmed source/contract drift as A24 in
  `docs/audits/ARCHITECTURE_REVIEW_2026-10-20.md`. `AD-002` remains **In
  Progress**; no readiness status is promoted.

## 2026-10-21 — Combined persistence and repository verification

- `pnpm verify` passed formatting, ESLint, strict TypeScript, 553 unit files /
  4,971 tests, and the Next.js production build.
- `NODE_ENV=test pnpm migration-drill` passed all five scenarios on the
  disposable `planner_test` database. The full integration suite passed,
  including the overlapping outbox-dispatch regression.
- These results apply to the current implementation tree, not an exact clean
  commit. Full five-browser release coverage, the complete visual matrix,
  exact-clean-SHA evidence, and independent review remain open. `AD-002`
  remains **In Progress**.

## 2026-10-21 — Native-host browser follow-up

- A native-host `pnpm test:e2e:release` attempt reached 257/1,632 Chromium
  cases, then was stopped after four failures; the visual phase did not run.
  The failures were platform overview navigation, Trends degraded-page
  loading, Trends onboarding completion, and Trends Use-in-brief navigation.
- A fresh focused rerun passed the platform overview, degraded-source, and
  onboarding journeys (4/4 cases, including both platform roles). The
  Use-in-brief route compiles lazily on a cold Next dev server; its first
  navigation exceeded the default test timeout. The assertion now allows the
  measured cold compile window and the focused journey passes 1/1. No
  application navigation code changed.
- The static route inventory now records 91 page routes by family and 105 API
  handlers by ownership group, alongside 42 loading surfaces and 9 error
  boundaries. Per-route state/quality review and route-to-test mapping remain
  open. `AD-002` remains **In Progress**; no release gate is marked complete.

## 2026-10-21 — Feature ownership boundary follow-up

- The Trends workspace-enabled-source query moved from `src/lib/trends/` into
  the feature's explicit server-only entry point. The client-safe catalog
  remains exported from `index.ts`; the two server pages now use `server.ts`.
- `tests/unit/architecture/module-ownership.test.ts` enforces public feature
  entry points and prevents shared presentation/platform modules from
  depending on features. Existing UI-to-route-action and platform-to-UI type
  imports remain separately tracked migration work. This is a focused guard
  for a rule the existing lint configuration does not enforce.
- The static guard passed 3/3 through `pnpm test:affected -- --area
architecture --layer unit`; the Trends area mapping selected five unit files
  and passed 12/12. Formatting and `git diff --check` also passed. Full
  milestone verification is still pending. The route-by-route quality map,
  full browser/visual evidence, exact clean-SHA verification, and independent
  review remain open; `AD-002` remains **In Progress**.

## 2026-10-21 — Validation batching and shell evidence

- The sidebar context move passed the focused Chromium batch (42/42). Four
  representative visual comparisons passed after the final candidate captures.
- The full 252-case visual capture with four workers completed with 207 passing,
  15 server/bootstrap failures, and 30 cases not run. A focused two-worker
  capture of affected surfaces passed 43/45; the remaining Trends tablet case
  and its related route cases passed in a four-case single-worker rerun. The
  full visual compare remains open.
- A two-worker full browser attempt caused a shared-seed race in
  `/api/dev/seed` (duplicate `workspace_membership` insert). The full 1,632-case
  release command was therefore stopped after its initial serialized cases.
  No release status is promoted from partial evidence. The full five-browser
  matrix and complete visual compare remain required before merge; `AD-002`
  remains **In Progress**.
- Screenshot inspection caught blank or skeleton candidates from the overloaded
  capture. Thirty affected reference/responsive cases were recaptured with one
  worker; the workspace settings, content detail, workspace list, agency pages,
  research, library, channels, and approvals captures were inspected. The
  focused compare of five corrected candidates passed 5/5. This does not close
  the full visual compare gate.
- The latest `pnpm verify` passed formatting, ESLint, strict TypeScript, all
  553 unit files / 4,971 tests, and the production build. After this run, the
  final evidence-only tracker edit passed Prettier and `git diff --check`.

## 2026-10-21 — Canonical workspace test ownership

- Corrected affected-test ownership globs that still referenced the retired
  `/app/w/[slug]` source paths. Content, publishing, workspace, Brand Kit,
  channels/social analytics, AI settings, and discussion UI ownership now
  follows the agency-qualified App Router tree.
- Added focused ownership areas for workspace pages, calendar, tasks, media,
  research, agency settings, account, users, and public pages. Regression
  coverage confirms all 91 current App Router pages select a focused browser
  suite, have an ancestor loading/error fallback, and checks representative
  canonical route paths. The affected-runner suite passes 17/17. The actual
  `pnpm test:affected -- --layer unit` command selects only the architecture
  area for manifest and mapping-test edits; Prettier and `git diff --check`
  pass. No route or runtime behavior changed.
- The full five-browser release matrix, complete visual comparison, exact
  clean-SHA evidence, and independent review remain open. `AD-002` remains
  **In Progress**.

## 2026-10-21 — Media retry worker ownership

- Reviewed the 2,674-line media service and confirmed it spans several
  responsibilities. Extracted cron-owned pending-upload promotion to
  `src/features/media/server.ts`. Added coverage for ready promotion, invalid
  signatures, transient storage failures, and batch clamping.
- The affected runner selected 46 related unit files / 378 tests, then the
  directly changed media and ownership tests passed 18/18. Prettier and
  `git diff --check` and strict TypeScript passed. No route, database schema,
  or API contract changed.
- Further media service boundaries and the full route review remain open;
  `AD-002` remains **In Progress**.

## 2026-10-21 — Correct unsupported section-title utility

- Replaced 16 uses of the unsupported `text-section-title` utility with the
  `text-title-section` utility backed by the existing theme token. Added a
  focused architecture regression that checks source usage and token presence.
- The affected runner escalated to the full unit suite for this multi-area app
  diff; that run was intentionally interrupted before completion. The focused
  architecture, media, settings, sidebar, and Brand Kit suites then passed
  79/79. Strict TypeScript, Prettier, and `git diff --check` passed.
- Full `pnpm verify`, bilingual route/visual evidence, and exact clean-SHA
  recording remain pending. `AD-002` remains **In Progress**.

## 2026-10-21 — Correct lead-time setup detection

- The settings checklist now compares each lead-time stage with the default
  schedule instead of treating any total other than 18 days as customized.
  Shared defaults drive both initial values and checklist detection. Focused
  regression cases cover default, same-total customized, and different-total
  schedules.
- The full settings/browser visual evidence and final `pnpm verify` remain
  pending. Focused settings suites passed 12/12 and strict TypeScript passed;
  formatting was applied after the initial check identified the two new files.
  `AD-002` remains **In Progress**.

## 2026-10-21 — Place media retry worker behind its feature boundary

- Moved the worker into `src/features/media/server.ts` and migrated the cron
  route and focused test to that server-only entry point. Removed the temporary
  re-export from the broad media service and added the feature path to media
  test ownership. The public cron URL and response shape are unchanged.
- The focused media, cron-auth, affected-ownership, and module-boundary suites
  passed 36/36; strict TypeScript, Prettier, and `git diff --check` passed.
  `AD-002` remains **In Progress** pending full milestone and release evidence.

## 2026-10-21 — Extract media folder tree projection

- Moved pure folder classification and descendant counting into
  `src/lib/media/folder-tree.ts`, leaving authorization and batched database
  reads in the existing service. The content-format union/list now has a
  presentation-free module shared by the content status projection and media
  tree classifier.
- Fixed a confirmed misclassification: user-created folders under `Posts` and
  their date-shaped descendants were marked as system folders even though the
  UI/API allows creating those subfolders. The classifier now recognizes only
  canonical generated format names. Focused projection tests cover generated
  and user folders, counts, and cyclic data. Media, format-payload,
  architecture-boundary, and ownership tests passed 34/34; strict TypeScript,
  Prettier, and `git diff --check` passed. Media route visual evidence remains
  pending.

## 2026-10-21 — Scope workspace AI settings to its URL-resolved agency

- Fixed a tenant isolation defect: the workspace AI settings page previously
  combined a URL-resolved workspace with AI status and admin data from the
  active-agency cookie. The new server-side read model scopes agency values to
  `workspace.agencyId` and request counts to `workspace.id`; the page no longer
  consults active-agency context for workspace-specific output.
- A focused regression checks that agency admin status, provider-key
  availability, feature configuration, and workspace usage use the resolved
  tenant. Full EN/AR responsive visual evidence and the database integration
  suite are recorded in the architecture evidence consolidation below.

## 2026-10-21 — Architecture refinement evidence consolidation

- `pnpm verify` passed on the updated worktree: formatting, ESLint, strict
  TypeScript, 557 unit files / 4,985 tests, and the production build.
- `pnpm test:integration` passed against the disposable `planner_test`
  database. The five-scenario migration drill passed: from-zero, skipped
  migration repair, in-place upgrade, backup/restore, and failed-migration
  abort. No schema migration was added in this batch.
- Workspace AI settings and workspace Settings passed strict English and
  Arabic/RTL visual comparison at 375/768/1024/1280/1440px. Workspace Media
  passed six strict visual cases; English coverage and the Arabic/RTL matrix
  span the same five widths, with critical accessibility and overflow checks.
  The Arabic screenshots normalize only the disposable agency UUID; component
  coverage still verifies the actual storage prefix.
- After commit `7e4e4b13c590d31f080ff71480903addd33d10ea`, the focused strict
  visual suite passed 18/18 on the committed baselines. It covers all five
  English widths and the full Arabic/RTL matrix for each of the three routes.
  This supersedes earlier route-specific notes that marked these visuals
  pending; see `docs/production-readiness/TEST_EVIDENCE.md` for the checkpoint.
- `AD-002` remains **In Progress**. The full five-browser release matrix,
  manual review of every route, and independent review remain open. Exact
  implementation-SHA evidence is recorded above and in the test evidence log.
  Do not advance `Tested` or `Verified` from this local evidence alone.

## 2026-10-21 — Media query ownership and pagination correction

- Duplicate advisory reads and content-item asset-link operations now have
  feature-owned server modules. Upload registration uses the feature-owned
  content-link command; existing feature facade exports preserve callers.
- The media library listing and count use the same tenant, visibility, folder,
  status, kind, text, and asset-id filters. A regression test proved workspace
  pagination undercounted agency-shared assets; the correction also covers
  descendant-folder counts. No schema or public API change was made.
- Focused disposable-Postgres media integration passes 17/17, focused unit and
  ownership checks pass 9/9, and strict type/lint/format checks pass on exact
  clean SHA `9a4c8adb4c51c799bb56d97c0284bd2aac78c51d`. See
  `docs/production-readiness/TEST_EVIDENCE.md`.
- Full `pnpm verify`, all integration files, migration drill, full route
  review, release browser matrix, and independent review remain open. AD-002
  remains **In Progress**; no independent `Verified` status is assigned.

## 2026-10-21 — Media asset query ownership follow-up

- Media listing, pagination totals, related-content projection, and page-size
  parsing now live in `src/features/media/asset-library-queries.server.ts`.
  The client row type is serializable; shared storage access is isolated in
  `src/lib/media/asset-access.server.ts`. The obsolete media filter helper was
  removed after confirming there were no callers.
- The broad media service is now 286 lines and owns derived folder paths and
  content-item folder reconciliation. The latter remains in the review queue
  because it coordinates content changes with media-folder state.
- Focused media Postgres tests pass 18/18; related unit/ownership checks pass
  21/21; type, lint, format, and diff checks pass on exact clean SHA
  `7ea8c7991de28d7f95fc30b607cfac2fa532ea46`. See the test evidence log.
- Full `pnpm verify`, all integration files, migration drill, route review,
  release browser matrix, and independent review remain open. AD-002 remains
  **In Progress**; no independent `Verified` status is assigned.

## 2026-10-21 — Activate content deadline reminders

- Confirmed that the deadline notification dispatcher had no caller and no
  VPS schedule despite the product contract requiring deadline events through
  the transactional outbox. Moved it behind the content feature boundary and
  added an authenticated cron route plus an hourly VPS schedule.
- Candidate selection and outbox writes now share a transaction; advisory
  locking prevents overlapping dispatches, recent events are deduplicated,
  and duplicate owner/designer recipients collapse to one notification.
  Added focused Postgres tests for repeat runs, competing ticks, state and
  archive filters, and route tests for authorization and sanitized failures.
- On implementation SHA `98c7040ca1327000283d2b6eeba8aaa379ca8d6a`,
  `pnpm verify`, the full `pnpm test:integration` suite, and
  `pnpm migration-drill` passed. The cron installer dry-run and focused
  ownership/lint/format checks passed as well. Exact results are recorded in
  `docs/production-readiness/TEST_EVIDENCE.md`.
- No schema migration or user-facing route contract changed. Installing the
  new cron on the VPS, complete manual route review, release browser/visual
  coverage, and independent review remain open. AD-002 remains **In
  Progress**; this work is **Tested**, not **Verified**.

## 2026-10-21 — Move media sharing behind the feature boundary

- Moved public media share lifecycle and single-asset folder assignment into
  server-only media feature modules, with shared manager authorization. Updated
  route adapters to use the feature server entry point and removed the moved
  implementations from the broad media service. Public URLs, route responses,
  permission checks, token hashing, and transaction/audit behavior are
  preserved.
- Added disposable-Postgres integration coverage for share create/rotate/read/
  revoke and non-member denial, plus route coverage for auth/permission
  failures, cache headers, public origin, and JSON shapes. No schema migration
  or API contract change.
- `pnpm verify` passed on exact clean SHA
  `a016d98b683235f803891155e405ea7f46a1a4e8`: formatting, zero-warning ESLint,
  strict TypeScript, 558 unit files / 4,988 tests, and production build.
  Focused integration passed 4/4 and the migration drill passed 5/5 on that
  SHA. Full details are in `docs/production-readiness/TEST_EVIDENCE.md`.
- `AD-002` remains **In Progress**; folder management, broader route review,
  the five-browser release matrix, and independent review remain open.

## 2026-10-21 — Move media folder management behind the feature boundary

- Extracted media folder reads, tree projection, create, rename, and cascade
  archive into `src/features/media/folders.server.ts`; shared access scoping
  now lives in `src/lib/media/access.ts`. Migrated app pages and API route
  adapters to the media feature entry point. No schema, route, permission, or
  response contract changed.
- Focused media-sharing integration passed 5/5, read-path batching passed
  11/11, and architecture/ownership/folder unit checks passed 23/23. Strict
  TypeScript and `git diff --check` passed. `pnpm verify` passed on exact clean
  SHA `19983639fe39e869b8be6e640a34181e7da987ac`: formatting, zero-warning
  ESLint, strict TypeScript, 558 unit files / 4,988 tests, and production
  build. The migration drill passed 5/5 scenarios on the same SHA. Evidence is
  recorded in `docs/production-readiness/TEST_EVIDENCE.md`.
- `AD-002` remains **In Progress**; trash/restore, bulk/reconciliation,
  full route review, release browser matrix, and independent review remain
  open.

- Content workflow-transition ownership: moved the workflow transition command
  into the content feature boundary and migrated planning, MCP, and test
  callers. Authorization, scenario rules, transactional side effects, and
  notification behavior remain stable. Focused checks pass 63/63; typecheck,
  targeted lint, formatting, diff checks, and commit hook pass on code SHA
  `88b23a41d52628d965d6da7de023b8f620314013`. Database integration and full
  `pnpm verify` remain pending; no schema migration was introduced.

- Content assignment ownership: extracted designer claim/assign/release and
  content-owner assignment into the content feature server module; planning,
  MCP, and tests use the feature boundary. Focused behavior and ownership tests
  pass 60/60; typecheck, targeted lint, formatting, diff checks, and the commit
  hook pass on code SHA `488c3273165c0efbb57635edefdc5fed8699e06f`. Database
  integration and full `pnpm verify` remain pending. No schema migration.

- Confirmed concurrency defect: designer self-claim now uses a conditional
  database update requiring an unassigned item in a claimable status. A losing
  claim cannot create a competing active assignment or notification. The
  focused content-service suite passes 60/60; typecheck, targeted lint,
  formatting, diff checks, and commit hook pass on code SHA
  `e2f50c62d7f9bfbc75d92c710dabe70a8212eeae`. Database integration and full
  `pnpm verify` remain pending; no schema migration.

- Content archive lifecycle ownership: extracted single archive, restore, and
  bulk archive into the content feature module; planning, design queue, and MCP
  callers use the feature entry point. Focused behavior and ownership tests
  pass 62/62; typecheck, targeted lint, formatting, diff checks, and commit
  hook pass on code SHA `5e780a58651f9518e5fe5e718cebbcd21b5db840`. Database
  integration and full `pnpm verify` remain pending. No schema migration.

## 2026-10-21 — Move media import workflows behind the feature boundary

- Moved single-file public import and folder-import batching into
  `src/features/media/`, migrated both import routes to the feature entry
  point, and moved the batch unit suite to the feature module. Existing URL
  safety, authorization, storage-intent cleanup, per-item error mapping, and
  response contracts are preserved. Asset registration remains a shared
  persistence primitive in the legacy service.
- Focused folder-import, module-ownership, and affected-test selection suites
  passed 26/26; strict TypeScript and formatting passed. `pnpm verify` passed
  on exact clean SHA `277c5af88d4cd3b8f0ba0e1fd6637152cc2cfb20`: formatting,
  zero-warning ESLint, strict TypeScript, 558 unit files / 4,988 tests, and
  production build. All integration files passed against disposable
  `planner_test`; the migration drill passed all five scenarios. Evidence is
  recorded in `docs/production-readiness/TEST_EVIDENCE.md`.
- `AD-002` remains **In Progress**; trash/restore/expunging,
  bulk/reconciliation, full route review, release browser matrix, and
  independent review remain open.

## 2026-10-21 — Move media trash lifecycle behind the feature boundary

- Moved single and bulk trash/restore operations and expired-trash cleanup to
  `src/features/media/trash-lifecycle.server.ts`; media asset routes and the
  storage-cleanup cron now call the feature entry point. Existing role gates,
  30-day retention behavior, per-item results, storage soft-delete sequence,
  and quota release semantics are preserved.
- Focused media route, cron authorization, module ownership, and expiry unit
  checks passed 21/21; strict TypeScript passed. The disposable-Postgres
  media-sharing test verifies original/preview cleanup and released byte
  counts. `pnpm verify` passed on exact clean SHA
  `05f3a301e756c0de3e2bb07c080ad976797d53eb`: formatting, zero-warning ESLint,
  strict TypeScript, 558 unit files / 4,988 tests, and production build. All
  integration files passed against disposable `planner_test`; the migration
  drill passed all five scenarios. Evidence is in
  `docs/production-readiness/TEST_EVIDENCE.md`.
- `AD-002` remains **In Progress**; bulk move/tag/visibility, duplication,
  reconciliation, full route review, release browser matrix, and independent
  review remain open.

## 2026-10-21 — Route media pages and handlers through the feature API

- Added explicit media service compatibility exports to the server-only
  feature entry point and migrated all app pages and API handlers off direct
  imports of `src/lib/media/service.ts`. Added an ownership regression that
  prevents media app routes from returning to that internal module. Service
  implementations and route contracts remain unchanged.
- The focused media, module-ownership, and affected-test suites passed
  209/209; strict TypeScript passed. `pnpm verify` passed on exact clean SHA
  `9c2b728771aeae8e8d2f63a9511364dfb4c3d42d`: formatting, zero-warning ESLint,
  strict TypeScript, 558 unit files / 4,988 tests, and production build.
  Evidence is recorded in `docs/production-readiness/TEST_EVIDENCE.md`.
- `AD-002` remains **In Progress**; the manual page review, full browser
  matrix, and independent review remain open.

## 2026-10-21 — Enforce workspace access for media folder audit

- The folder-audit route now checks the requested workspace against the
  actor's accessible workspace IDs before reading reconciliation metadata.
  This closes an agency-member cross-workspace disclosure path without
  changing the API response or schema.
- The focused route regression passes, including the no-query-on-denial
  assertion; targeted ESLint and formatting checks pass. The fix is recorded
  at exact code SHA `ad7a9956e65c42d094901c3ade55f42dec2bf3d2`.
- `AD-002` remains **In Progress**; full repository verification, the complete
  route review, browser release matrix, and independent review remain open.

## 2026-10-21 — Move media library reads behind the feature boundary

- Moved the library tag/uploader facets and reconciliation audit queries,
  tenant authorization, and response projection into
  `src/features/media/library-queries.server.ts`. The API handlers now adapt
  auth, query validation, status mapping, and cache headers.
- Focused route/query and module-boundary tests pass 12/12; strict TypeScript,
  targeted lint, formatting, and diff checks pass on exact clean code SHA
  `9cb1187f212a7b5cba285e077e70fc7c1f256aed`.
- A cross-workspace Postgres regression is added but pending execution because
  `TEST_DATABASE_URL` is unavailable and local Docker did not respond. Full
  repository verification, route review, browser matrix, and independent
  review remain open; `AD-002` remains **In Progress**.

## 2026-10-21 — Move media upload registration behind the feature boundary

- Moved asset registration, return projection, and transient validation retry
  into `src/features/media/asset-registration.server.ts`; the import workflow
  now uses the feature-owned command. The stable feature facade exports the
  command and result type.
- The registration, folder-import, and module-ownership suites pass 14/14;
  strict TypeScript, targeted ESLint, formatting, and diff checks pass on
  exact clean code SHA `ab66308ed0c9383376e7cb5d11f8e5f4be4b6901`.
- A follow-up on clean SHA `d25e25af9b6c45d7b49b22941d0bd73a837d5dd5`
  verified planner_test and passed the media Postgres integration suite
  14/14, including workspace denial, authorized facets, and idempotent upload
  registration. Full integration, `pnpm verify`, migration drill, route
  review, browser release matrix, and independent review remain open;
  `AD-002` remains **In Progress**.

## 2026-10-21 — Centralize manager-only media asset commands

- Moved single-asset rename and visibility operations into the feature command
  module and shared the manager lookup/authorization with tag updates.
  Existing role behavior is unchanged.
- Focused unit and ownership tests pass 18/18; disposable-Postgres media
  integration passes 14/14; strict TypeScript, targeted lint, formatting, and
  diff checks pass on exact clean SHA
  `b8323114d288665b6f1f5ef40c0eca0cbfa83655`.
- Full `pnpm verify`, repository-wide integration, migration drill, route
  review, browser matrix, and independent review remain open. AD-002 remains
  **In Progress**.

## 2026-10-21 — Extract structured creative writes into the content feature

- Moved format-payload validation, role checks, designer-field restrictions,
  activity recording, and linked research-teardown prefill into
  `src/features/content/format-payload.server.ts`, exposed through
  `src/features/content/server.ts`. The planning action and existing service
  tests now use the feature entry point. User-visible behavior and contracts
  are unchanged.
- `tests/unit/content-service.test.ts` passes 57/57; strict TypeScript,
  targeted ESLint, Prettier, and diff checks pass on exact clean implementation
  SHA `e5b238f38830d6729b986261a0277dc9017df9e5`.
- `AD-002` remains **In Progress**. Full `pnpm verify`, repository-wide
  integration, migration drill, route review, release browser matrix, and
  independent review remain open.

## 2026-10-21 — Move audience-copy writes behind the content feature

- Moved canonical audience-copy material edits and the legacy partial-patch
  adapter into `src/features/content/audience-copy.server.ts`; the explicit
  server entry point is marked `server-only`. The planning action now imports
  both creative and audience-copy writes from the content feature. The schema
  test moved into `tests/unit/content/` so the affected-test runner can map it
  to the content area instead of escalating to the full unit suite.
- 103 focused content, materiality, and ownership tests pass; strict TypeScript,
  targeted ESLint, Prettier, and diff checks pass on exact clean SHA
  `4ad0f0473d5d001096390757cf60bf47cd69e68a`.
- `AD-002` remains **In Progress**. Full `pnpm verify`, repository-wide
  integration, migration drill, route review, release browser matrix, and
  independent review remain open.

## 2026-10-21 — Route content reads through feature boundaries

- Moved content detail/list queries, designer roster, and CSV export behind
  `src/features/content/server.ts`; moved calendar and MCP servers into their
  feature modules. Planning, calendar, design queue, export, API, and test
  callers now use those feature entry points. Added content/calendar/MCP test
  ownership so affected checks remain targeted.
- Extracted workflow-scenario persistence into the content feature and removed
  the MCP server's import of a Next server action. The Settings and MCP paths
  now call one manager-gated command with the actor authenticated at their
  respective boundary. Workflow, approval-mode side effect, and response
  contracts remain stable.
- Full unit suite: 5,003 tests across 562 files passed. Focused feature and
  architecture checks, strict TypeScript, targeted ESLint, Prettier, and diff
  checks pass on exact clean SHA
  `975c9f468bd419b65ce3e04c998ed3383f07182c`.
- Database-backed integration is pending because the disposable test URL is
  not configured and local Docker did not respond. No schema changes were
  made. `AD-002` remains **In Progress**; full `pnpm verify`, integration,
  migration drill, route review, browser matrix, and independent review remain
  open.

- Content rescheduling ownership: moved the MCP-used reschedule command into
  `src/features/content/reschedule.server.ts` and added schema, role-gate, and
  unchanged-date coverage. Focused content-service and ownership tests pass
  66/66; typecheck, targeted lint, formatting, diff checks, and commit hook
  pass on code SHA `6f928e093874bc8690e65738279a34db27fc5041`. Database
  integration and full `pnpm verify` remain pending. No schema migration.

- Batched milestone verification passes on exact clean implementation SHA
  `65cec551460865b9a1ca3c2f508ea61570884093`: formatting, repository-wide
  lint, typecheck, 562 unit files / 5,009 tests, and production build. The
  stale read-path guard exception caused one initial failure and was updated
  to the feature-owned bounded workflow loop before the passing rerun.
- Database integration and migration drill remain pending because
  `TEST_DATABASE_URL` is not configured and Docker is unavailable. No schema
  changes were introduced. Manual route review, release browser matrix, and
  independent verification remain open; `AD-002` remains **In Progress**.

- Confirmed assignment-target authorization defect: `assignDesigner` now checks
  that a changed target is a designer in the item's workspace before writing
  assignment history or notifications. Focused content-service tests pass
  64/64; typecheck, targeted lint, formatting, diff checks, and commit hook pass
  on code SHA `2bf99cb39238ee122f9f92e3e31be8cee9b1d02e`.
- Final `pnpm verify` passes on exact clean implementation SHA
  `2bf99cb39238ee122f9f92e3e31be8cee9b1d02e`: format, repository lint,
  typecheck, 562 unit files / 5,010 tests, and production build. Database
  integration and migration drill remain pending because the disposable test
  database is unavailable. Manual route/visual review and independent
  verification remain open; `AD-002` is **In Progress**.
