# StudioFlow / laratik-planner — Full Review, 2026-08-25

> **Scope.** A read-only 5-axis gap audit run against the current `main` (sha `1f19416` at audit time, working tree clean). The baseline is `PRODUCTION_READINESS_TRACKER.md` and its 30+ rows; this report is the **what the tracker missed at finer granularity** pass. The shared release verdict in the tracker remains `READY FOR INDEPENDENT REVIEW` until this report's P0 list is resolved.
>
> **Method.** Five parallel audit workers (UI/UX, Features, Docs, Tests, Other) each produced a 15-20-finding section at `tmp/full-review/{axis}.md` (1,636 total lines). This doc is the synthesis. Every finding is traceable to its per-axis report and back to a `file:line` in the repo. The ONE P0 that is not "tracker gap" but "real bug" (OTHER-01) was independently verified by a direct read of `src/app/(app)/app/w/[slug]/channels/actions.ts:185-240`.

## Executive summary

- **100 findings** across 5 axes. Triage: **~26 P0, ~31 P1, ~34 P2, ~9 Info** (counts are approximate; see per-axis sections for exact).
- **One real, exploitable/incorrectness P0 bug** — `finalizeMetaSelectionAction` in `channels/actions.ts:191-235` issues a dead query against the wrong table, hard-codes `platform="instagram"` on a candidate lookup, and runs the per-profile link in a non-transactional `for` loop. Pre-dates the SEC-003 role-by-route matrix (server action, not API route). This is the only finding the audit explicitly says is **production-shippable risk today**.
- **Four feature domains are structurally stubbed**, not just incomplete: notifications (10/11 §12 kinds never fire), AI (3/6 capabilities return 501 + Insert/Replace/Try Again buttons don't exist), planning library (campaigns/pillars/templates have schema but no service module), outbox dispatcher (no cron).
- **The §23 "30-step primary acceptance journey" claim is overstated.** `tests/integration/journey.test.ts:174-250` covers **4 of 30** steps despite the file header claiming to mirror §23. The remaining 26 have no integration test, only fragmentary e2e coverage. This is the audit's biggest surprise relative to the tracker's claims.
- **Visual regression is non-functional in production CI.** QA-004 row says "PENDING on committed baselines" + `7b1ae8a` made capture non-gating. The 138 responsive baselines are aspirational; a UI regression in a non-critical viewport ships without alarm.
- **The tracker's `READY FOR INDEPENDENT REVIEW` verdict is correct as far as it goes** — the owner-supplied work (Sentry DSN, manual a11y, baselines on CI, §23 UAT, independent reviewer flip) is genuinely pending. The verdict should not flip to `READY` until this report's P0 list is resolved. A new tracker section `GAP-FULL-REVIEW-2026-08-25` is recommended to make this visible in one place.

## What the tracker already got right (do not re-do)

Acknowledging the existing work so the synthesis focuses on the delta:

- **SEC-001..006** — security, auth, headers, rate limits: all `Tested` with evidence. Not re-opened.
- **WF-001..004, PUB-001** — workflow + publishing + aggregate: state machine + tx + locks + role gates. All `Tested` with evidence.
- **DEP-001, OBS-001, OPS-001** — deploy chain (immutable images, dedicated migrator, health-gate rollback), observability baseline, ops posture. All `Tested` with evidence.
- **QA-001..003** — config split, factories, coverage thresholds. All `Tested` with evidence.
- **DOC-001** — README, strategy, runbook refreshed to match current truth.
- **AD-001** — component extraction progress (43 in `src/components/`, was 19 pre-2026-08-21).
- **UI-001..010** — 10 named screens × 6 viewports baseline; the 2026-08-24 refinement (commit `7536d4d`) closed the navigation hierarchy, mobile calendar, and a settings-polish batch.

The tracker is **not** wrong about any of these. It is **incomplete** at the granularity of the per-axis gaps below.

## Axis 1 — UI/UX screen-by-screen (worker 1)

**Findings**: 20 (3 P0, 6 P1, 8 P2, 3 Info). Full report: `tmp/full-review/ui-ux-gaps.md` (615 lines).

**Top P0**:

1. **UX-01** — `FormField.children` is typed as `ReactElement<InputHTMLAttributes<HTMLInputElement>>` but real consumers wrap native `<select>` and `<textarea>` (`quick-create-form.tsx:43-78`, `channel-form.tsx:42-58`). The type marker is fine; the real bug is visual: the native `<select>`/`<textarea>` carry hand-rolled border classes with **no focus ring**, while only `<Input>` carries the `focus-visible:ring-focus-ring` primitive. Keyboard users on Firefox + Windows High Contrast get a barely-visible native outline against the indigo canvas. WCAG 2.2.1 borderline.
2. **UX-02** — Three non-existent utility classes ship in production: `text-secondary` (`signin/page.tsx:437`), `text-danger-fg` (3 sites in `connection-actions.tsx:149,244` and `meta-account-picker.tsx:161`), and `text-h3` (6 sites across M3/M4 surfaces: `connection-actions.tsx:198`, `meta-account-picker.tsx:94`, `analytics/social/page.tsx:184,272`, `agency-settings/social/social-card.tsx:470,570`). Tailwind 4 silently drops them. Revoke-confirm button colour falls back to inherited body colour against the `bg-danger` red — contrast 2.55:1, **fails AA**. Valid tokens: `text-fg-primary`, `text-fg-secondary`, `text-title-section`, `text-title-card`. The 2026-08-24 refinement touched the M2 batch but not M3/M4 — these are the M3/M4 leftovers.
3. **UX-03** — Hand-rolled `RevokeDialog` + 2 other modals skip focus trap and return-to-trigger. The comment in `connection-actions.tsx:27-33` says "we don't use a third-party modal" — factually wrong; the project already depends on Radix via `dialog.tsx`, which ships focus trap and restore for free.

**P1 highlights**: no "no results" state for Planning filters; native `select`/`textarea` in Quick Create miss focus ring (covered by UX-01); Board is 4-col at `xl` not the design's 7-col; "Sync now" button is a silent stub (a11y gap); single shared `loading.tsx` for radically-different routes; `<MoreHorizontal>` in kebab lacks `aria-hidden`.

**Meta-observation**: M3/M4 surfaces (channels, social analytics, publish) re-introduced every pattern the settings-polish batch had removed. One Polish pass 2 on those routes would close ~half the report. Single shared `loading.tsx` is the lowest-effort, highest-impact polish left.

## Axis 2 — Feature-by-feature capability (worker 2)

**Findings**: 20 (11 P0, 3 P1, 5 P2, 1 Info). Full report: `tmp/full-review/feature-gaps.md` (473 lines).

**Top P0**:

1. **FEAT-01** — In-app notifications are stubbed to comment mentions only. `dispatchOutboxOnce` (`src/lib/notifications/service.ts:86-157`) only handles `comment_created`. Reply, assignment, claim/release, review request, approval, change request, deadline, delivery, ready-to-publish events are never inserted into the outbox. The schema accepts all 11 `notification_kind` values (`schema/enums.ts:144-156`) but only `mention` and `system` are ever written. **10 of 11 §12 mandatory kinds never fire.**
2. **FEAT-02** — No outbox dispatcher is scheduled. `scripts/vps/install-cron.sh:33-48` schedules only Postgres backup, SMTP cert probe, and social-metrics sync. No `outbox-worker.sh`, no `/api/cron/dispatch-outbox` route, no scheduled call to `dispatchOutboxOnce`. The bell counter only reflects rows some other code path inserts directly. A planner who @-mentions a designer sees **no notification**.
3. **FEAT-03** — AI capabilities 50% missing. `src/app/api/ai/generate/route.ts:128-137` returns 501 for `platform_adaptation`, `campaign_ideas`, `related_format_ideas`. No hashtag generation. Three of the six documented AI capabilities are advertised but fail at runtime. AI-001 covers governance only; the implementations themselves are not in the tracker.
4. **FEAT-04** — AI "Insert / Replace / Try Again" actions missing. `ai-assistance-section.tsx:198-211` renders only a **Copy** button. Lines 209-211 contain a code comment "Insert / Replace / Try Again per §15. We never auto-save" — the comment is the only artifact. No `onInsert` / `onReplace` / `onTryAgain` handlers; no compare-alternatives state. §15 promise is in a comment, not a control.
5. **FEAT-05** — AI context manifest is a stub. `route.ts:261` writes `contextManifest: { categories: ["title","brief","format","workspace_name"] }` **regardless of what the user selected**. The route never reads brand kit, campaigns, pillars, channels, or approved-content IDs. The UI has no context-selection surface (no toggle, no "Include brand kit" checkbox). Audit + governance review of AI usage would miss the under-inclusion.
6. **FEAT-06** — Planning library CRUD absent. `campaigns` / `content_pillars` / `content_templates` tables exist (`schema/planning.ts:17,47,73`) and `/library/page.tsx` **reads** them. But there is no `src/lib/campaigns/`, `src/lib/pillars/`, or `src/lib/templates/` module, no `createCampaign` server action, no archive command, and no "New campaign / pillar / template" button in the UI. `service.ts` (551 lines) has no `duplicateContentItem` export. Three of the §14 mandatory commands don't exist as code at all.
7. **FEAT-07** — 8 §14 required commands missing across services: `assignDesigner`/`releaseDesignTask`, `rescheduleContentItem`, `editInvitationAccess`, plus 5 more.
8. **FEAT-08** — Notification preferences are dead schema (`email_enabled` / `digest_enabled` never read; no UI).
9. **FEAT-09** — Planning list filters/search/pagination missing. `listWorkspaceContent` (`service.ts:375-401`) only takes `monthStart/monthEnd/status/limit`.
10. **FEAT-10** — No email worker. `sendEmail` only used for auth/reset/invitation/platform; no outbox-driven bulk email.
11. **FEAT-11** — Rate-limit scopes missing. No `upload_sign` or `password_reset_request` scopes; upload sign route has no rate limit at all.

**Meta-observation**: M1–M4 closed the **back-office** layer (tenancy, plans, AI budget, social OAuth scaffolding, publish packages) — those are correctly `Tested`. But the **planner-facing surface** has three structurally-stubbed features the tracker misses: notifications (end-to-end broken), AI capabilities (3/6 working, and the 3 working ones are 1/4 buttons), and the planning library (schema without service or UI). A reviewer running the §23 acceptance journey will hit all three in the first session — bell is decorative, AI panel only Copies, Library is read-only.

## Axis 3 — Docs coverage (worker 3)

**Findings**: 20 (7 P0, 9 P1, 2 P2, 2 Info). Full report: `tmp/full-review/docs-gaps.md` (139 lines).

**Top P0**:

1. **DOC-01** — Missing `docs/decisions/0001-vps-port.md`. `AGENTS.md:237` describes it; the directory jumps from absent to `0002-multi-agency-saas-entitlements.md`. Every new agent loads AGENTS.md first, follows the link, and gets a 404. The whole "why not Supabase + Vercel" rationale (Postgres sidecar, pnpm-workspace, VPS, Mailcow) is the foundation for `PORT_NOTES.md` and `runbook.md` but is not recorded as a decision.
2. **DOC-02** — Missing `docs/operations/incident-response.md`. A real production incident has already happened (2026-08-24 login render reference `1145607673`); lessons live in 4 places (tracker header, MIGRATION_DEPLOYMENT, implementation/progress.md, AUTH_AUDIT) but no runbook defines severity tiers, on-call escalation, comms template, or postmortem template. `runbook.md` §Troubleshooting is symptom-driven, not incident-driven.
3. **DOC-03** — No RPO / RTO documented for backup/restore. Master prompt §24.1.5 mandates it; `EXTERNAL_SERVICES_UAT.md:143` (Encrypted offsite backup row) shows "code path exists" = `MISSING`. `runbook.md:150-181` is procedural, not contractual. The offsite backup is explicitly **not yet wired** (the `MISSING` row), so a restore-from-offsite test cannot have been run.
4. **DOC-04** — Standard GitHub files missing: no `LICENSE`, no `CHANGELOG.md`, no `CONTRIBUTING.md`, no `CODE_OF_CONDUCT.md`, no `SECURITY.md`. No license file means no license is granted. No `SECURITY.md` means no published contact path for a security researcher to report a vulnerability privately. No `CHANGELOG.md` means release notes live only in `git log` + `READY_TO_DEPLOY` + the tracker (which is implementation status, not a changelog).
5. **DOC-05** — API surface has no human-readable reference. `src/app/api/` contains 23 `route.ts` files; the only doc that touches any of them is `EXTERNAL_SERVICES_UAT.md` (Meta / TikTok OAuth only) and `runbook.md` §"Dev-only API helpers" (3 lines). No OpenAPI / Swagger, no per-route reference, no request/response schema. The `agencies/[agencyId]/social/dek/rotate` and `dek/reset-recovery` endpoints have zero documentation.
6. **DOC-06** — `docs/architecture/data-model.md` only documents identity/tenancy, not the full schema. The other 17 schema files (`ai.ts`, `audit.ts`, `brand-kit.ts`, `channels.ts`, `content.ts`, `deliveries.ts`, `discussions.ts`, `notifications.ts`, `planning.ts`, `plans.ts`, `publishing.ts`, `social-analytics.ts`, `social-dek.ts`, `support.ts`, `usage.ts`, `workspaces.ts`) are not covered. There is no ERD. **38 of the 47 public tables are undocumented.**
7. **DOC-07** — Environment promotion path (dev → staging → prod) undocumented. Master prompt §24.1.5 requires three environments; `AGENTS.md:169` says "Staging before production: not yet (single-environment for v1, see Goal 14)"; `CODE_REVIEW_2026-08-20.md:546` row 35 lists it with a 3-day estimate but no plan file. `find . -name "staging*"` returns nothing.

**P1 highlights**: missing migration catalogue for 0012-0017; no migration-author conventions; no general coding-conventions doc; no detailed testing-conventions doc; no PR review / release checklist; AI provider switch procedure undocumented; no recipe for adding a new social provider; no recipe for adding a new role; `AGENCY_COOKIE_SECRET` not in `environment.md`; `READY_TO_DEPLOY.md` env-var names inconsistent with `environment.md` (uses `GOOGLE_OAUTH_CLIENT_ID` while the code uses `GOOGLE_CLIENT_ID` — operators following `READY_TO_DEPLOY.md` will be blocked at preflight).

**Meta-observation**: The pre-flight evidence in `docs/production-readiness/` (especially `EXTERNAL_SERVICES_UAT.md`, `MIGRATION_DEPLOYMENT.md`, `UAT_RELEASE.md`, `AUTH_AUDIT_2026-08-20.md`, `POSTGRES_AUDIT_2026-08-20.md`) is the kind of pre-launch evidence most teams only write after an incident. The 51-case Stitch contract and `migration-journal-order.test.ts` regression guard are the right shape.

**Stale check**: `MIGRATION_DRILL_RESULTS.md` is the only doc that is concretely stale (5/5 drill results live in `MIGRATION_DEPLOYMENT.md`, not in the drill-results file itself). No broken `.md` cross-references inside `docs/` or root files (55 + 11 links checked, 0 broken). The one link-shaped gap is `0001-vps-port.md`, captured as DOC-01.

**Concrete reconciliation win**: 4 of the 7 P0s are cheap — DOC-01 is a single ADR, DOC-04 is 5 standard files, DOC-08 is a copy-paste of the existing 0005/0009-0011 template, DOC-17 is a `sed` against `READY_TO_DEPLOY.md`. DOC-06 (full ERD) is the hardest and needs a `drizzle-erd` script in `scripts/`.

## Axis 4 — Test quality (worker 4)

**Findings**: 20 (4 P0, 8 P1, 7 P2, 1 Info). Full report: `tmp/full-review/test-gaps.md` (192 lines).

**Top P0**:

1. **TEST-01** — §23 30-step journey test covers **4 of 30** steps. `tests/integration/journey.test.ts:174-250` — the entire `describe("primary acceptance journey (§23, service-level)")` block has only 4 `it` blocks: `§23 step 7` (client denial), `§23 step 11` (Quick Create defaults), `§23 step 7/13/15` (workflow rules table regression), `§23 step 7` (out-of-table denial). No test exercises steps 1-3 (bootstrap), 4-6 (workspace + invitation), 8-10 (My Work + Quick Create UI), 12-14 (more details, submit review, request changes cycle), 16-22 (client clarification, delivery V1/V2, creative approval, client review, ready-to-publish), 23-26 (record published/failed/skipped, final aggregate), 27-30 (consistency, archive/restore, mobile, keyboard). The tracker and §24 "Functional gates" both assert the 30-step journey is covered. **CI gates deploys on a coverage claim that is materially incomplete** — the 4 tested step mappings exercise ~3% of the journey's decision points.
2. **TEST-02** — `tests/e2e/social-connections.spec.ts:36-44` is a vacuous test with **zero assertions**. The file's own header admits "the full happy-path (Connect → Picker → Finalize → Sync → Disconnect) is exercised in the unit + integration suites" — but a search for that unit test in `tests/unit/social-*.test.ts` finds no `ConnectionActions` test. This is a literal useless test that gives CI a green checkmark for "we have a connection flow" while asserting nothing.
3. **TEST-03** — The visual-regression spec is non-functional in production CI; QA-004 baseline is permanently "PENDING". `tests/e2e/visual-regression.spec.ts:1-101` plus tracker `PRODUCTION_READINESS_TRACKER.md:128` (QA-004 row) say "PENDING on committed baselines" + "the capture step consistently hits the 25-min CI job budget" + "the visual capture + critical-e2e job is now non-gating for prod deploy". The `.gitignore` excludes the snapshot dir entirely. §24 "Quality gates" line "Visual regression changes are reviewed" is unmet. This is the single largest gap between the test plan and the test reality.
4. **TEST-04** — §23 step 1-3 (first-admin bootstrap concurrency) has only one integration test path covered. The integration test for the real `SELECT FOR UPDATE` race is not in the test tree; the only `TRUNCATE ... CASCADE` + `INSERT admin + INSERT agency + INSERT membership` flow at the integration level is in `journey.test.ts`, and only as setup, not as an assertion. The unit tests mock the DB; a race that lets two browsers both succeed step 3 would not be caught.

**P1 highlights**: `src/lib/auth/agency-context.ts`, `src/lib/notifications/service.ts`, `src/lib/social/service.ts`, `src/lib/usage/record-usage.ts`, `src/lib/auth/current-actor.ts`, `src/lib/auth/platform-admin-gate.ts` — all have no direct unit test; e2e tests assert `expect(res.status()).toBeLessThan(500)` (8+ files) instead of specific contract status; `dev-sign-in-retry.test.ts:111-123` is a wall-clock assertion (flake risk); e2e happy-paths stop one transition short of the documented coverage.

**Meta-observation** (most important): **the §23 claim is overstated**. The tracker and §24 both assert the 30-step journey is covered, but the only test that names §23 covers 4 steps. The remaining 26 are exercised in fragments across `content-flow.spec.ts` (3 transitions), `discussions.spec.ts` (4), and unit-tier policy mocks — no single test walks the multi-actor flow from Quick Create through Published. This is the audit's biggest surprise relative to the tracker's claims.

## Axis 5 — Other (Security / Observability / Performance / A11y / DB / CI / Code-quality) (worker 5)

**Findings**: 20 (1 P0, 5 P1, 12 P2, 2 Info). Full report: `tmp/full-review/other-gaps.md` (217 lines).

**The single P0**:

1. **OTHER-01** — **Wrong-table query + hard-coded `platform='instagram'` filter in `finalizeMetaSelectionAction`.** This is the audit's only finding that is a real, production-shippable bug today.
   - `src/app/(app)/app/w/[slug]/channels/actions.ts:191-195` — first query selects from `socialChannels` (wrong table; should be `socialConnections`) and the result is assigned to a variable named `connection` that is then `void`-ed at line 235 (dead query, never checked).
   - `src/app/(app)/app/w/[slug]/channels/actions.ts:202-213` — second query hard-codes `eq(socialChannels.platform, "instagram")` for the candidate list, so the "find existing channel for this external account" lookup only ever returns Instagram channels. A Facebook Page or TikTok finalization will never find a match, forcing a duplicate `social_channel` row to be inserted on every reconnect.
   - The `for (const profile of parsed.data.profiles)` loop then runs sequentially without a transaction wrapper, so a partial failure mid-loop leaves the `social_connection` in `pending_selection` with some channels linked and some not.
   - **Independently verified by direct read of the file** (audit did not just trust the worker).
   - **Tracker link**: new — not in tracker. Pre-dates the SEC-003 audit because this is a server action, not an API route, so the role-by-route matrix did not exercise it.

**P1 highlights**:
- **OTHER-02** — N+1 in `hasWorkspaceRole` called 6× per planning detail render (`planning/[id]/page.tsx:54-61`). 6 sequential calls = ~12-18 round-trips. The hottest page in the app. Fix: `getWorkspaceRoles(actor, workspaceId)` returning a single query.
- **OTHER-03** — No structured log for `failed to write audit event` + broader `console.log/error in production code` debt. OBS-001 has `logError` wired but call sites are sparse (only `ai/generate/route.ts`, `platform/agencies.ts`, `platform/admins.ts` use it). 10+ `console.error` sites bypass it. Sentry is configured with `tracesSampleRate: 0.1` and 0% of these errors will ever make it to Sentry.
- **OTHER-04** — No request-correlation ID propagated through API routes and server actions. Only 2 routes read `x-request-id`; framework doesn't mint one. `logError` emits a `timestamp` but no `requestId`/`traceId`. The OBS-001 narrative claims "request-correlated logs" but the correlation ID is a header almost no caller sets.
- **OTHER-05** — `signin/page.tsx` captures `input.cause` and posts to Sentry from a client component. The captured payload travels the client→Sentry tunnel and is therefore observable to anyone with a `report-uri` or browser-extension access. The fix: move Sentry capture to the server action helper.
- **OTHER-10** — DB migration `CREATE INDEX` without `CONCURRENTLY` (74 matches across 18 migrations). On a busy production table this is a downtime risk. The fix: `CREATE INDEX CONCURRENTLY` (must run outside a transaction, so the migrator needs a different mode).

**P2 highlights** (12): shallow `/api/health` (only DB; no rate-limit table, Sentry, storage); `archiveChannelAction` returns `void` on every error path; no per-route `error.tsx` in deep routes; no skip-to-content link; partial unique index not mirrored in Drizzle schema; `console.log` in migrator; auth-events silent failures; O(n×m) mention extraction in `discussions/service.ts`; swallowed audit failures; unbounded audit tables; inconsistent `Cache-Control`; duplicate Sentry init in `instrumentation*.ts`.

**Meta-observation**: The "other" axis is large by surface area but mostly **polish and defense-in-depth** rather than exploitable. The M3a deploy chain + SEC-001..006 + OBS-001 + DEP-001 + QA-005 work has bought the project a solid baseline. The two real issues are:

1. **OTHER-01** — the only exploitable/incorrectness finding.
2. **Observability is the biggest residual gap**. Sentry SDK is wired in 3 places, `logError` exists with secret scrubbing, but call sites are sparse.

No live TODO/FIXME debt, no `@ts-ignore`/`@ts-expect-error`, no `console.log` in production app code (only the migrator). `.env` is properly gitignored. **The codebase is unusually clean for a project this size** — the gaps are at the integration seams, not in code hygiene.

## Cross-axis P0 list (the 26 must-fix-before-READY)

Numbered in the order they should be addressed (impact × ease of fix). Track this list as a new tracker section `GAP-FULL-REVIEW-2026-08-25` when the verdict is next reviewed.

| # | ID | Title | Axis | Effort |
|---|----|-------|------|--------|
| 1 | OTHER-01 | `finalizeMetaSelectionAction`: wrong-table dead query + hard-coded `platform='instagram'` + non-tx loop | Other (security) | XS (1 server action) |
| 2 | TEST-01 | §23 journey test covers 4/30 steps | Tests | M (extend or split) |
| 3 | TEST-03 | Visual regression is non-functional in CI (QA-004 PENDING) | Tests | S (re-enable gating + commit baselines) |
| 4 | TEST-02 | `social-connections.spec.ts` is a vacuous shell | Tests | XS (delete or wire) |
| 5 | TEST-04 | Bootstrap concurrency has no real `SELECT FOR UPDATE` race test | Tests | S (mirror `invitation-concurrency.test.ts`) |
| 6 | FEAT-01 | In-app notifications stubbed to comment mentions only (10/11 §12 kinds never fire) | Features | M (extend `dispatchOutboxOnce` per-kind handlers) |
| 7 | FEAT-02 | No outbox dispatcher scheduled | Features | S (new cron + route) |
| 8 | FEAT-03 | AI capabilities 50% missing (3 of 6 return 501) | Features | M (3 prompt builders + tests) |
| 9 | FEAT-04 | AI Insert / Replace / Try Again buttons missing | Features | S (3 buttons + 2 server actions) |
| 10 | FEAT-05 | AI context manifest is a stub (always logs same 4 categories) | Features | S (context-selection block + log actuals) |
| 11 | FEAT-06 | Planning library CRUD absent (3 of §14 mandatory commands missing) | Features | M (3 service modules + 4 actions + UI) |
| 12 | FEAT-07 | 8 §14 required commands missing across services | Features | L |
| 13 | FEAT-08 | Notification preferences are dead schema | Features | S |
| 14 | FEAT-09 | Planning list filters/search/pagination missing | Features | S |
| 15 | FEAT-10 | No email worker (outbox-driven bulk) | Features | M |
| 16 | FEAT-11 | Rate-limit scopes missing (`upload_sign`, `password_reset_request`) | Features | S |
| 17 | UX-01 | `FormField` type contract breaks `<select>`/`<textarea>` focus ring | UI/UX | XS (extract `SelectField`/`TextareaField`) |
| 18 | UX-02 | Three non-existent utility classes ship in production (`text-secondary`, `text-danger-fg`, `text-h3`) | UI/UX | XS (sed across 6 files) |
| 19 | UX-03 | Hand-rolled `RevokeDialog` + 2 other modals skip focus trap | UI/UX | S (use `dialog.tsx`) |
| 20 | DOC-01 | Missing `docs/decisions/0001-vps-port.md` (referenced but absent) | Docs | XS (single ADR) |
| 21 | DOC-02 | Missing `docs/operations/incident-response.md` | Docs | S |
| 22 | DOC-03 | No RPO / RTO documented for backup/restore | Docs | S (numbers from owner + writeup) |
| 23 | DOC-04 | Standard GitHub files missing (`LICENSE`, `CHANGELOG.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`) | Docs | S |
| 24 | DOC-05 | API surface has no human-readable reference (23 route.ts, 0 docs) | Docs | M (1 doc + OpenAPI YAML) |
| 25 | DOC-06 | `docs/architecture/data-model.md` only covers identity/tenancy; 38 of 47 tables undocumented | Docs | L (rename + new doc + ERD) |
| 26 | DOC-07 | Environment promotion path (dev → staging → prod) undocumented | Docs | S |

(Total P0 count = 26 = 1 + 4 + 11 + 7 + 3. The "Other" axis has only 1 P0 but it is the highest-impact single item.)

## P1 highlights (the next 31 — not blocking but should land before "ship to many customers")

Full P1 list in each per-axis report. Cluster themes:

- **Polish-batch 2 on M3/M4 surfaces** (UX P1s, the 8 P2s) — one coordinated commit.
- **Observability hardening** (OTHER-03, -04, -05) — `captureError(scope, err, ctx)` wrapper + request-id middleware. Sentry alert rules.
- **Performance** (OTHER-02) — `getWorkspaceRoles` helper; migrate the 3 hottest pages.
- **DB migration hardening** (OTHER-10) — `CREATE INDEX CONCURRENTLY` requires the migrator to run outside a tx; one-time `scripts/migrate-concurrent.ts`.
- **Unit test coverage on 6 service modules** (TEST-05..09) — cheap insurance.
- **Migration catalogue 0012-0017** (DOC-08) — copy the 0005/0009-0011 template.
- **General coding-conventions / testing-conventions / PR-release-checklist** (DOC-09, -10, -11, -12) — the "recipe for the next contributor" gap.
- **AI provider switch procedure + new social provider recipe + new role recipe** (DOC-13, -14, -15) — operational recipes the next owner will need.
- **`AGENCY_COOKIE_SECRET` missing from `environment.md`** (DOC-16) — operator misconfig risk.
- **`READY_TO_DEPLOY.md` env-var names inconsistent with `environment.md`** (DOC-17) — `sed` fix, but deploy-blocking.

## Recommendation: what to fix before flipping the verdict to `READY`

The shared verdict in `PRODUCTION_READINESS_TRACKER.md` and `UAT_RELEASE.md` is currently `READY FOR INDEPENDENT REVIEW`. The independent-reviewer step is the right next move **only after the audit's P0 list is addressed**. The minimal viable order:

**Sprint 1 — Bug class (≤ 1 day)**
- OTHER-01 (XS)
- UX-01, UX-02, UX-03 (XS × 3 — they cluster: one PR fixes the form / token / modal batch)
- FEAT-02 (S — outbox cron)
- FEAT-04 (S — 3 AI buttons)
- FEAT-05 (S — context manifest)
- FEAT-08, FEAT-09, FEAT-11 (S × 3)
- DOC-01 (XS), DOC-17 (XS)

**Sprint 2 — Coverage class (2-3 days)**
- TEST-01 (M — extend `journey.test.ts` or split into per-step files)
- TEST-02 (XS — delete or wire)
- TEST-03 (S — re-enable visual capture gating + commit 138 baselines on CI; this is the biggest cost item because it requires the CI runner budget)
- TEST-04 (S — mirror `invitation-concurrency`)
- FEAT-01 (M — notification dispatch handlers per-kind)
- FEAT-03 (M — 3 AI prompt builders)
- FEAT-06 (M — planning library CRUD)
- DOC-02, DOC-03, DOC-04, DOC-07 (S × 4)

**Sprint 3 — Documentation + the deferred items (1-2 days)**
- DOC-05, DOC-06 (M + L — API reference + full schema doc)
- FEAT-07 (L — 8 §14 commands)
- FEAT-10 (M — email worker)
- All remaining P1 from each per-axis report

After Sprint 1 the codebase is no longer "production-shippable risk today" and the open-vs-closed gap on §23, AI, notifications, and library is reasonable. After Sprint 2 the visual regression is real and the §23 journey is genuinely tested. After Sprint 3 the docs are handoff-ready and the deferred features have either shipped or are explicitly marked as P2.

**The owner-supplied work remains the gating step** (Sentry DSN + alert rules, 27-row a11y checklist, 138 visual baselines on CI, §23 30-step UAT, independent reviewer sign-off). This report does not unblock that; it makes the verdict decision honest.

## What this report is **not**

- Not a re-audit of the security, workflow, publishing, deployment, or observability baseline. SEC-001..006, WF-001..004, PUB-001, DEP-001, OBS-001, OPS-001 are `Tested` with evidence; this report does not re-open them unless a fresh vector was found.
- Not a code-style review. The codebase is clean; no live TODO/FIXME debt, no `@ts-ignore`, no `console.log` in production app code. The gaps are at the integration seams.
- Not a recommendation to revert M1-M4. The merged milestones are correct; the gaps are features that were not in their scope (planning library, AI capabilities, full notification kinds).
- Not a substitute for the §23 30-step UAT or the manual a11y checklist. Both still need a human.

## Provenance

- Audit date: 2026-08-25
- Repo state: `main` at sha `1f19416`, working tree clean, 3 commits ahead of `origin/main` (all `docs(auth):` planning)
- Method: 5 parallel audit workers (UI/UX, Features, Docs, Tests, Other), 20 max findings each, ranked by impact, evidence = `file:line`
- Per-axis reports: `tmp/full-review/{ui-ux,feature,docs,test,other}-gaps.md` (1,636 lines total)
- Verification: OTHER-01 independently re-read by parent session before synthesis
- Worker dispatched via: `task` tool, 5 calls in parallel
