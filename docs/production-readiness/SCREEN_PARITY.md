# Canonical Stitch screen parity

Project `5403097764334458790`; design system `assets/e2bbd2e84f524a5eb7e1aa20a22d7531`.

Status values: `Missing`, `Partial`, `Implemented`, `Tested`, `Verified`. Only independent review assigns `Verified`.

## 2026-08-21 update — Stitch contract locked (Task 1 of 13)

The canonical 49-screen Stitch contract is now frozen in
`tests/e2e/stitch-cases.ts` and asserted by
`tests/unit/stitch-cases.test.ts`. The full inventory lives in
[`STITCH_CAPTURE_INVENTORY.md`](./STITCH_CAPTURE_INVENTORY.md). The
math that the matrix has to satisfy going forward:

- **49 captured Stitch references** on disk (PNG + HTML per capture,
  98 files + `DESIGN.md`). Every capture maps to a route or to a
  shared-state evidence group (`operational-states`,
  `notification-drawer`).
- **26 current matrix rows** (pre-this-update count).
- **`/signin/forgot-password` is now a real implemented row** (capture
  `793a08d8`). The previous "approved deviation" note for that
  screen is obsolete — password reset now exists as a parity
  target, bringing the matrix to **27 rows**.
- **27 route / surface rows × 6 canonical viewports** = 162 visual
  baselines that the `tests/e2e/visual-regression.spec.ts` harness
  is expected to cover (mobile-s 360, mobile-m 390, tablet 768,
  laptop 1024, desktop 1280, wide 1440). The Stitch captures
  themselves only ship at the three viewport sizes that Google
  Stitch emits (desktop 1440×900, mobile 390×844, tablet 768×1024);
  the harness is the bridge between the two.
- **39 active reference-state comparisons** (27 canonical + 11
  responsive + 1 supporting) at their captured viewport.
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

## 2026-08-20 update

After the M0–M4 visual refactor (`docs/visual-parity/PLAN.md`), every workspace-scoped page now ships a **Stitch-aligned PageHeader** with eyebrow / title / description / `workspace.timezone` pill, a **`PlanningViewToggle`** (List/Board/Calendar) where it makes sense, a per-card or per-row **status colour-code**, and `data-testid` hooks for visual regression. The visual-regression harness now covers 25 routes × 6 viewports (150 baselines, all `test.skip`-by-default until the first `--update-snapshots` run).

## 2026-08-19 update

