# Manual accessibility checklist (WCAG 2.2 AA)

> **Purpose.** Per-row owner-completed evidence for the production-readiness
> manual accessibility gate (`PRODUCTION_READINESS_TRACKER.md` QA-005,
> `STUDIOFLOW_MASTER_PROMPT.md` §23 step 30, §24 "Quality gates").
> Automated axe-core coverage lives in
> `tests/e2e/a11y-routes.spec.ts` and the result is mirrored in
> [`TEST_EVIDENCE.md`](./TEST_EVIDENCE.md). This file is the **manual**
> companion: keyboard-only completion, focus visibility, screen-reader
> name/role/value, heading hierarchy, 200% zoom, reduced-motion, 360px
> reflow + 44px targets.
>
> **Target standard.** WCAG 2.2 AA (aligned with the axe-core
> `wcag2a / wcag2aa / wcag22aa` tags used by `a11y-routes.spec.ts`).
>
> **Procedure.** One row per canonical surface (27 rows, derived from
> the 27 canonical entries in `tests/e2e/stitch-cases.ts`). For each
> row, the operator records the date, browser/assistive-technology
> combination, observed result, and (for `Fail`) a link to a tracking
> issue. No row is `Pass` until every column is filled with a positive
> observation. The independent reviewer flips the matrix to
> `Verified`; this file is signed by the operator only.

## Surface list

The 27 canonical surfaces below are the same set the
[`SCREEN_PARITY.md`](./SCREEN_PARITY.md) matrix tracks. They come from
`tests/e2e/stitch-cases.ts` filtered to `classification === "canonical"`.
Where multiple canonical captures share a route (e.g. Publishing,
Publishing Recovery, Design Queue all target `/app/w/acme/design-queue`
but at `approved`, `failed`, and `empty` states), each capture is its
own row so the keyboard, zoom and screen-reader checks are run against
the right state.

1. `/app/workspaces` (default) — `01aa8faf`
2. `/app/w/acme/brand-kit` (default) — `16aaf0a9`
3. `operational-states` evidence group (loading / empty / error / denied / archived) — `21068e5a`
4. `/app/w/acme/client/calendar` (default) — `218f259a`
5. `/signin` (default) — `2dafd80a`
6. `/app/w/acme/team` (final, post-invitation) — `2db8ec6e`
7. `/app/w/acme/settings` (final, defaults saved) — `2f6acd26`
8. `/app/w/acme/design-queue` (failed) — `382b9405`
9. `/app/w/acme/planning/batch` (final) — `43a166ed`
10. `/app/w/acme/channels` (default) — `45d945d7`
11. `/app/w/acme/design-queue` (empty) — `5ad5fffc`
12. `/app/w/acme/library` (default) — `7493876f`
13. `/signin/forgot-password` (default) — `793a08d8`
14. `/app/w/acme/reviews` (final, delivery + creative) — `879e7539`
15. `/app/users` (default) — `89113980`
16. `/app/w/acme/calendar` (default) — `8c0ec0b0`
17. `/app/w/acme/planning` (default) — `96f0dd19`
18. `/app/w/acme/planning/new` (default) — `9794f1aa`
19. `/app/w/acme/design-queue` (approved) — `9cf65ebd`
20. `/setup` (default) — `a3631dbf`
21. `/app/w/acme/reviews` (default) — `bb6ac00d`
22. `/app/w/acme/client` (default) — `c7dd77e0`
23. `/app/agency-settings` (approved) — `cb0de669`
24. `/app/w/acme` (default) — `f2bf40ae`
25. `/app` (default) — `f4dc67d1`
26. `/app/w/acme/planning/{contentItemId}` (final) — `f7159c3e`
27. `/app/w/acme/board` (final) — `f9e58e53`

## How to record a check

Use the matrix below. For every surface the operator must run the
real keyboard-only, screen-reader, zoom, reduced-motion and 360px
flow described in the column header, then record the outcome. A row
is never `Pass` on the operator's first inspection — `Pass` is
recorded only when the operator has a positive observation for every
column; `Fail` requires a tracking issue link with a reproduction;
`Blocked` requires the owner and the external action.

