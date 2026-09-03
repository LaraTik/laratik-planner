# LaraTik Planner — Repository Audit

Date: 2026-09-02  
Broad browser/evidence baseline: `2727275c3dc93dcaaa9de64acc3acb11863e21a4`  
Last exact-clean verification HEAD: `d6b3149` (`main`, clean at verification)
Audit report update: 2026-09-03, after the planning responsive-header follow-up
Audit framework: repository instructions, `STUDIOFLOW_MASTER_PROMPT.md`,
`PRODUCTION_READINESS_TRACKER.md`, and UI/UX Pro Max accessibility, interaction,
responsive, performance, typography, motion, and data-display guidance.

## Executive verdict

The repository has a strong production foundation and a broad quality harness.
The current checkpoint passes formatting, ESLint, strict TypeScript, the full
unit suite, and a clean production build. Exact-HEAD accessibility coverage is
29/29: 28 public/authenticated axe route checks plus the Arabic/RTL shell
contract. The earlier browser baseline also passed 192/192 isolated Chromium
tests and the complete mobile workflow. It is not yet final-production-ready
because the Stitch visual suite still has substantial reference deltas,
repeatable performance measurements are incomplete, and independent visual
review remains open.

The canonical product visual source is `designs/stitch/` and the tokens in
`src/app/globals.css`. UI/UX Pro Max is used here as a review framework; its
generic generated palette must not replace the StudioFlow/Stitch visual system.

## Baseline evidence

| Gate                   | Result                | Evidence                                                                                                                                                       |
| ---------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prettier               | Pass                  | `pnpm format:check`                                                                                                                                            |
| ESLint                 | Pass                  | `pnpm lint`                                                                                                                                                    |
| TypeScript             | Pass                  | `pnpm exec tsc --noEmit --incremental false`                                                                                                                   |
| Unit tests             | Pass                  | 318 files; 3,108 passed; 4 todo at exact clean verification HEAD `d6b3149`                                                                                     |
| Production build       | Pass                  | `pnpm verify` at exact clean verification HEAD `d6b3149`                                                                                                       |
| Migration drill        | Pass                  | 5/5 drills on disposable `planner_test` at clean evidence HEAD `5625acd`                                                                                       |
| Integration tests      | Pass                  | 23 files; 189 tests on disposable `planner_test` at clean evidence HEAD `5625acd`                                                                              |
| Dependency audit       | Pass                  | Four transitive `fast-uri` highs were found and resolved by the `>=3.1.6` pnpm override in `bfb350d`; `pnpm audit --prod` now reports no known vulnerabilities |
| Focused E2E/a11y       | Pass                  | Exact HEAD: 28/28 axe routes; Arabic/RTL 1/1 with no horizontal overflow                                                                                       |
| Focused functional E2E | Pass                  | 8/8 health + error; 19/19 role matrix; 6/6 Add Directly; planning filter URL contract 5/5 browser contexts; isolated upload probe                              |
| Full Chromium E2E      | Pass                  | 192/192 isolated Chromium tests, including full §23 workflow                                                                                                   |
| Cross-engine targeted  | Pass                  | Settings 4/4; WebKit list + §23; mobile Chrome + mobile Safari full §23 paths                                                                                  |
| Visual regression      | Partial / investigate | Full matrix at exact clean audit state `d6b3149`: 73/112; 39 failed; no snapshot updates; route fixes and deliberate snapshot decisions remain required        |
| Performance evidence   | Partial / baseline    | Static inventory, local public-route baseline, and tiny-fixture query plans; throttled/authenticated/INP/scale evidence pending                                |
| Working tree           | Audit changes clean   | Exact code verification was clean at `d6b3149`; this documentation reconciliation is the only follow-up change                                                 |

## Repository inventory

- 65 application pages and 32 route handlers.
- Shared UI, forms, feedback, workspace, planning, brand, AI, and shell
  components under `src/components`.
- Domain services and persistence under `src/lib`.
- English and Arabic message catalogs under `src/messages`.
- Unit, integration, Playwright E2E, visual, migration, and production-readiness
  documentation already exist.
- Google Stitch captures exist under `designs/stitch/`.
- The source tree uses a hybrid route-colocated/domain-library structure rather
  than the feature-folder layout shown in the master prompt.

## Findings by priority

### P0 — release blockers

No reproducible P0 failure remains on the recorded baseline. Any new P0 must be
handled before unrelated cleanup.

### P1 — resolve before independent verification

1. **Settings architecture was inconsistent with the repository contract.**
   Resolved in this audit pass: `/w/[slug]/settings` is now the canonical
   surface with anchor sections because the values share one `workspace_settings`
   row. The former section paths remain compatibility redirects, and navigation,
   action revalidation, tests, and the RTL contract now target the anchors.
