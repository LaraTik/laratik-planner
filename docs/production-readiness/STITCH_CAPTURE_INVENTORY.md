# Stitch capture inventory

Canonical contract for the 51 captured Stitch references under
`designs/stitch/`. This inventory is the single source of truth for the
Stitch manifest exported by `tests/e2e/stitch-cases.ts` and asserted by
`tests/unit/stitch-cases.test.ts`.

## Totals

- **51 captures** on disk (PNG + HTML each, 102 files plus the
  `DESIGN.md` companion), plus the **2 M4 captures** referenced
  below.
- **27 canonical** surfaces (one route or evidence group per row in the
  parity matrix), plus the **2 M4 surfaces** (`meta-account-picker`
  embedded on the channels page and the dedicated analytics
  dashboard).
- **11 responsive** captures (same surfaces at mobile/tablet viewports).
- **3 supporting** captures (Create Workspace brand step plus desktop
  and mobile Build Identity references).
- **3 historical** captures (early references, all with a successor).
- **7 superseded** captures (older revisions, all with a successor).
- **41 active targets** (canonical + responsive + supporting) and
  **10 historical/superseded exclusions**. The M4 surfaces are
  tracked separately because they were generated against the
  existing project tokens without a new Stitch MCP run; see the
  M4 entry below.

Viewports used by Stitch: desktop 1440×900, mobile 390×844,
tablet 768×1024. These three sizes are the only widths Stitch emits;
the visual-regression harness maps each canonical surface to the
scoped viewport contract in `SCREEN_PARITY.md` (73 baselines total).

## Inventory