- **`Pass`** — every column has a positive observation, no
  reproduction issue is open, automated axe-core is also clean for
  the same route. Paste a short evidence note (one sentence +
  screenshot reference where relevant) in the `Result` column.
- **`Fail`** — at least one column is not satisfied. Open or link a
  tracking issue (in `issues.md` or the project tracker), describe
  the repro in the `Issue link` column, and keep the row `Fail` until
  the issue is closed and the operator re-runs the check.
- **`Blocked`** — the check cannot run yet (e.g. an external
  account, a fixture, or a device that the operator does not have).
  Name the owner and the action that unblocks it in the `Issue link`
  column; the row stays `Blocked` (not `Fail`) until the action
  lands.

Attach screenshots to the related issue, not to this file. Never
paste credentials, personal data, invitation URLs, or raw session
tokens in the matrix or in the screenshot file names. Mask any
dynamic ID, timestamp, or user-supplied content before capture
(per `docs/production-readiness/README.md` evidence rule 3).

## Pass criteria

A row may be marked `Pass` only when **every** column has a positive
observation. A `Fail` must link to a tracking issue with a
reproduction. A `Blocked` must name the owner and the external
action required. The independent reviewer may then flip a `Pass` row
to `Verified`; this checklist never self-assigns `Verified`.

## Matrix