2. **Route metadata coverage is now explicit for meaningful pages.** 60 of 65
   page files expose metadata, and a regression test keeps the five deliberate
   exceptions are compatibility/fallback routes: four legacy settings redirects
   and the absorbed publish redirect. The setup route now resolves its title
   through the active catalog in `1b15de9`; its remaining example placeholders
   also moved into both locale catalogs in `fa8d7bf`.
3. **User-facing copy is not fully catalog-backed.** This audit pass closed the
   planning preview, workflow stepper and rail explanations, approval timeline,
   delivery-version card, AI assistance surface and platform selector, and the
   quick-create/edit/batch forms in commits `18b0da1`, `55a8c3c`, `fdc304e`,
   `df2d994`, `b610e52`, `d3f5b28`, `64cf4c9`, and `75081f0`. Remaining hotspots
   include publish forms and AI diagnostic UI. The planning library forms are
   now catalog-backed in both locales and use direction-aware fields, with
   focused Arabic/RTL coverage in `50bf278`. The social analytics aggregate
   summary and growth chart now use the active catalog, server-resolved locale,
   accessible translated SVG copy, and Latin-digit number formatting in
   `a1d7963` and `443092c`. The AI diagnostic panel is now catalog-backed and
   receives the server-resolved translator, with Arabic coverage in `b6efac8`.
   The publish action bar and bilingual free-text controls were also corrected,
   with an Arabic render regression in `b22eb21`. Publish server actions now
   return stable error codes instead of raw domain messages, and the client
   translates them through `contentDetail.publishErrors` in `9dc243a`; mapping
   and render tests pass. Remaining localization work is a lower-priority
   static scan for copy outside these audited surfaces. The account application
   information card is now catalog-backed as well, with Arabic coverage in
   `462db37`, and the shared password visibility control now resolves its
   accessible Show/Hide labels from the active catalog with Arabic toggle
   coverage in `4fb9be8`. The workspace list action menu now also uses the
   active catalog for its trigger and six menu labels, with Arabic menu-role
   coverage in `d6b3149`. The scan must be repeated after each localization
   batch because dynamic catalog keys are not fully discoverable.
4. **Exact-HEAD visual review is incomplete.** Exact-HEAD axe and RTL checks
   pass, but the visual suite still has reference deltas and the required
   keyboard, screen-reader, zoom, and reduced-motion review is not independently
   signed off. A targeted 360px overview run after `85d026b` confirms the
   attention banner no longer collapses its message into one-word lines and its
   CTA meets the touch-target rule, but the assertion remains red because the
   committed reference contains two seeded items while the current deterministic
   fixture contains one (`2949px` expected versus `2792px` actual). No snapshot
   was updated; the fixture/reference decision still requires deliberate review.
5. **Release-gate ownership is now explicit in CI.** Formatting, lint,
   typecheck, unit, migration, integration, coverage, build, and operational
   checks are server-side gates; critical E2E and visual review remain documented
   release-candidate checks with exact-HEAD evidence requirements.
6. **Isolated browser hydration now has a test-runtime CSP exception.** The
   Playwright runner uses Next's Webpack development server with `NODE_ENV=test`;
   its non-production CSP now permits the same `unsafe-eval` required by that
   client runtime, while production continues to prohibit it. The focused
   Publishing deep-link and Brand Kit mutation journeys now pass.
7. **First-login and test-fixture contracts are hardened.** The disposable E2E
   runner now provisions and cleans a writable upload volume; the dev JWT
   preserves `mustChangePassword`; the set-password action rechecks the database
   flag; and sign-out escape controls use the existing CSRF-protected server
   action. Generated passwords now guarantee every class required by the strong
   password meter.
8. **Responsive workflow navigation is resolved at the browser-test level.**
   The full four-context §23 journey now passes in mobile Chrome and mobile
   Safari. The remediation keeps the six-tab strip in one horizontal
   scroll row, allows its flex item to shrink at narrow widths, opens the
   mobile WorkflowSheet explicitly, and scopes actions to the visible rail or
   sheet when both responsive surfaces are mounted in the DOM. Root cause and
   regression coverage are recorded in commit `2727275`.
9. **Planning toolbar filters were not all connected to the server query.**
   Resolved in `ad9cbd9` and `de9fabf`: status, format, stage, channel, owner,
   health, risk, density, and search now have one validated URL parser; stage
   and channel are applied in the enriched list query, active channels populate
   the toolbar, health is applied through the existing post-enrichment contract,
   and pagination/list-to-board links preserve every active filter. Coverage is
   3 parser/description unit tests, 2 disposable-Postgres integration tests,
   and a 5-context browser contract test.