| screenId | slug                                                | route / evidence group                 | viewport | state        | classification | successor | PNG                                                                | HTML                                                                |
| -------- | --------------------------------------------------- | -------------------------------------- | -------- | ------------ | -------------- | --------- | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 01aa8faf | studioflow---workspaces                             | `/app/workspaces`                      | desktop  | default      | canonical      | —         | `01aa8faf_studioflow---workspaces.png`                             | `01aa8faf_studioflow---workspaces.html`                             |
| 0480cbe9 | northstar-coffee---tablet-planning                  | `/app/w/acme/planning`                 | tablet   | default      | responsive     | —         | `0480cbe9_northstar-coffee---tablet-planning.png`                  | `0480cbe9_northstar-coffee---tablet-planning.html`                  |
| 06a9382e | northstar-coffee---delivery---creative-review       | `/app/w/acme/planning/{contentItemId}` | desktop  | default      | historical     | 879e7539  | `06a9382e_northstar-coffee---delivery---creative-review.png`       | `06a9382e_northstar-coffee---delivery---creative-review.html`       |
| 116b6e36 | studioflow---notifications-mobile-final             | `notification-drawer`                  | mobile   | drawer       | superseded     | 1272d1fa  | `116b6e36_studioflow---notifications-mobile-final.png`             | `116b6e36_studioflow---notifications-mobile-final.html`             |
| 1272d1fa | studioflow---notifications-mobile-approved          | `notification-drawer`                  | mobile   | approved     | responsive     | —         | `1272d1fa_studioflow---notifications-mobile-approved.png`          | `1272d1fa_studioflow---notifications-mobile-approved.html`          |
| 129bd2e9 | northstar-coffee---batch-add-ideas                  | `/app/w/acme/planning/batch`           | desktop  | default      | superseded     | 43a166ed  | `129bd2e9_northstar-coffee---batch-add-ideas.png`                  | `129bd2e9_northstar-coffee---batch-add-ideas.html`                  |
| 12d2ff28 | northstar-coffee---tablet-content-detail            | `/app/w/acme/planning/{contentItemId}` | tablet   | default      | responsive     | —         | `12d2ff28_northstar-coffee---tablet-content-detail.png`            | `12d2ff28_northstar-coffee---tablet-content-detail.html`            |
| 16aaf0a9 | northstar-coffee---brand-kit                        | `/app/w/acme/brand-kit`                | desktop  | default      | canonical      | —         | `16aaf0a9_northstar-coffee---brand-kit.png`                        | `16aaf0a9_northstar-coffee---brand-kit.html`                        |
| 21068e5a | studioflow---operational-states                     | `operational-states`                   | desktop  | default      | canonical      | —         | `21068e5a_studioflow---operational-states.png`                     | `21068e5a_studioflow---operational-states.html`                     |
| 218f259a | northstar-coffee---client-calendar-read-only        | `/app/w/acme/client/calendar`          | desktop  | default      | canonical      | —         | `218f259a_northstar-coffee---client-calendar-read-only.png`        | `218f259a_northstar-coffee---client-calendar-read-only.html`        |
| 2dafd80a | studioflow---login                                  | `/signin`                              | desktop  | default      | canonical      | —         | `2dafd80a_studioflow---login.png`                                  | `2dafd80a_studioflow---login.html`                                  |
| 2db8ec6e | northstar-coffee---team---invitations--studioflow   | `/app/w/acme/team`                     | desktop  | final        | canonical      | —         | `2db8ec6e_northstar-coffee---team---invitations--studioflow.png`   | `2db8ec6e_northstar-coffee---team---invitations--studioflow.html`   |
| 2f6acd26 | northstar-coffee---workspace-settings--corrected    | `/app/w/acme/settings`                 | desktop  | final        | canonical      | —         | `2f6acd26_northstar-coffee---workspace-settings--corrected.png`    | `2f6acd26_northstar-coffee---workspace-settings--corrected.html`    |
| 382b9405 | northstar-coffee---publishing-failed-recovery       | `/app/w/acme/design-queue`             | desktop  | failed       | canonical      | —         | `382b9405_northstar-coffee---publishing-failed-recovery.png`       | `382b9405_northstar-coffee---publishing-failed-recovery.html`       |
| 43a166ed | northstar-coffee---batch-add-ideas-final            | `/app/w/acme/planning/batch`           | desktop  | final        | canonical      | —         | `43a166ed_northstar-coffee---batch-add-ideas-final.png`            | `43a166ed_northstar-coffee---batch-add-ideas-final.html`            |
| 45d945d7 | northstar-coffee---social-channels-settings         | `/app/w/acme/channels`                 | desktop  | default      | canonical      | —         | `45d945d7_northstar-coffee---social-channels-settings.png`         | `45d945d7_northstar-coffee---social-channels-settings.html`         |
| 4ce1582b | studioflow---my-work-mobile                         | `/app`                                 | mobile   | default      | responsive     | —         | `4ce1582b_studioflow---my-work-mobile.png`                         | `4ce1582b_studioflow---my-work-mobile.html`                         |
| 5ad5fffc | northstar-coffee---unassigned-design-queue          | `/app/w/acme/design-queue`             | desktop  | empty        | canonical      | —         | `5ad5fffc_northstar-coffee---unassigned-design-queue.png`          | `5ad5fffc_northstar-coffee---unassigned-design-queue.html`          |
| 686650a1 | studioflow---review-decision-mobile                 | `/app/w/acme/reviews`                  | mobile   | decision     | responsive     | —         | `686650a1_studioflow---review-decision-mobile.png`                 | `686650a1_studioflow---review-decision-mobile.html`                 |
| 73699167 | studioflow---build-identity-mobile                  | `/app/account`                         | mobile   | account-menu | supporting     | —         | `73699167_studioflow---build-identity-mobile.png`                  | `73699167_studioflow---build-identity-mobile.html`                  |
| 7493876f | northstar-coffee---planning-library                 | `/app/w/acme/library`                  | desktop  | default      | canonical      | —         | `7493876f_northstar-coffee---planning-library.png`                 | `7493876f_northstar-coffee---planning-library.html`                 |
| 78083c8b | autumn-blend-reveal---production-detail             | `/app/w/acme/planning/{contentItemId}` | desktop  | default      | superseded     | f7159c3e  | `78083c8b_autumn-blend-reveal---production-detail.png`             | `78083c8b_autumn-blend-reveal---production-detail.html`             |
| 793a08d8 | studioflow---forgot-password                        | `/signin/forgot-password`              | desktop  | default      | canonical      | —         | `793a08d8_studioflow---forgot-password.png`                        | `793a08d8_studioflow---forgot-password.html`                        |
| 7ff4ca0d | northstar-coffee---team---invitations               | `/app/w/acme/team`                     | desktop  | default      | superseded     | 2db8ec6e  | `7ff4ca0d_northstar-coffee---team---invitations.png`               | `7ff4ca0d_northstar-coffee---team---invitations.html`               |
| 84b2d2b8 | studioflow---content-detail---discussion-mobile     | `/app/w/acme/planning/{contentItemId}` | mobile   | discussion   | responsive     | —         | `84b2d2b8_studioflow---content-detail---discussion-mobile.png`     | `84b2d2b8_studioflow---content-detail---discussion-mobile.html`     |
| 879e7539 | northstar-coffee---delivery---creative-review-final | `/app/w/acme/reviews`                  | desktop  | final        | canonical      | —         | `879e7539_northstar-coffee---delivery---creative-review-final.png` | `879e7539_northstar-coffee---delivery---creative-review-final.html` |
| 89113980 | studioflow---user-management                        | `/app/users`                           | desktop  | default      | canonical      | —         | `89113980_studioflow---user-management.png`                        | `89113980_studioflow---user-management.html`                        |
| 8c0ec0b0 | northstar-coffee---editorial-calendar               | `/app/w/acme/calendar`                 | desktop  | default      | canonical      | —         | `8c0ec0b0_northstar-coffee---editorial-calendar.png`               | `8c0ec0b0_northstar-coffee---editorial-calendar.html`               |
| 901791af | northstar-coffee---workflow-board                   | `/app/w/acme/board`                    | desktop  | default      | historical     | f9e58e53  | `901791af_northstar-coffee---workflow-board.png`                   | `901791af_northstar-coffee---workflow-board.html`                   |
| 96f0dd19 | northstar-coffee---monthly-planning-list            | `/app/w/acme/planning`                 | desktop  | default      | canonical      | —         | `96f0dd19_northstar-coffee---monthly-planning-list.png`            | `96f0dd19_northstar-coffee---monthly-planning-list.html`            |
| 9794f1aa | northstar-coffee---quick-create-content-drawer      | `/app/w/acme/planning/new`             | desktop  | default      | canonical      | —         | `9794f1aa_northstar-coffee---quick-create-content-drawer.png`      | `9794f1aa_northstar-coffee---quick-create-content-drawer.html`      |
| 9bbb403b | northstar-coffee---tablet-overview                  | `/app/w/acme`                          | tablet   | default      | historical     | d9bb7ef2  | `9bbb403b_northstar-coffee---tablet-overview.png`                  | `9bbb403b_northstar-coffee---tablet-overview.html`                  |
| 9cf65ebd | northstar-coffee---publishing-confirmation          | `/app/w/acme/design-queue`             | desktop  | approved     | canonical      | —         | `9cf65ebd_northstar-coffee---publishing-confirmation.png`          | `9cf65ebd_northstar-coffee---publishing-confirmation.html`          |
| 9d70e67a | studioflow---quick-create-mobile                    | `/app/w/acme/planning/new`             | mobile   | default      | responsive     | —         | `9d70e67a_studioflow---quick-create-mobile.png`                    | `9d70e67a_studioflow---quick-create-mobile.html`                    |
| 9e0f61c2 | northstar-coffee---tablet-reviews                   | `/app/w/acme/reviews`                  | tablet   | default      | responsive     | —         | `9e0f61c2_northstar-coffee---tablet-reviews.png`                   | `9e0f61c2_northstar-coffee---tablet-reviews.html`                   |
| 9e83a73c | studioflow---create-workspace--brand-step           | `/app/workspaces/new`                  | desktop  | default      | supporting     | —         | `9e83a73c_studioflow---create-workspace--brand-step.png`           | `9e83a73c_studioflow---create-workspace--brand-step.html`           |
| a3631dbf | studioflow---create-agency-administrator            | `/setup`                               | desktop  | default      | canonical      | —         | `a3631dbf_studioflow---create-agency-administrator.png`            | `a3631dbf_studioflow---create-agency-administrator.html`            |
| b2677b3c | northstar-coffee---workspace-settings               | `/app/w/acme/settings`                 | desktop  | default      | superseded     | 2f6acd26  | `b2677b3c_northstar-coffee---workspace-settings.png`               | `b2677b3c_northstar-coffee---workspace-settings.html`               |
| bb6ac00d | northstar-coffee---reviews                          | `/app/w/acme/reviews`                  | desktop  | default      | canonical      | —         | `bb6ac00d_northstar-coffee---reviews.png`                          | `bb6ac00d_northstar-coffee---reviews.html`                          |
| c44445d5 | studioflow---publishing-confirmation-mobile         | `/app/w/acme/design-queue`             | mobile   | approved     | responsive     | —         | `c44445d5_studioflow---publishing-confirmation-mobile.png`         | `c44445d5_studioflow---publishing-confirmation-mobile.html`         |
| c7dd77e0 | northstar-coffee---client-review-portal             | `/app/w/acme/client`                   | desktop  | default      | canonical      | —         | `c7dd77e0_northstar-coffee---client-review-portal.png`             | `c7dd77e0_northstar-coffee---client-review-portal.html`             |
| cb0de669 | studioflow---agency-ai-settings-approved            | `/app/agency-settings`                 | desktop  | approved     | canonical      | —         | `cb0de669_studioflow---agency-ai-settings-approved.png`            | `cb0de669_studioflow---agency-ai-settings-approved.html`            |
| d9bb7ef2 | northstar-coffee---tablet-overview-final            | `/app/w/acme`                          | tablet   | final        | responsive     | —         | `d9bb7ef2_northstar-coffee---tablet-overview-final.png`            | `d9bb7ef2_northstar-coffee---tablet-overview-final.html`            |
| db57c9e1 | studioflow---build-identity-desktop                 | `/app/account`                         | desktop  | account-menu | supporting     | —         | `db57c9e1_studioflow---build-identity-desktop.png`                 | `db57c9e1_studioflow---build-identity-desktop.html`                 |
| e350b62a | studioflow---agency-ai-settings-final               | `/app/agency-settings`                 | desktop  | final        | superseded     | cb0de669  | `e350b62a_studioflow---agency-ai-settings-final.png`               | `e350b62a_studioflow---agency-ai-settings-final.html`               |
| e522f7d8 | studioflow---ai-assistance-settings                 | `/app/w/acme/ai-settings`              | desktop  | default      | superseded     | cb0de669  | `e522f7d8_studioflow---ai-assistance-settings.png`                 | `e522f7d8_studioflow---ai-assistance-settings.html`                 |
| e5d3f628 | northstar-coffee---tablet-calendar                  | `/app/w/acme/calendar`                 | tablet   | default      | responsive     | —         | `e5d3f628_northstar-coffee---tablet-calendar.png`                  | `e5d3f628_northstar-coffee---tablet-calendar.html`                  |
| f2bf40ae | northstar-coffee---workspace-overview               | `/app/w/acme`                          | desktop  | default      | canonical      | —         | `f2bf40ae_northstar-coffee---workspace-overview.png`               | `f2bf40ae_northstar-coffee---workspace-overview.html`               |
| f4dc67d1 | studioflow---my-work-dashboard                      | `/app`                                 | desktop  | default      | canonical      | —         | `f4dc67d1_studioflow---my-work-dashboard.png`                      | `f4dc67d1_studioflow---my-work-dashboard.html`                      |
| f7159c3e | autumn-blend-reveal---updated-production-detail     | `/app/w/acme/planning/{contentItemId}` | desktop  | final        | canonical      | —         | `f7159c3e_autumn-blend-reveal---updated-production-detail.png`     | `f7159c3e_autumn-blend-reveal---updated-production-detail.html`     |
| f9e58e53 | northstar-coffee---workflow-board-final             | `/app/w/acme/board`                    | desktop  | final        | canonical      | —         | `f9e58e53_northstar-coffee---workflow-board-final.png`             | `f9e58e53_northstar-coffee---workflow-board-final.html`             |

