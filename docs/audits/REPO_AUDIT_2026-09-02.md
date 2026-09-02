# LaraTik Planner — Repository Audit

Date: 2026-09-02  
Implementation and test-evidence baseline: `2727275c3dc93dcaaa9de64acc3acb11863e21a4` (`main`, clean)
Audit report update: committed after this evidence capture
Audit framework: repository instructions, `STUDIOFLOW_MASTER_PROMPT.md`,
`PRODUCTION_READINESS_TRACKER.md`, and UI/UX Pro Max accessibility, interaction,
responsive, performance, typography, motion, and data-display guidance.

## Executive verdict

The repository has a strong production foundation and a broad quality harness.
The current checkpoint passes formatting, ESLint, strict TypeScript, the full
unit suite, a clean production build, and 192/192 isolated Chromium tests.
Both mobile browser engines now pass the complete cross-role content workflow.
It is not yet final-production-ready because the complete Stitch visual suite
still has 50 baseline deltas, repeatable performance evidence is incomplete,
and independent visual/accessibility review remains open.

The canonical product visual source is `designs/stitch/` and the tokens in
`src/app/globals.css`. UI/UX Pro Max is used here as a review framework; its
generic generated palette must not replace the StudioFlow/Stitch visual system.

## Baseline evidence

| Gate                   | Result                | Evidence                                                                        |
| ---------------------- | --------------------- | ------------------------------------------------------------------------------- |
| Prettier               | Pass                  | `pnpm format:check`                                                             |
| ESLint                 | Pass                  | `pnpm lint`                                                                     |
| TypeScript             | Pass                  | `pnpm exec tsc --noEmit --incremental false`                                    |
| Unit tests             | Pass                  | 303 files; 3,051 passed; 4 todo                                                 |
| Production build       | Pass                  | `pnpm build`                                                                    |
| Migration drill        | Pass                  | 5/5 drills on disposable `planner_test`                                         |
| Integration tests      | Pass                  | 22 files; 187 tests on disposable `planner_test`                                |
| Focused E2E/a11y       | Pass                  | 24/24 a11y routes; 6/6 Brand Kit journeys; focused Publishing + Settings axe    |
| Focused functional E2E | Pass                  | 8/8 health + error; 19/19 role matrix; 6/6 Add Directly; isolated upload probe  |
| Full Chromium E2E      | Pass                  | 192/192 isolated Chromium tests, including full §23 workflow                    |
| Cross-engine targeted  | Pass                  | Settings 4/4; WebKit list + §23; mobile Chrome + mobile Safari full §23 paths   |
| Visual regression      | Partial / investigate | 62/112 pass; 50 Stitch baseline deltas; do not update snapshots blindly         |
| Working tree           | Clean                 | Exact source/test evidence baseline: `2727275c3dc93dcaaa9de64acc3acb11863e21a4` |

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
3. **User-facing copy is not fully catalog-backed.** Known hotspots include
   library forms, quick create/edit, delivery, AI assistance, publish forms,
   social analytics, approval timeline, platform preview, workflow stepper, and
   AI diagnostic UI.
4. **Exact-HEAD visual and accessibility evidence is incomplete.** Existing
   candidate snapshots do not replace final human comparison, keyboard,
   screen-reader, zoom, and reduced-motion sign-off.
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
8. Ensure isolated E2E server processes are reliably cleaned up before a build;
   this audit observed an orphan Next dev server competing with `next build`.
   The runner now cleans its disposable upload directory and restores generated
   config files, but interrupted runs can still leave a development server or
   `.next` lock behind and need a process-lifecycle fix.
9. Reconcile the visual suite with the current canonical Stitch implementation.
   The 50 failures are structural/token deltas, especially the intentionally
   expanded anchor-based Settings surface; each needs reviewed evidence before
   a snapshot is accepted.

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
translation boundaries. Then run the bilingual route matrix.

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
and performance measurements at the exact clean commit. The migration drill,
integration suite, axe checks, full isolated Chromium flow, mobile Chrome and
Safari §23 journeys, targeted cross-engine checks, and unit/build gates are
evidenced. Visual parity and performance evidence remain open.

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