10. **The production dependency audit found four high `fast-uri` advisories.**
    They were transitive through `@sentry/nextjs → @sentry/webpack-plugin →
   webpack → schema-utils → ajv`; `bfb350d` adds a narrow pnpm override and
    refreshes the lockfile to `fast-uri@4.1.4`. Frozen install, dependency-path,
    and `pnpm audit --prod` checks confirm the patched tree and no known
    vulnerabilities. Re-run this audit after dependency upgrades.

### P2 — maintainability and quality

1. Large components, especially the app shell/sidebar, should be split by
   responsibility without changing behavior.
2. **The stale `@/hooks` alias is resolved.** `components.json` now lists only
   aliases that exist in this repository; add a hooks alias only when a real
   `src/hooks` boundary is introduced.
3. Add enforceable import boundaries between UI, routes, domain services, and
   persistence. A known invalid token, `text-danger-fg` in the design-queue
   bulk toolbar, was fixed in `bf151a0`; add a broader custom-token check so
   undefined design tokens cannot silently disappear from compiled CSS.
4. Add SQL/migration linting and shell/config coverage to the staged quality
   path.
5. **The observed React `act` and JSDOM navigation warnings are resolved.**
   The connection re-test, overview navigator, and notification-link tests now
   await asynchronous work inside Testing Library's `act`-aware helpers and
   mock framework navigation at the test boundary. Remaining stderr is from
   intentional security/provider diagnostic assertions, not test-harness noise.
6. **The four pending TODO tests are explicitly tracked.** They are negative
   `safeHref` inputs (`null`, `undefined`, number, object) that are outside the
   public `safeHref(url: string)` contract; accepting them would weaken the
   type boundary. Keep them as backlog candidates only if the API is
   intentionally widened, rather than treating the current TODOs as missing
   production coverage.
7. Add repeatable LCP, INP, CLS, bundle, image, font, and slow-query evidence.
   The static build inventory, unthrottled public-route baseline, and minimal
   fixture query plans are now recorded in
   `docs/production-readiness/PERFORMANCE_LOCAL_2026-09-02.md`; authenticated,
   throttled, interaction, representative-volume, and approved-budget evidence
   remain open.
8. **The isolated browser runner now resets only the disposable test database.**
   Commit `f5cb2d8` adds a URL- and environment-guarded reset that preserves the
   Drizzle migration ledger before every isolated browser run. This removes
   prior-suite rows from visual fixtures and prevents mutable test state from
   changing screenshot heights. Interrupted runs can still leave a development
   server or `.next` lock behind and need a process-lifecycle fix.
9. Reconcile the visual suite with the current canonical Stitch implementation.
   The broad pre-reset run produced 52 passes and 60 failures; the exact clean
   matrix at `d6b3149` produces 73 passes and 39 failures. The deterministic
   runner reset and cold-compile timeout fix are now evidenced, and no snapshots
   were updated automatically. The planning header follow-up in `d6b3149`
   fixes the real tablet squeeze by keeping dense actions below the title until
   the large breakpoint; its remaining exact-reference failure is a stale
   fixture/reference height (1,118px actual versus 1,469px reference). Other
   differences remain concentrated in planning/list/detail/new-content surfaces,
   the settings redesign (3,494px actual versus a 900px reference),
   users/workspace/board responsive layouts, and a deterministic 2px `/setup`
   mobile height delta. These require route-by-route comparison against Stitch
   and deliberate implementation or snapshot decisions. The `/setup` run also
   emitted one Next.js development instrumentation console error about a
   negative performance timestamp; it did not affect the passing screenshot
   assertion and should be rechecked outside the visual harness before being
   treated as an application defect. The targeted overview rerun after
   `85d026b` additionally confirms that the attention-banner mobile layout was
   a real product defect; its remaining assertion difference is data/height
   reconciliation, not a reason to accept a blind snapshot update.

### P3 — polish

- Consolidate stale historical evidence wording.
- Improve naming of overly generic helper/type modules.
- Finish minor spacing, icon, and responsive consistency work after P1/P2.

## Architecture teaching map

```text
Route page/layout
  ├─ authenticates and resolves active agency/workspace context
  ├─ loads view data through typed query/service boundaries
  └─ composes Server and Client Components

Server action / route handler
  ├─ validates untrusted input
  ├─ checks policy and tenant scope
  ├─ delegates to a domain command/service
  └─ returns stable codes or safe serializable data

Domain service
  ├─ owns business rules and workflow transitions
  ├─ owns transaction and audit-event decisions
  └─ calls persistence/integration modules

Persistence / integration
  ├─ owns Drizzle queries and migrations
  ├─ owns external provider calls and secret handling
  └─ never becomes a UI dependency
```

