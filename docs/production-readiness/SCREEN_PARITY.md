# Canonical Stitch screen parity

Project `5403097764334458790`; design system `assets/e2bbd2e84f524a5eb7e1aa20a22d7531`.

Status values: `Missing`, `Partial`, `Implemented`, `Tested`, `Verified`. Only independent review assigns `Verified`.

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
- **Visual baselines (QA-004)** — spec exists at `tests/e2e/visual-regression.spec.ts` and is `test.skip` by default. The first capture requires a stable UI render + `playwright test --update-snapshots` on the target viewports (360, 390, 768, 1024, 1280, 1440), then a reviewer approves the diff.
- **Manual a11y checklist (QA-005)** — automated a11y passes; screen-reader / zoom / reduced-motion manual sign-off is pending an owner action (recorded separately, not in this matrix).

The matrix ladder is therefore: every row `Implemented` (today) → `Tested` after QA-004 capture + QA-005 sign-off → `Verified` after independent review of the captured baselines.

## Responsive baselines

Tablet and mobile reference IDs are in `STUDIOFLOW_MASTER_PROMPT.md`; the 5 Playwright projects (`chromium`, `firefox`, `webkit`, `mobile-chrome`, `mobile-safari`) are configured in `playwright.config.ts` and run in the dedicated `.github/workflows/e2e.yml` so the slow suite does not gate the deploy workflow.

## Approved deviations

The Forgot Password screen is an approved deviation — the product uses OAuth and email magic links, not passwords. Recorded in `STUDIOFLOW_MASTER_PROMPT.md` §14.
