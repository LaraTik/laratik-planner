# Stitch visual review

> **Status:** Reviewer log in progress (Task 13). The harness and
> candidate baselines ship in Task 7; rows below are filled in
> during the actual sign-off pass.

Every active `STITCH_CASES` entry (27 canonical + 11 responsive + 1
supporting = 39 reference captures) is compared against its candidate
PNG and the captured `designs/stitch/<id>_<slug>.html`. Every
historical/superseded capture (10 entries) is reviewed against its
named successor; we record the canonical successor rather than
making the product match obsolete work.

## Process

For every active `STITCH_CASES` entry:

1. Compare the live candidate against the PNG and HTML under
   `designs/stitch/`.
2. Check typography, spacing, layout, tokens, icons, imagery,
   overflow, responsive behavior, and interactive state.
3. For the responsive matrix (`tests/e2e/visual-regression.spec.ts`
   → `visual regression (responsive matrix)`), repeat the comparison
   at every regression viewport (360 / 390 / 768 / 1024 / 1280 /
   1440).
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

## Reference table (responsive matrix: 23 routes × 6 viewports)

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
- [ ] Responsive behavior matches across the six regression
      viewports.
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
(23 routes × 6 viewports = 138 baselines). The CI pipeline uploads
visual diffs on failure (artifact `visual-diffs`).

## How to add a new Stitch case

1. Add the new entry to `STITCH_CASES` in `tests/e2e/stitch-cases.ts`
   with the right classification, route, state, and viewport.
2. Update the test in `tests/unit/stitch-cases.test.ts` if the
   counts change (e.g. active targets, historical/superseded).
3. Capture the candidate: `pnpm test:visual:update`.
4. Review against the captured PNG/HTML.
5. Add a row above with the reviewer, date, and result.
6. Open a follow-up issue or attach a commit SHA for any deviation.