## Review

- **No missing files.** Every PNG and HTML listed above exists on disk
  (`tests/unit/stitch-cases.test.ts` asserts this with `existsSync`).
  `designs/stitch/DESIGN.md` is the only file in that directory that
  is not a capture artifact.
- **Two captures share a route with a responsive or historical
  sibling** and are the only captures in the inventory that are NOT
  the row owner in `SCREEN_PARITY.md`. Each is marked with a
  `successorScreenId` that points to the owning canonical row:
  - `06a9382e` (creative review, historical) → `879e7539`
    (delivery review, canonical at `/app/w/acme/reviews`).
  - `9bbb403b` (tablet overview, historical) → `d9bb7ef2`
    (tablet overview final, responsive at `/app/w/acme` tablet).
  - `78083c8b` (content detail old, superseded) → `f7159c3e`
    (content detail final, canonical at `/app/w/acme/planning/[id]`).
  - `7ff4ca0d` (team invitations old, superseded) → `2db8ec6e`
    (team invitations final, canonical at `/app/w/acme/team`).
  - `b2677b3c` (workspace settings old, superseded) → `2f6acd26`
    (workspace settings corrected, canonical at `/app/w/acme/settings`).
  - `129bd2e9` (batch add ideas old, superseded) → `43a166ed`
    (batch add ideas final, canonical at `/app/w/acme/planning/batch`).
  - `116b6e36` (notifications mobile final, superseded) → `1272d1fa`
    (notifications mobile approved, responsive on the
    `notification-drawer` evidence group).
  - `e350b62a` and `e522f7d8` (agency settings final old + AI
    assistance settings) → `cb0de669` (agency AI settings approved,
    canonical at `/app/agency-settings`).
  - `901791af` (workflow board, historical) → `f9e58e53`
    (workflow board final, canonical at `/app/w/acme/board`).
