# Changelog

All notable changes to `laratik-planner` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/)
(roughly — pre-1.0 the version is implied by the release tag).

Release tags are immutable; the most recent tag is the source of
truth for the "Latest" section below. Older releases are listed under
"Released" with the matching tag, the date, and a one-line summary
copied from `git log <prev>..<tag>` at tag time.

## [Unreleased]

### Changed — Planning Content Detail refactor (2026-08-30)

Redesigned the `/app/w/[slug]/planning/[id]` page per the StudioFlow M5
spec. The page now ships with a state-driven tab workspace
(`Overview / Content / Publishing / Activity`), a persistent
right-side `WorkflowRail` with collapse/expand + localStorage
persistence, a mobile `WorkflowSheet` (bottom sheet) for `<lg`
viewports, an in-place `EditDetailsDrawer`, and an absorbed
publishing setup that lives inside the Publishing tab.

- **Workflow rail (replaces the top `WorkflowBar`)** —
  extracted to `src/components/planning/workflow-rail.tsx`. The
  640-line legacy `WorkflowBar` is deleted; its action button
  tree, approval timeline, and per-status explanation move into
  the new rail. The rail renders as a right-side column on
  `lg+` and a compact trigger + bottom sheet on `<lg`.
- **Tab mechanism** — `WorkspaceTabs` converted from a
  scroll-spy implementation (sections all rendered, strip just
  highlighted the one in view) to a state-driven Radix `Tabs`
  panel switcher. The URL hash still updates so deep links
  (`#content`, `#publishing`, etc.) keep working; the shell
  listens to `hashchange` to mirror the hash into state.
- **Creative merged into Content as "Assets & versions"** —
  the orphan `<section id="creative">` (reachable only via a
  hash link that wasn't in the tab strip) is removed; the
  designer delivery + version history now lives at the end of
  the Content panel under the user-facing label "Assets &
  versions". The internal `delivery_versions` schema and
  `DeliverySection` component are unchanged.
- **Overview → DetailsSection** — the old "At a glance" card
  and the Content tab's "Basic information" block are collapsed
  into a single `DetailsSection` in the Overview. The Content
  tab now opens directly with the creative brief + live
  preview, which is the working surface the planner actually
  came for.
- **EditDetailsDrawer** — the header's `Edit content` CTA now
  opens a right-side Radix `Dialog` (with focus trap + Escape)
  that hosts the existing `EditIdeaForm`. The dedicated
  `/edit/[id]` route is preserved as a deep-link fallback
  (drawer has an "Open full editor" link to it).
- **Publishing tab absorption** — the 784-line
  `PublishPackageForm` is mounted inside the Publishing tab.
  The standalone `/publish` route is a thin server-side
  redirect to `?tab=publishing`.
- **Terminology sweep** — "Approved delivery version" → "Approved
  version" in the publish form. The internal `delivery_versions`
  schema and `DeliveryVersion` types are unchanged.

### Removed

- `src/app/(app)/app/w/[slug]/planning/[id]/workflow-bar.tsx`
  (the legacy top-of-page component; replaced by `WorkflowRail`).
- `data-testid="open-full-edit"` (replaced by
  `data-testid="open-edit-details-drawer"`).
- `data-testid="content-basic-info"` (merged into the Overview's
  `DetailsSection`).
- `data-testid="workspace-tab-panel-creative"` (the Creative
  section is now nested inside the Content panel).
- `data-testid="open-publish-package"` (no longer needed; the
  publish form is in front of the user on the Publishing tab).
- `data-testid="publish-package-root"`, `publish-back`,
  `publish-readiness-summary`, `publish-ready-badge`,
  `publish-blocked-badge`, `publish-issues-list`,
  `publish-issue-*` (these lived on the now-redirect `/publish`
  route; the readiness presentation is owned by
  `src/lib/publishing/readiness-presentation.ts`).

### Changed — test contracts

- `tests/unit/publishing/publish-page-no-paths.test.tsx` —
  rewritten to assert the new state (publish page is a thin
  redirect; the presentation helper still exists for callers).
- `tests/unit/planning/overview-command-center.test.tsx` —
  updated to expect the new `assets-versions` anchor on the
  Creative row and the Next-Action CTA.
- `tests/unit/workflow-bar-statuses.test.tsx` and
  `tests/unit/planning-hooks-order.test.tsx` — migrated to
  test the new `WorkflowRail` (the legacy `WorkflowBar` is
  deleted; the old tests would no longer compile).
- `tests/e2e/a11y-routes.spec.ts` and
  `tests/e2e/publish-package.spec.ts` — updated to navigate
  to the planning detail page with `#publishing` instead of
  the now-redirect `/publish` route; both wait for the
  `publish-package-form` to mount before exercising controls.

### Quality gate

- `prettier --check` ✓
- `eslint --max-warnings=0` ✓
- `tsc --noEmit` ✓
- `vitest run` — 256 files, 2,714 tests, 4 todo ✓
- `next build` ✓ (Compiled successfully in 14.3s, 28/28 pages)

### Manual follow-up (dev stack only)

Visual regression snapshots are stale because the page
layout changed (right-side rail, no top workflow bar, no
Basic information block, drawer instead of full-page edit).
Regenerate with:

```bash
PW_VISUAL_CAPTURE=1 pnpm test:visual:update
git status tests/e2e/visual-regression.spec.ts-snapshots/
pnpm verify:visual
```

## Latest

### `releases/v32851343347-cb8e64a76` — 2026-08-25

- Sprint 2 + 3 feature merge: notifications outbox + email worker cron (FEAT-10), agency services §14 (FEAT-07), 3 missing §15 AI capabilities (FEAT-03), library CRUD (FEAT-06), 11 mandatory in-app notification kinds (FEAT-01 / FEAT-07).
- Post-incident follow-up: the 2026-08-24 skipped-migration 0012 incident remediation (forward-repair migration 0017, tightened `/api/health/ready` ledger check, `migration-journal-order` unit test).
- Docs hardening: incident-response runbook, backup-recovery RPO/RTO scaffold, full API surface reference, complete data-model coverage, environment promotion plan, and the 5 standard GitHub files at the repo root.

## Released

### `releases/v32849192776-f615ac40b` — 2026-08-25

- Pre-Sprint-2 production-readiness commit on main.

### `releases/v32838902590-46aaf9dea` — 2026-08-25

- Pre-Sprint-2 production-readiness commit on main.

_For the full per-commit history, run `git log --oneline --decorate`._