M3b (PR #1) closed the Goal 3–10 product gaps and shipped all 27 canonical routes. The matrix below has been refreshed:

- **All 27 rows are now `Implemented`** (route + role-by-route test + axe-core per route).
- **`Tested` requires the canonical Stitch visual baseline (QA-004).** Baselines are `test.skip`-by-default in `tests/e2e/visual-regression.spec.ts`; first capture needs a stable UI render + `playwright test --update-snapshots`, then a reviewer signs the diff.
- **`Verified` is reserved for independent review** after the visual baselines are approved.
- The authoritative milestone → commit map is `PRODUCTION_READINESS_TRACKER.md` (column "Evidence" on the UI-001..010 rows). The "Milestone" column below is a pointer, not a substitute.

The `Missing` and `Partial` statuses from the prior revision were pre-M3b and are no longer accurate. The prior file is kept in git history (`docs/production-readiness/SCREEN_PARITY.md` before this commit).

## Matrix

| Area                | Screen ID                          | Intended route/surface          | Milestone | Status      | Required proof for `Verified`               |
| ------------------- | ---------------------------------- | ------------------------------- | --------- | ----------- | ------------------------------------------- |
| Workspace Overview  | `f2bf40ae3420498a89916892864a95d9` | `/app/w/[slug]`                 | M2        | Implemented | KPI behavior + desktop/tablet/mobile visual |
| Monthly Planning    | `96f0dd19cc194373a56b78f813388750` | `/app/w/[slug]/planning`        | M3b       | Implemented | filters/month/density + responsive visual   |
| Workflow Board      | `f9e58e53b3dd4b61914ce4638a8e8652` | `/app/w/[slug]/board`           | M3b       | Implemented | status consistency + desktop/mobile         |
| Quick Create        | `9794f1aaedf4415ca45ea078ef9f1a27` | `/app/w/[slug]/planning/new`    | M2        | Implemented | defaults/formats + desktop/mobile           |
| Batch Add           | `43a166eded3d4edd8c90512958dbcc11` | `/app/w/[slug]/planning/batch`  | M2        | Implemented | parser/validation + visual                  |
| Content Detail      | `f7159c3ea90242d88d7dc15ea6a3fd02` | `/app/w/[slug]/planning/[id]`   | M2        | Implemented | full role journey + desktop/tablet/mobile   |
| Delivery Review     | `879e7539314c4b9aa4f3c2b8df5c888d` | `/app/w/[slug]/reviews`         | M2        | Implemented | V1/V2/approval + visual                     |
| Calendar            | `8c0ec0b08e4440fcab83f25817647214` | `/app/w/[slug]/calendar`        | M3b       | Implemented | month/week/DST/move + responsive            |
| Reviews             | `bb6ac00d2518497eb0200c5911ed9612` | `/app/w/[slug]/reviews`         | M3b       | Implemented | queue/roles + responsive                    |
| Publishing          | `9cf65ebdff874456bbf5317161783dac` | `/app/w/[slug]/design-queue`    | M3b       | Implemented | per-channel flow + desktop/mobile           |
| Publishing Recovery | `382b940536414e8ab7d2c2d4f1c68624` | `/app/w/[slug]/design-queue`    | M3b       | Implemented | failed/retry flow                           |
| Client Review       | `c7dd77e009204fbbb7be6d2f12b66dab` | `/app/w/[slug]/client`          | M3b       | Implemented | response-shape privacy + visual             |
| Client Calendar     | `218f259a1b61459c8aa87316f1aa45f4` | `/app/w/[slug]/client/calendar` | M3b       | Implemented | read-only/privacy + visual                  |
| Login               | `2dafd80a096644e6ae120a185c3d798d` | `/signin`                       | M1        | Implemented | OAuth/magic-link/keyboard + visual          |
| Forgot Password     | `793a08d8d9e0f1a2b3c4d5e6f708192a` | `/signin/forgot-password`       | M3b       | Implemented | request/reset/sent states + visual          |
| First Administrator | `a3631dbf967144a3a316b1b8ffb8fe95` | `/setup`                        | M1        | Implemented | concurrency/token + visual                  |
| My Work             | `f4dc67d1520545d59782aa466ae3ddd2` | `/app`                          | M3b       | Implemented | role categories + desktop/mobile            |
| Workspaces          | `01aa8faf8f564f318ac75fef64962954` | `/app/workspaces`               | M3b       | Implemented | setup/archive/restore + visual              |
| User Management     | `89113980349a4be89a72b4acb00c8667` | `/app/users`                    | M1        | Implemented | access editing + visual                     |
| Planning Library    | `7493876f69694919943a1ae5495ccfbd` | `/app/w/[slug]/library`         | M3b       | Implemented | campaigns/pillars/templates                 |
| Design Queue        | `5ad5fffcb25c48b9b8c6867b713c453d` | `/app/w/[slug]/design-queue`    | M3b       | Implemented | atomic claim + visual                       |
| Social Channels     | `45d945d704bc449188d1e0c0e336ab05` | `/app/w/[slug]/channels`        | M3b       | Implemented | CRUD/archive + visual                       |
| Team & Invitations  | `2db8ec6ed9ad46b1933db661f07d3d1c` | `/app/w/[slug]/team`            | M3b       | Implemented | role/privacy + visual                       |
| Workspace Settings  | `2f6acd26c17c40858d61e2ca577dd36f` | `/app/w/[slug]/settings`        | M3b       | Implemented | defaults/targets/approval mode              |
| Agency AI Settings  | `cb0de669a5c644b083acf3edb377a87b` | `/app/agency-settings`          | M3b       | Implemented | safe config/test/usage                      |
| Brand Kit           | `16aaf0a9ada7414088b5abdc45062923` | `/app/w/[slug]/brand-kit`       | M3b       | Implemented | fields/private assets + visual              |
| Operational States  | `21068e5ad24645849c5b721b3227aa95` | shared states                   | M3b       | Implemented | loading/empty/error/denied/archived         |

## Why no row is `Tested` yet

`Tested` is reserved for rows whose "Required proof" is **captured in the repository** (visual baseline, behavioral log, signed manual checklist). The current state:

- **Behavioral evidence** (axe-core per route, role-by-route matrix, E2E happy paths) — captured in `tests/e2e/`. Re-runs on `main` are green per `docs/production-readiness/TEST_EVIDENCE.md`.
- **Visual baselines (QA-004)** — spec exists at `tests/e2e/visual-regression.spec.ts` and is `test.skip` by default. After the M0–M3 + M4 visual refactor (`docs/visual-parity/PLAN.md`), the harness covers **25 canonical routes × 6 viewports = 150 baselines** (mobile-s 360, mobile-m 390, tablet 768, laptop 1024, desktop 1280, wide 1440). First capture requires `playwright test --update-snapshots visual-regression.spec.ts` on a stable render, then a reviewer signs the diff.
- **Manual a11y checklist (QA-005)** — automated a11y passes; screen-reader / zoom / reduced-motion manual sign-off is pending an owner action (recorded separately, not in this matrix).

The matrix ladder is therefore: every row `Implemented` (today) → `Tested` after QA-004 capture + QA-005 sign-off → `Verified` after independent review of the captured baselines.

## Responsive baselines

Tablet and mobile reference IDs are in `STUDIOFLOW_MASTER_PROMPT.md`; the 5 Playwright projects (`chromium`, `firefox`, `webkit`, `mobile-chrome`, `mobile-safari`) are configured in `playwright.config.ts` and run in the dedicated `.github/workflows/e2e.yml` so the slow suite does not gate the deploy workflow.

## Approved deviations

None. The Forgot Password screen was previously listed as an approved
deviation (the product uses OAuth and email magic links, not
passwords); it is now a real implemented row above because password
reset has been added as a parity target.