- **Evidence groups.** Two captures belong to a shared state rather
  than a route: `21068e5a` (loading/empty/error/denied/archived
  state matrix) and `1272d1fa` / `116b6e36` (mobile notification
  drawer open/closed). These are still reviewable against
  per-state screenshots even though they don't map 1:1 to a route.
- **Forgotten row check.** The prior matrix listed 26 implemented
  routes; the Stitch captures expose a 27th implemented route —
  `/signin/forgot-password` (`793a08d8`). The previous "approved
  deviation" note for that screen is obsolete; the row is now a real
  parity target. See `SCREEN_PARITY.md` for the updated count.

## M4 — Social profile analytics captures (2026-08-24)

The two new M4 surfaces were designed against the existing project
tokens (same palette, typography, spacing, radii as the channels
page capture `45d945d7`). The `ui-ux-pro-max` skill was invoked
first to confirm the design system ("Data-Dense Dashboard" pattern;
WCAG AA contrast; Line Chart for time-series growth; data table as
the source of truth with chart as the visualization). The
`web-design-guidelines` skill was invoked for the review pass.

| screenId (planned) | slug                                           | route / surface                                 | viewport | state   | classification | source                                                       |
| ------------------ | ---------------------------------------------- | ----------------------------------------------- | -------- | ------- | -------------- | ------------------------------------------------------------ |
| `m4picker0001`     | `laratik-planner---meta-account-picker`        | `/app/w/[slug]/channels?pending=<connectionId>` | desktop  | default | canonical      | new — see ADR-0004 + `src/app/.../meta-account-picker.tsx`   |
| `m4social0001`     | `laratik-planner---social-analytics-dashboard` | `/app/w/[slug]/analytics/social`                | desktop  | default | canonical      | new — see ADR-0004 + `src/app/.../analytics/social/page.tsx` |