The current hybrid folder structure can remain if these boundaries are made
explicit and tested. Do not perform a repository-wide folder migration merely
to match a diagram.

## Naming and folder rules

- Use kebab-case for source, component, test, and script filenames.
- Keep Next.js route conventions (`[id]`, `[slug]`, `(group)`, `_components)`.
- Name domain modules by responsibility: `queries`, `commands`, `permissions`,
  `schemas`, `service`, and `types`.
- Keep `src/components/ui` primitive-only; product behavior belongs in domain or
  feature components.
- Keep message catalogs free of business logic and keep user-facing copy out of
  components unless it is an explicit approved exception.
- Do not create broad catch-all files such as `helpers.ts` or `misc.tsx`.

## UI/UX Pro Max audit checklist

For each touched screen, record evidence for:

- WCAG contrast, visible focus, keyboard order, labels, descriptions, errors,
  and meaningful image alternatives.
- Minimum 44px touch targets and clear loading/disabled/error feedback.
- Responsive layouts at 375, 768, 1024, 1280, and 1440px with no horizontal
  overflow.
- RTL semantics, logical CSS properties, mixed-direction isolation, and Arabic
  editorial review.
- 150–300ms transitions, reduced-motion behavior, and no hover-induced layout
  shifts.
- Stable image dimensions, appropriate loading, readable body text, and line
  length suitable for scanning.
- Accessible alternatives for charts and data visualizations.

## Ordered implementation plan

### Step 1 — Baseline and ownership

Freeze the exact commit, separate user work from audit work, and capture all
quality commands. Do not use build output as evidence unless the tree remains
at the same clean SHA.

### Step 2 — Resolve settings architecture

Use the repository contract as the default: keep one settings page with anchor
sections, preserve the nested sidebar group, and remove duplicate route behavior
unless an approved ADR demonstrates that the data or authorization path has
diverged.

### Step 3 — Close localization correctness

Run catalog parity, scan static translation keys, review route metadata, move
known hard-coded copy into `src/messages/{en,ar}`, and verify Server/Client
translation boundaries. This pass completed the planning preview, workflow
explanations, AI assistance, delivery cards, and planning forms with Arabic
rendering tests and catalog parity. Exact-HEAD RTL navigation passes 1/1; the
remaining hotspots above still need the same treatment.

### Step 4 — Strengthen component and styling boundaries

Audit token use, shared primitive adoption, focus/touch states, responsive
behavior, icon consistency, and large components. Split only where ownership or
testability improves.

### Step 5 — Make quality gates deterministic

Resolved for the static/unit/migration path in commit `09354a5`: CI now runs
format, lint, typecheck, unit, migration, integration, coverage, build, audit,
Docker, workflow, and shell checks. Keep local hooks fast but never treat them
as the sole release protection; browser and visual evidence remain in Step 6.

### Step 6 — Complete test and performance evidence

Run the disposable database migration drill, integration suite, critical E2E,
full browser matrix, visual snapshots, axe checks, manual accessibility review,
and performance measurements at the exact clean commit. Migration, integration,
exact-HEAD axe/RTL, full isolated Chromium, mobile Chrome/Safari §23,
targeted cross-engine, and unit/build gates are evidenced across the recorded
baselines. The performance protocol is now documented in
`docs/testing/performance-report.md`; public-route LCP/FCP/CLS and minimal-fixture
EXPLAIN observations exist, while authenticated INP, throttled LCP/INP/CLS,
approved asset budgets, and representative-volume plans remain open. The
planning filter remediation is covered by focused unit, disposable-Postgres
integration, and 5-context route-level E2E tests; the broader visual parity
suite remains open.

### Step 7 — Reconcile operations and documentation

Remove stale workflow references, clearly mark historical evidence, verify backup
and restore procedures, complete Sentry/observability ownership, and update the
production tracker with exact command, environment, SHA, artifact, and reviewer
evidence.

### Step 8 — Independent review

The implementer may move work to Tested. Only an independent reviewer should
assign Verified after reviewing the evidence bundle and the rendered product.

## Completion criteria

The audit is complete only when:

- The clean release candidate passes every required gate.
- Settings has one documented navigation model.
- Meaningful routes have localized metadata.
- No unresolved catalog keys or unauthorized hard-coded UI copy remain.
- EN/AR, LTR/RTL, responsive, keyboard, axe, loading, empty, and error states
  are evidenced for touched routes.
- Tenant, authorization, migration, backup, rollback, and secret-handling checks
  are evidenced.
- Performance and visual evidence match the exact clean SHA.
- Documentation contains no stale release instructions.
- An independent reviewer completes final verification.
