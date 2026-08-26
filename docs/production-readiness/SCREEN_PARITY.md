# Canonical Stitch screen parity

Project `5403097764334458790`; design system `assets/e2bbd2e84f524a5eb7e1aa20a22d7531`.

Status values: `Missing`, `Partial`, `Implemented`, `Tested`, `Verified`. Only independent review assigns `Verified`.

## 2026-08-21 update — Stitch contract locked (Task 1 of 13)

The canonical 51-screen Stitch contract is now frozen in
`tests/e2e/stitch-cases.ts` and asserted by
`tests/unit/stitch-cases.test.ts`. The full inventory lives in
[`STITCH_CAPTURE_INVENTORY.md`](./STITCH_CAPTURE_INVENTORY.md). The
math that the matrix has to satisfy going forward:

- **51 captured Stitch references** on disk (PNG + HTML per capture,
  102 files + `DESIGN.md`). Every capture maps to a route or to a
  shared-state evidence group (`operational-states`,
  `notification-drawer`).
- **27 current matrix rows** including `/signin/forgot-password`
  (capture `793a08d8`). The previous "approved deviation" note for
  that screen is obsolete — password reset now exists as a parity
  target, brought online by `c46fc21`.
- **23 unique routes deduped from the 27 canonical cases** (the
  `operational-states` evidence group is not a route, and four
  routes host multiple canonical rows). 23 × 6 viewports
  (mobile-s 360, mobile-m 390, tablet 768, laptop 1024, desktop
  1280, wide 1440) = **138 responsive baselines** that the
  `tests/e2e/visual-regression.spec.ts` responsive matrix
  **must capture** (status: PENDING — no baselines are committed
  yet; see `TEST_EVIDENCE.md` and the `Captured` flag in
  `tests/unit/stitch-cases.test.ts`). The Stitch captures
  themselves only ship at the three viewport sizes that Google
  Stitch emits (desktop 1440×900, mobile 390×844, tablet
  768×1024); the harness is the bridge between the two.
- **41 active reference-state comparisons** (27 canonical + 11
  responsive + 3 supporting) at their captured viewport. The 39
  route-backed cases are exact-reference screenshots; the two
  shared-state evidence groups remain capture-review evidence. Status:
  PENDING — no baselines are committed yet.
- **10 historical/superseded captures with successors** (3
  historical + 7 superseded) — kept for traceability, never
  implemented against. Each one names its successor `screenId` in
  the manifest, and the inventory doc lists the lineage.

The pre-M3b status ladder (Missing / Partial) is gone; today's
ladder is Implemented → Tested → Verified, with Tested gated on the
visual baselines and Verified gated on independent review. The
"approved deviation" entry for Forgot Password is removed; the new
row in the matrix below is the parity target.

## 2026-08-21 update — settings polish complete

The four-commit settings-polish batch (`acda5ef`–`7f32060`) closes the
remaining page-level polish for the four workspace- and agency-scoped
admin surfaces that were the last non-M3b stragglers:

- **Channels** (`/app/w/[slug]/channels`) — `AddChannelButton` client
  CTA that focuses the inline form; `CardTitle` + `CardDescription`
  on the add card; `FormField` adoption on all three inputs (label /
  hint / required / `aria-required`); `channels-empty-state` testid;
  6 tests (`channel-form.test.tsx` 4 + `add-channel-button.test.tsx` 2).
- **Team** (`/app/w/[slug]/team`) — pending/members card testids;
  empty-state copy tailored to actor permission (read-only vs
  manager); `member-edit-trigger` testid + `aria-label` on the per-row
  Edit button; 2 tests.
- **Workspace Settings** (`/app/w/[slug]/settings`) — reorganized so
  every section nav link points to a real anchor (`#lifecycle`,
  `#lead-times`, `#approvals`, `#defaults`); `Label htmlFor` + `id` +
  `aria-required` + `*` marker on every required control;
  `settings-form-card` + `settings-readonly-*` testids; focus ring +
  `text-fg-primary` on the shared `controlClass`; 4 tests.
- **Agency Settings** (`/app/agency-settings`) — Lucide `Building2` /
  `Server` / `KeyRound` / `ArrowLeft` icons (replaces the generic
  `Settings`); `border-b last:border-0` card rhythm matching
  brand-kit / workspace-settings; `CardDescription` under each card
  title; 8 data-testids (`agency-settings-{identity,services}`,
  `agency-name`, etc.); 5 tests including forbidden fallback and
  the no-emoji rule.

