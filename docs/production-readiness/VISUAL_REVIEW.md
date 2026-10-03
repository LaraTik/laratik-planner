# Stitch visual review

> **Status:** Reviewer log in progress (Task 13). The harness and
> candidate baselines ship in Task 7; rows below are filled in
> during the actual sign-off pass.

Every active `STITCH_CASES` entry (27 canonical + 11 responsive + 3
supporting = 41 reference captures) is compared against its candidate
PNG and the captured `designs/stitch/<id>_<slug>.html`. Every
historical/superseded capture (10 entries) is reviewed against its
named successor; we record the canonical successor rather than
making the product match obsolete work.

## Process

### Automated capture evidence (2026-09-01; candidate snapshot `f702b46`)

The isolated runner created `planner_test`, applied migrations, and supplied
deterministic test-only Auth.js settings before starting Playwright. The full
visual suite completed **112/112** in assert mode on Chromium (`pnpm
test:visual`): 39 exact-reference assertions plus 73 scoped responsive
assertions. Four stale runtime-error baselines caused by a development
manifest/JSON race were recaptured individually and then verified again in the
full run. The account-menu state is intentionally scanned before its Radix
focus trap opens because axe otherwise reports the expected `aria-hidden`
background as focusable; the open menu is still included in the screenshot.
The branch advanced after this candidate snapshot, so the final release
candidate must rerun the visual suite at its exact HEAD before this evidence
is treated as current.

### Targeted baseline refresh evidence (2026-10-03; `c4e64632`)

The full strict matrix was rerun against the current workspace. It produced
219 passing assertions and 28 failures. The failures were reviewed rather than
blanket-refreshed: the shipped shell/overview, board mobile, and social-provider
settings drift was intentional and was refreshed in `c4e64632`; the media
failures reproduced as transient and pass on a strict 4/4 rerun. The committed
follow-up groups pass 9/9, and the media group passes 4/4. Planning/detail,
publish, and workspace-settings failures overlap the user's separate
uncommitted planning edits and remain pending a clean, separately reviewable
visual pass.

This proves the automated gate and candidate-file portability. It does not
replace the reviewer comparison against the Stitch PNG/HTML or the manual
keyboard/screen-reader sign-off below.

### Planning responsive baseline evidence (2026-10-03; `ef0c2754`)

After the planning UI changes were committed, the reviewed planning-list
responsive slice passed **4/4** in assert mode on Chromium at 375, 768, 1024,
and 1440px:

```text
TEST_DATABASE_URL=...planner_test pnpm exec tsx scripts/run-e2e-tests.ts \
  tests/e2e/visual-regression.spec.ts --project=visual-chromium \
  --grep='responsive /app/w/acme/planning @'
```

The four refreshed candidate baselines are the mobile-s, tablet, laptop, and
wide planning-list screenshots. Review confirmed the current List/Board/
Calendar switcher, search/filter controls, responsive card layout, no visible
clipping, and zero serious/critical axe violations. This is automated
`Tested` evidence; Stitch comparison, Arabic/RTL coverage, and independent
review remain required before `Verified`.

For every active `STITCH_CASES` entry:

1. Compare the live candidate against the PNG and HTML under
   `designs/stitch/`.
2. Check typography, spacing, layout, tokens, icons, imagery,
   overflow, responsive behavior, and interactive state.
3. For the responsive matrix (`tests/e2e/visual-regression.spec.ts`
   → `visual regression (responsive matrix)`), repeat the comparison at
   every viewport selected by `viewportsForSurface()`: 63 non-Research,
   non-planning surfaces at 360 / 768 / 1440; Research at 375 / 768 / 1024 /
   1280 / 1440; and seven planning surfaces at 375 / 768 / 1024 / 1440 (222
   English responsive baselines total). The dedicated Research Arabic/RTL
   block adds five same-width baselines and asserts no horizontal overflow.
4. Mark each row with a result and a link to the diff / follow-up
   issue / approved-deviation commit.
5. A baseline may be approved only after every dimension above
   matches the captured reference, **or** an approved deviation is
   documented with a commit SHA.

For every historical/superseded entry:

1. Review against the named `successorScreenId`.
2. Record the canonical successor rather than rewriting the product
   to match an obsolete capture.
3. Mark the row with the successor, a result, and a commit / issue
   link.

## Reference table (active captures)

| Screen ID | Classification | Route / state | Viewport | Reviewer | Date | Result | Issue / commit link |
| --------- | -------------- | ------------- | -------- | -------- | ---- | ------ | ------------------- |
| _pending_ |                |               |          |          |      |        |                     |

## Reference table (responsive matrix: 71 surfaces, 222 English baselines + 5 Research Arabic/RTL baselines)

| Surface   | Viewport | Reviewer | Date | Result | Issue / commit link |
| --------- | -------- | -------- | ---- | ------ | ------------------- |
| _pending_ |          |          |      |        |                     |

## Reference table (historical / superseded captures)

| Screen ID | Classification | Successor | Reviewer | Date | Result | Issue / commit link |
| --------- | -------------- | --------- | -------- | ---- | ------ | ------------------- |
| _pending_ |                |           |          |      |        |                     |

## Approve criteria

A baseline row may be marked **Approved** only when:

- [ ] Typography matches (font family, weight, size, line height,
      tracking, color).
- [ ] Spacing matches (margins, padding, gaps, section rhythm).
- [ ] Layout matches (grid, alignment, positioning).
- [ ] Tokens match (color, radius, shadow, border — all from the
      design system).
- [ ] Icons match (shape, stroke, color, size).
- [ ] Imagery matches (alt text, aspect ratio, treatment).
- [ ] Overflow handling matches (no clipping, no unexpected scroll,
      no broken reflow).
- [ ] Responsive behavior matches across every viewport selected by the
      current surface matrix.
- [ ] Interactive state matches (hover, focus, active, disabled,
      error, loading).
- [ ] Inline axe-core assertions (`tests/e2e/visual-regression.spec.ts`
      → serious/critical violations) return zero.
- [ ] Any approved deviation is recorded with a commit SHA and
      reason in the issue / commit link column.

## How to capture or refresh baselines

```bash
# Capture candidates (overwrites committed baselines)
pnpm test:visual:update

# Compare against committed baselines (default CI behavior)
pnpm test:visual
```

Baselines are stored under
`tests/e2e/visual-regression.spec.ts-snapshots/reference/` (one
capture per active Stitch case) and
`tests/e2e/visual-regression.spec.ts-snapshots/responsive/`
(222 English baselines: 63 non-planning/non-Research surfaces × 3 viewports,
seven planning surfaces × 4 viewports, and one Research surface × 5 viewports;
the dedicated Arabic/RTL block adds five baselines). The CI pipeline uploads visual diffs on failure
(artifact `visual-diffs`).

## How to add a new Stitch case

1. Add the new entry to `STITCH_CASES` in `tests/e2e/stitch-cases.ts`
   with the right classification, route, state, and viewport.
2. Update the test in `tests/unit/stitch-cases.test.ts` if the
   counts change (e.g. active targets, historical/superseded).
3. Capture the candidate: `pnpm test:visual:update`.
4. Review against the captured PNG/HTML.
5. Add a row above with the reviewer, date, and result.
6. Open a follow-up issue or attach a commit SHA for any deviation.
