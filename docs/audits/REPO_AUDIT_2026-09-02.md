# LaraTik Planner — Repository Audit

Date: 2026-09-02  
Broad browser/evidence baseline: `2727275c3dc93dcaaa9de64acc3acb11863e21a4`  
Current audited commit: `0c77e50` (`main`, clean)
Audit report update: committed after this evidence capture
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

| Gate                   | Result                | Evidence                                                                             |
| ---------------------- | --------------------- | ------------------------------------------------------------------------------------ |
| Prettier               | Pass                  | `pnpm format:check`                                                                  |
| ESLint                 | Pass                  | `pnpm lint`                                                                          |
| TypeScript             | Pass                  | `pnpm exec tsc --noEmit --incremental false`                                         |
| Unit tests             | Pass                  | 308 files; 3,068 passed; 4 todo at current HEAD                                      |
| Production build       | Pass                  | `pnpm verify` at current HEAD                                                        |
| Migration drill        | Pass                  | 5/5 drills on disposable `planner_test`                                              |
| Integration tests      | Pass                  | 22 files; 187 tests on disposable `planner_test`                                     |
| Focused E2E/a11y       | Pass                  | Exact HEAD: 28/28 axe routes; Arabic/RTL 1/1 with no horizontal overflow             |
| Focused functional E2E | Pass                  | 8/8 health + error; 19/19 role matrix; 6/6 Add Directly; isolated upload probe       |
| Full Chromium E2E      | Pass                  | 192/192 isolated Chromium tests, including full §23 workflow                         |
| Cross-engine targeted  | Pass                  | Settings 4/4; WebKit list + §23; mobile Chrome + mobile Safari full §23 paths        |
| Visual regression      | Partial / investigate | Clean-run selected planning cases 3/18; 15 failed; no snapshot updates               |
| Performance evidence   | Protocol only         | `docs/testing/performance-report.md`; LCP/INP/CLS, asset, and query evidence pending |
| Working tree           | Clean                 | Current audited HEAD: `0c77e50`                                                      |

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
   and the absorbed publish redirect.
3. **User-facing copy is not fully catalog-backed.** This audit pass closed the
   planning preview, workflow stepper and rail explanations, approval timeline,
   delivery-version card, AI assistance surface and platform selector, and the
   quick-create/edit/batch forms in commits `18b0da1`, `55a8c3c`, `fdc304e`,
   `df2d994`, `b610e52`, `d3f5b28`, `64cf4c9`, and `75081f0`. Remaining hotspots
   include library forms, publish forms, social analytics, and AI diagnostic
   UI. The static scan must be repeated after each localization batch because
   dynamic catalog keys are not fully discoverable.
4. **Exact-HEAD visual review is incomplete.** Exact-HEAD axe and RTL checks
   pass, but the visual suite still has reference deltas and the required
   keyboard, screen-reader, zoom, and reduced-motion review is not independently
   signed off.
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

### P2 — maintainability and quality

1. Large components, especially the app shell/sidebar, should be split by
   responsibility without changing behavior.
2. **The stale `@/hooks` alias is resolved.** `components.json` now lists only
   aliases that exist in this repository; add a hooks alias only when a real
   `src/hooks` boundary is introduced.
3. Add enforceable import boundaries between UI, routes, domain services, and
   persistence.
4. Add SQL/migration linting and shell/config coverage to the staged quality
   path.
5. Remove React `act` warnings and JSDOM navigation warnings from unit output.
6. Replace the four pending TODO tests with explicit tracked coverage or an
   approved reason for keeping them pending.
7. Add repeatable LCP, INP, CLS, bundle, image, font, and slow-query evidence.
8. **The isolated browser runner now resets only the disposable test database.**
   Commit `f5cb2d8` adds a URL- and environment-guarded reset that preserves the
   Drizzle migration ledger before every isolated browser run. This removes
   prior-suite rows from visual fixtures and prevents mutable test state from
   changing screenshot heights. Interrupted runs can still leave a development
   server or `.next` lock behind and need a process-lifecycle fix.
9. Reconcile the visual suite with the current canonical Stitch implementation.
   The broad pre-reset run produced 52 passes and 60 failures. After the reset,
   the selected planning run at the current source produced 3 passes and 15
   failures. The former 6,305px planning height was reduced to a deterministic
   single-seed fixture; remaining differences include stale references containing
   an `A11y detail <timestamp>` row, plus route-level spacing/copy deltas. These
   require route-by-route comparison against Stitch and deliberate snapshot
   decisions; no snapshots were updated automatically.

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
`docs/testing/performance-report.md`; actual LCP/INP/CLS, asset-budget, and
EXPLAIN ANALYZE measurements remain open. Visual parity also remains open.

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