The polish pass patterns (PageHeader, Card, Badge, FormField, Drawer,
section nav vs top tabs, auth gates, test mock pattern) are captured
in `docs/design/SETTINGS_UI_LEARNINGS.md` so future passes do not
re-derive the rules. Pushed to `main` (commits `acda5ef`–`7f32060`)
behind the previous Brand-Kit R3 / Side-Nav fix (`b66d7ba`) and the
auth / channels / user-management / workspace-switcher popover fix
batch (`c46fc21`–`96a256a`).

## 2026-08-20 update (superseded by 2026-08-21 entries above and below)

The M0–M4 visual refactor (`docs/visual-parity/PLAN.md`) delivered a **Stitch-aligned PageHeader** (eyebrow / title / description / `workspace.timezone` pill), a **`PlanningViewToggle`** (List/Board/Calendar) where it makes sense, per-card or per-row **status colour-code**, and `data-testid` hooks for visual regression on every workspace-scoped page. The visual-regression harness that this update commissioned was later extended by the 2026-08-24 Build Identity references: 39 route-backed exact-reference snapshots + 138 responsive baselines (23 unique routes × 6 viewports), with the deploy gate now depending on the critical visual tests.

## 2026-08-19 update

M3b (PR #1) closed the Goal 3–10 product gaps and shipped all 27 canonical routes. The matrix below has been refreshed:

- **All 27 rows are now `Implemented`** (route + role-by-route test + axe-core per route).
- **`Tested` requires the canonical Stitch visual baseline (QA-004).** Baselines are `test.skip`-by-default in `tests/e2e/visual-regression.spec.ts`; first capture needs a stable UI render + `playwright test --update-snapshots`, then a reviewer signs the diff.
- **`Verified` is reserved for independent review** after the visual baselines are approved.
- The authoritative milestone → commit map is `PRODUCTION_READINESS_TRACKER.md` (column "Evidence" on the UI-001..010 rows). The "Milestone" column below is a pointer, not a substitute.

The `Missing` and `Partial` statuses from the prior revision were pre-M3b and are no longer accurate. The prior file is kept in git history (`docs/production-readiness/SCREEN_PARITY.md` before this commit).

## Matrix

> **Screen ID format**: the table below uses the 8-character capture prefix that matches the on-disk filename in `designs/stitch/`. The full 32-character Stitch ID is recorded in the Google Stitch project and can be regenerated from `docs/visual-parity/MCP.md`; only the 8-character prefix is portable in the repo.

| Area                | Screen ID  | Intended route/surface          | Milestone | Status      | Required proof for `Verified`                      |
| ------------------- | ---------- | ------------------------------- | --------- | ----------- | -------------------------------------------------- |
| Workspace Overview  | `f2bf40ae` | `/app/w/[slug]`                 | M2        | Implemented | KPI behavior + desktop/tablet/mobile visual        |
| Monthly Planning    | `96f0dd19` | `/app/w/[slug]/planning`        | M3b       | Implemented | filters/month/density + responsive visual          |
| Workflow Board      | `f9e58e53` | `/app/w/[slug]/board`           | M3b       | Implemented | status consistency + desktop/mobile                |
| Quick Create        | `9794f1aa` | `/app/w/[slug]/planning/new`    | M2        | Implemented | defaults/formats + desktop/mobile                  |
| Batch Add           | `43a166ed` | `/app/w/[slug]/planning/batch`  | M2        | Implemented | parser/validation + visual                         |
| Content Detail      | `f7159c3e` | `/app/w/[slug]/planning/[id]`   | M2        | Implemented | full role journey + desktop/tablet/mobile          |
| Delivery Review     | `879e7539` | `/app/w/[slug]/reviews`         | M2        | Implemented | V1/V2/approval + visual                            |
| Calendar            | `8c0ec0b0` | `/app/w/[slug]/calendar`        | M3b       | Implemented | month/week/DST/move + responsive                   |
| Reviews             | `bb6ac00d` | `/app/w/[slug]/reviews`         | M3b       | Implemented | queue/roles + responsive                           |
| Publishing          | `9cf65ebd` | `/app/w/[slug]/design-queue`    | M3b       | Implemented | per-channel flow + desktop/mobile                  |
| Publishing Recovery | `382b9405` | `/app/w/[slug]/design-queue`    | M3b       | Implemented | failed/retry flow                                  |
| Client Review       | `c7dd77e0` | `/app/w/[slug]/client`          | M3b       | Implemented | response-shape privacy + visual                    |
| Client Calendar     | `218f259a` | `/app/w/[slug]/client/calendar` | M3b       | Implemented | read-only/privacy + visual                         |
| Login               | `2dafd80a` | `/signin`                       | M1        | Implemented | progressive password/Google/magic + setup + visual |
| Forgot Password     | `793a08d8` | `/signin/forgot-password`       | M3b       | Implemented | request/reset/sent states + visual                 |
| First Administrator | `a3631dbf` | `/setup`                        | M1        | Implemented | concurrency/token + visual                         |
| My Work             | `f4dc67d1` | `/app`                          | M3b       | Implemented | role categories + desktop/mobile                   |
| Workspaces          | `01aa8faf` | `/app/workspaces`               | M3b       | Implemented | setup/archive/restore + visual                     |
| User Management     | `89113980` | `/app/users`                    | M1        | Implemented | access editing + visual                            |
| Planning Library    | `7493876f` | `/app/w/[slug]/library`         | M3b       | Implemented | campaigns/pillars/templates                        |
| Design Queue        | `5ad5fffc` | `/app/w/[slug]/design-queue`    | M3b       | Implemented | atomic claim + visual                              |
| Social Channels     | `45d945d7` | `/app/w/[slug]/channels`        | M3b       | Implemented | CRUD/archive + visual                              |
| Team & Invitations  | `2db8ec6e` | `/app/w/[slug]/team`            | M3b       | Implemented | role/privacy + visual                              |
| Workspace Settings  | `2f6acd26` | `/app/w/[slug]/settings`        | M3b       | Implemented | defaults/targets/approval mode                     |
| Agency AI Settings  | `cb0de669` | `/app/agency-settings`          | M3b       | Implemented | safe config/test/usage                             |
| Brand Kit           | `16aaf0a9` | `/app/w/[slug]/brand-kit`       | M3b       | Implemented | fields/private assets + visual                     |
| Operational States  | `21068e5a` | shared states                   | M3b       | Implemented | loading/empty/error/denied/archived                |

## Why no row is `Tested` yet

`Tested` is reserved for rows whose "Required proof" is **captured in the repository** (visual baseline, behavioral log, signed manual checklist). The current state:

- **Behavioral evidence** (axe-core per route, role-by-route matrix, E2E happy paths) — captured in `tests/e2e/`. Re-runs on `main` are green per `docs/production-readiness/TEST_EVIDENCE.md`.
- **Visual baselines (QA-004)** — **PENDING**. The harness is wired (177 visual tests in the `visual-chromium` Playwright project, `test.skip` removed) but **no baselines are committed**. The 39 route-backed exact-reference + 138 responsive baselines must be re-captured on the CI runner (Linux, portable filenames) via `TEST_DATABASE_URL=... pnpm test:visual:update` and then reviewed against the 51-case `STITCH_CASES` manifest. A 2026-08-22 commit (`f406fbc`) untracked 122 darwin-path snapshot files that were accidentally committed and were not portable to the Ubuntu CI runner. Deploy now gates on the critical visual tests via `.github/workflows/ci.yml` + `.github/workflows/deploy.yml` (Task 7 commit `3d40183`) — the gate will fail the first deploy until baselines are committed.
- **Manual a11y checklist (QA-005)** — automated a11y sweep found a real `meta-refresh` WCAG 2.2.2 violation on authenticated routes (`issues.md` P1 entry #3); manual screen-reader / zoom / reduced-motion sign-off is pending the fix and an owner action.

The matrix ladder is therefore: every row `Implemented` (today) → `Tested` after the visual baselines are captured on CI AND QA-005 is signed off → `Verified` after independent review of the captured baselines.

## Responsive baselines

Tablet and mobile reference IDs are in `STUDIOFLOW_MASTER_PROMPT.md`; the 5 Playwright projects (`chromium`, `firefox`, `webkit`, `mobile-chrome`, `mobile-safari`) are configured in `playwright.config.ts` and run in the dedicated `.github/workflows/e2e.yml` so the slow suite does not gate the deploy workflow.

## Approved deviations

None. The Forgot Password screen was previously listed as an approved
deviation (the product uses OAuth and email magic links, not
passwords); it is now a real implemented row above because password
reset has been added as a parity target.