**Why these are recorded separately:** both surfaces are
implemented, accessible, and aligned to the existing project
tokens. They have not yet been captured through the Stitch MCP
(the `ui-ux-pro-max` skill provided the design system but the
project does not currently have a live Stitch connection in the
worktree). The captures listed above are the planned identifiers
and the source-of-truth file paths; when the operator runs the
next Stitch MCP sync, drop the PNG/HTML into `designs/stitch/`
under these slugs and add the rows to `tests/e2e/stitch-cases.ts`
(see `tests/e2e/stitch-cases.ts` for the manifest contract).

**What the implementation carries today:**

- A `data-testid="meta-account-picker"` on the picker card with a
  `role="list"` of `role="listitem"` rows, each with a labelled
  checkbox and a focus-within ring. Errors render in a
  `role="alert"` region. The submit button has `aria-busy` and
  the count chip has `aria-live="polite"`.
- A `data-testid="social-analytics-page"` on the dashboard. The
  chart is a hand-rolled SVG with `role="img"`, an
  `aria-describedby` pointer to a hidden paragraph that names the
  table below, focusable data points with `aria-label`, and
  tabular numeric font for follower counts.
- A `data-testid="connection-status-{status}"` on the new
  connection-status badge with icon + text and a relative date
  subtitle.
- A focus-managed revoke dialog
  (`data-testid="revoke-dialog"`) with `aria-modal="true"`,
  `aria-labelledby`, `aria-describedby`, Escape-to-close, and
  click-outside-to-cancel.

**Operator action items:**

1. Run the Stitch MCP sync for both surfaces; drop the PNG + HTML
   files into `designs/stitch/` under the slugs above.
2. Add the two rows to `tests/e2e/stitch-cases.ts` (set
   `viewport: VIEWPORTS.desktop` and a real `screenId`).
3. Update `tests/unit/stitch-cases.test.ts` to expect 53 captures
   (51 existing + 2 new).
4. Update `docs/production-readiness/SCREEN_PARITY.md` to add the
   two new routes to the parity matrix.