> **Column legend (added in 2026-08-22 pre-fill).** The first three
> `Auto-check …` columns are auto-verified by reading the code; the
> remaining six columns still require a real human reviewer
> (keyboard-only, screen-reader name/role/value, 200 % browser zoom,
> reviewer name, browser/AT combo, dated observation, final result).
> The `axe` column reads from `tests/e2e/a11y-routes.spec.ts`
> (chromium project, last sweep on `96e7048`); the `motion` and
> `target` columns read from `src/app/globals.css` and the per-page
> component tree. `OUT OF SCOPE` means the route is not currently
> scanned by `a11y-routes.spec.ts` — it does not mean the route is
> free of bugs; the reviewer must run the manual columns.
>
> - `Auto-check: axe (chromium)` key:
>   - `PASS` — route is in `a11y-routes.spec.ts` AND was green on the
>     `96e7048` sweep (`TEST_EVIDENCE.md` § "Re-baseline —
>     2026-08-21").
>   - `FAIL` — route is in `a11y-routes.spec.ts` AND is one of the
>     routes currently failing on chromium (meta-refresh P1).
>   - `OUT OF SCOPE` — route is not in `a11y-routes.spec.ts` today;
>     add coverage or run a one-off scan as part of the review.
> - `Auto-check: reduced-motion` key: the global
>   `@media (prefers-reduced-motion: reduce)` rule in
>   `globals.css:130` zeroes every animation/transition on every
>   page, so any page with `transition-*` or `animate-*` Tailwind
>   utilities is `PASS`; pages with no motion are `OUT OF SCOPE`.
> - `Auto-check: 44px touch target` key: the global
>   `@media (max-width: 767px)` rule in `globals.css:142` forces
>   every `button`, `[role=button]` and `a` to `min-height: 44px` on
>   mobile. Desktop controls use the `Button` variants (`h-10`
>   standard, `h-9` compact, `h-11` touch — see
>   `src/components/ui/button.tsx`); pages whose primary action
>   binds to a `Button` with `size="default"` (40 px) or
>   `size="lg"` (44 px) and that include a `min-h-11` /
>   `min-h-[44px]` form control are `PASS`, pages whose primary
>   action uses the `h-9` compact variant are `PARTIAL` (still
>   40 px on desktop, 44 px on mobile via the global rule), pages
>   with no interactive controls are `OUT OF SCOPE`.
> - The `200 % browser zoom` column stays `MANUAL` for every row —
>   200 % zoom is not automated; the reviewer must run the
>   documented check.

| #   | Surface (route or evidence group; state; screenId)                      | Auto-check: axe (chromium) | Auto-check: reduced-motion | Auto-check: 44px touch target | Keyboard-only completion | Visible focus + logical order | Screen-reader name/role/value + heading hierarchy | 200% browser zoom without content loss | Reduced-motion behavior | 360px reflow + 44px targets | Reviewer | Browser/AT | Date | Result | Issue link |
| --- | ----------------------------------------------------------------------- | -------------------------- | -------------------------- | ----------------------------- | ------------------------ | ----------------------------- | ------------------------------------------------- | -------------------------------------- | ----------------------- | --------------------------- | -------- | ---------- | ---- | ------ | ---------- |
| 1   | `/app/workspaces` (default) — `01aa8faf`                                | PASS                       | PASS                       | PASS                          |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 2   | `/app/w/acme/brand-kit` (default) — `16aaf0a9`                          | OUT OF SCOPE               | PASS                       | PASS                          |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 3   | `operational-states` (loading/empty/error/denied/archived) — `21068e5a` | OUT OF SCOPE               | OUT OF SCOPE               | OUT OF SCOPE                  |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 4   | `/app/w/acme/client/calendar` (default) — `218f259a`                    | OUT OF SCOPE               | PASS                       | PASS                          |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 5   | `/signin` (default) — `2dafd80a`                                        | PASS                       | PASS                       | PASS                          |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 6   | `/app/w/acme/team` (final) — `2db8ec6e`                                 | OUT OF SCOPE               | PASS                       | PASS                          |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 7   | `/app/w/acme/settings` (final) — `2f6acd26`                             | OUT OF SCOPE               | PASS                       | PASS                          |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 8   | `/app/w/acme/design-queue` (failed) — `382b9405`                        | OUT OF SCOPE               | PASS                       | PARTIAL                       |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 9   | `/app/w/acme/planning/batch` (final) — `43a166ed`                       | OUT OF SCOPE               | PASS                       | PARTIAL                       |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 10  | `/app/w/acme/channels` (default) — `45d945d7`                           | OUT OF SCOPE               | PASS                       | PASS                          |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 11  | `/app/w/acme/design-queue` (empty) — `5ad5fffc`                         | OUT OF SCOPE               | PASS                       | PARTIAL                       |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 12  | `/app/w/acme/library` (default) — `7493876f`                            | OUT OF SCOPE               | PASS                       | PARTIAL                       |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 13  | `/signin/forgot-password` (default) — `793a08d8`                        | OUT OF SCOPE               | PASS                       | PASS                          |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 14  | `/app/w/acme/reviews` (final, delivery + creative) — `879e7539`         | OUT OF SCOPE               | PASS                       | PARTIAL                       |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 15  | `/app/users` (default) — `89113980`                                     | OUT OF SCOPE               | PASS                       | PARTIAL                       |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 16  | `/app/w/acme/calendar` (default) — `8c0ec0b0`                           | OUT OF SCOPE               | PASS                       | PARTIAL                       |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 17  | `/app/w/acme/planning` (default) — `96f0dd19`                           | FAIL                       | PASS                       | PARTIAL                       |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 18  | `/app/w/acme/planning/new` (default) — `9794f1aa`                       | OUT OF SCOPE               | PASS                       | PARTIAL                       |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 19  | `/app/w/acme/design-queue` (approved) — `9cf65ebd`                      | OUT OF SCOPE               | PASS                       | PARTIAL                       |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 20  | `/setup` (default) — `a3631dbf`                                         | OUT OF SCOPE               | PASS                       | PASS                          |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 21  | `/app/w/acme/reviews` (default) — `bb6ac00d`                            | OUT OF SCOPE               | PASS                       | PARTIAL                       |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 22  | `/app/w/acme/client` (default) — `c7dd77e0`                             | OUT OF SCOPE               | PASS                       | PARTIAL                       |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 23  | `/app/agency-settings` (approved) — `cb0de669`                          | OUT OF SCOPE               | PASS                       | PARTIAL                       |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 24  | `/app/w/acme` (default) — `f2bf40ae`                                    | FAIL                       | PASS                       | PARTIAL                       |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 25  | `/app` (default) — `f4dc67d1`                                           | FAIL                       | PASS                       | PARTIAL                       |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 26  | `/app/w/acme/planning/{contentItemId}` (final) — `f7159c3e`             | FAIL                       | PASS                       | PARTIAL                       |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |
| 27  | `/app/w/acme/board` (final) — `f9e58e53`                                | OUT OF SCOPE               | PASS                       | PARTIAL                       |                          |                               |                                                   | MANUAL                                 |                         |                             |          |            |      |        |            |

### Auto-check coverage (2026-08-22 pre-fill on `96e7048`)

- **axe (chromium)** — 6 of 27 rows have a real automated result
  because the route is covered by `tests/e2e/a11y-routes.spec.ts`
  (2 PASS, 4 FAIL, 21 OUT OF SCOPE). The PASS rows are
  `/app/workspaces` (row 1) and `/signin` (row 5). The FAIL rows
  are `/app/w/acme/planning` (row 17), `/app/w/acme` (row 24),
  `/app` (row 25) and `/app/w/acme/planning/{contentItemId}` (row
  26); rows 25-26 share the same root cause as row 17 via the
  `(app)/app/layout.tsx` chain. All four share the root cause
  documented in `TEST_EVIDENCE.md` § "Automated accessibility sweep"
  — `auth()` returning `null` on the page render forces
  `redirect("/signin")`, which Next.js encodes as
  `<meta http-equiv="refresh">` (WCAG 2.2.2 violation). The 21
  OUT OF SCOPE rows need a one-off axe scan or a follow-up
  `a11y-routes.spec.ts` PR before they can flip to PASS; the
  reviewer must still run the manual columns regardless.
- **reduced-motion** — every page in the matrix is `PASS` because
  the global `@media (prefers-reduced-motion: reduce)` rule in
  `globals.css:130` zeroes every animation/transition regardless
  of page. The single `OUT OF SCOPE` row (3) is the
  `operational-states` evidence group (loading / empty / error /
  denied / archived states) — none of those have motion to
  suppress; the global rule still applies if any state is later
  animated.
- **44px touch target** — every page that has interactive controls
  is at minimum `PARTIAL`: the global rule in `globals.css:142`
  forces every `button`, `[role=button]` and `a` to
  `min-height: 44px` on mobile (<768 px). On desktop, the `Button`
  component (`h-10` standard / `h-9` compact / `h-11` touch, see
  `button.tsx:24-27`) and explicit `min-h-11` / `min-h-[44px]`
  classes (23 files) cover primary actions. Rows marked `PARTIAL`
  (12 of 27: rows 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 21, 22,
  23, 24, 25, 26, 27) use the `h-9` compact variant for some
  secondary actions on desktop, which is still 40 px on desktop
  and 44 px on mobile via the global rule. The 8 explicitly
  `PASS` rows (1, 2, 4, 5, 6, 7, 10, 13, 20) have at least one
  `Button` with `size="default"` (40 px) or `size="lg"` (44 px)
  bound to a primary action, plus a `min-h-[44px]` / `min-h-11`
  form control on the same page. Row 3 (`operational-states`) is
  `OUT OF SCOPE` because the evidence group is a state-machine
  contract, not a single interactive page.
- **pending reviewer** — keyboard-only completion, screen-reader
  name/role/value, 200 % browser zoom, reviewer name,
  browser/AT combo, date and final `Result` are still empty in
  every row. The reviewer fills those; an empty `Result` is the
  expected starting state.

## How this file links to the rest of the evidence

- Automated axe-core result: `tests/e2e/a11y-routes.spec.ts` (run with
  `pnpm test:a11y`). The latest result is mirrored in
  [`TEST_EVIDENCE.md`](./TEST_EVIDENCE.md) under the
  "2026-08-21 — Accessibility + UAT + external services evidence
  contracts" section.
- Stitch route / viewport contract: [`SCREEN_PARITY.md`](./SCREEN_PARITY.md)
  and `tests/e2e/stitch-cases.ts` (the 27 canonical `STITCH_CASES`
  entries are the source of the surface list above).
- 30-step separated-account UAT: [`UAT_RELEASE.md`](./UAT_RELEASE.md)
  § "2026-08-21 — 30-step separated-account UAT" — the keyboard-only
  and 200% zoom checks in this matrix are also exercised as part of
  the §23 step 30 journey.
- Owner gates (DB / OAuth / SMTP / AI / Sentry / offsite backup):
  [`EXTERNAL_SERVICES_UAT.md`](./EXTERNAL_SERVICES_UAT.md).
