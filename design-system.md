# LaraTik Planner design system

This is the durable design-system record for the planner app. The shipped
implementation source is `src/app/globals.css`; this file records the values
that are in use and the approved dark-theme target before implementation.

Read this file before changing shared UI, the app shell, analytics, or theme
behavior. Do not copy Meedro branding; borrow its information hierarchy,
navigation discipline, and decision-oriented analytics presentation.

## Product direction

Calm operations cockpit: dense enough for an agency operator, quiet enough to
scan, and warm enough to feel like a creative workspace. The work surface is
more prominent than the chrome. Colour is reserved for actions, statuses, and
data meaning.

Reference calibration: Meedro Command Center for KPI-to-decision flow; Linear
for restrained density; LaraTik Stitch for route behavior, bilingual copy, and
workspace workflow invariants.

## Current shared tokens

| Token            | Light value           | Usage                                  |
| ---------------- | --------------------- | -------------------------------------- |
| canvas           | `#F7F7F5`             | page background                        |
| surface          | `#FFFFFF`             | panels and navigation                  |
| surface-subtle   | `#F1F3F5`             | grouped controls and quiet regions     |
| border           | `#DDE1E6`             | dividers and card boundaries           |
| fg-primary       | `#172033`             | headings and primary values            |
| fg-secondary     | `#5D6678`             | supporting copy                        |
| fg-muted         | `#5B6270`             | quiet copy with WCAG AA contrast       |
| primary          | `#4F46E5`             | primary action and active state        |
| primary-hover    | `#4338CA`             | hover/pressed primary action           |
| primary-subtle   | `#EEF2FF`             | selected and low-emphasis action state |
| focus-ring       | `#6366F1`             | keyboard focus                         |
| success / subtle | `#15803D` / `#ECFDF3` | positive state                         |
| warning / subtle | `#B45309` / `#FFF7E6` | attention state                        |
| danger / subtle  | `#B91C1C` / `#FEF2F2` | destructive/error state                |
| info / subtle    | `#0369A1` / `#F0F9FF` | informational state                    |
| card radius      | `10px`                | cards and panels                       |
| control radius   | `8px`                 | inputs and buttons                     |
| control height   | `40px`                | standard desktop control               |
| touch height     | `44px`                | mobile and accessible target           |

Typography is Inter for Latin text and Noto Sans Arabic for RTL chrome/content.
The type scale is page title 28/36 semibold, section title 20/28 semibold,
card title 16/24 semibold, body 14/21, dense table 13/18, label 12/16.

## Approved dark-theme target

These values are the M1 dark-theme token target and are now wired through the
semantic root tokens. Full route-by-route dark-mode contrast and visual review
is still open; components must not gain page-specific colour logic.

| Token            | Dark target           | Usage                                  |
| ---------------- | --------------------- | -------------------------------------- |
| canvas           | `#0B1020`             | page background                        |
| surface          | `#121A2B`             | panels and navigation                  |
| surface-subtle   | `#182338`             | grouped controls and quiet regions     |
| border           | `#293752`             | dividers and boundaries                |
| fg-primary       | `#F3F6FB`             | headings and primary values            |
| fg-secondary     | `#B6C1D4`             | supporting copy                        |
| fg-muted         | `#8D9AB1`             | quiet copy                             |
| primary          | `#818CF8`             | primary action and active state        |
| primary-hover    | `#A5B4FC`             | hover/pressed primary action           |
| primary-subtle   | `#20264D`             | selected and low-emphasis action state |
| focus-ring       | `#A5B4FC`             | keyboard focus                         |
| success / subtle | `#4ADE80` / `#123321` | positive state                         |
| warning / subtle | `#FBBF24` / `#3A2B0B` | attention state                        |
| danger / subtle  | `#F87171` / `#3A171C` | destructive/error state                |
| info / subtle    | `#38BDF8` / `#102C42` | informational state                    |

Dark mode uses no routine drop shadows; panels are separated by surface steps
and subtle rings. It is not a colour inversion. Status meaning always includes
text or icon, never colour alone.

## Shell and navigation contract

- Desktop: persistent workspace-aware sidebar at 248px, 64px top bar, main
  surface capped at `max-w-7xl` with responsive gutters.
- Tablet: 72px icon rail; content remains readable before any density is
  reduced.
- Mobile: compact top context header and bottom navigation/More sheet; no
  squeezed desktop board.
- Sidebar owns location, workspace/agency context, grouped destinations, and
  attention badges. It must not become a second page-local navigation rail.
- Workspace groups are ordered as `Plan` (planning, reviews, design queue),
  `Understand` (Trend Radar, analytics, channels), `Produce` (library, media,
  brand kit), and `Manage` (activity, team, settings). Keep these groups job-
  oriented; do not regroup routes by database table or implementation layer.
- Top bar owns global utilities: notifications, account, help, and safe global
  actions. It must not duplicate the workspace sidebar.
- Page header owns title, scope/freshness, and one dominant next action.
- Tabs/segmented controls own views within one destination; they do not replace
  the persistent shell.

## Command Center contract

The first large product improvement uses the existing social analytics model:

1. scope/account selector and freshness;
2. KPI strip with visible period and comparison;
3. growth trend with accessible summary and table fallback;
4. top/outlier content with source, metrics, and planning handoff;
5. performance distribution against the workspace/account average;
6. timing and format/length signals with sample-size caveats;
7. inventory and filters for drill-down.

Every chart needs visible values, a legend, keyboard/touch access, a text
summary, loading/empty/error states, and a data-table alternative where the
chart is not self-explanatory. “Create draft” or “Apply to planning” is the
destination of a useful signal; analytics must not become an isolated report.
RTL data tables that exceed the viewport must keep the horizontal overflow on
their local scroller (`dir="ltr"`) while preserving the table's locale direction;
never let a wide heatmap expand the document body.

Research collections follow the same evidence boundary: a collection is a
workspace-scoped pointer to an existing bookmark or validated teardown, with
explicit `me` / `workspace` visibility. It is not a provider-media cache or a
second trend-board taxonomy. The v1 UI assigns one active collection per saved
item; add a join table only when multi-project reuse is demonstrated.

## Implementation conventions

- Use semantic CSS variables from `globals.css`; never add raw page-level
  colour values for routine UI.
- Filled primary/danger controls must use the corresponding semantic foreground
  token (`primary-foreground` / `danger-foreground`); do not pair a themeable
  background with hard-coded `text-white`.
- Reuse `Card`, `Button`, `Checkbox`, `PageHeader`, `SegmentedControl`, and
  existing chart/data-table components before creating a new primitive.
- Use Lucide icons consistently; no emoji as structural icons.
- Use logical spacing and direction-aware inputs for EN/AR.
- Preserve visible focus, 44px touch targets, reduced-motion behavior, and
  bilingual catalog parity.
- Verify at 375, 768, 1024, 1280, and 1440px in both themes before calling a
  touched surface complete.

## Known exceptions

- `src/app/(app)/app/w/[slug]/analytics/social` is already a production
  analytics surface with its own dense controls and chart treatment. Improve it
  incrementally; do not fork a second analytics store or dashboard framework.
- The current Google Stitch project remains the visual parity source for route
  behavior. Meedro is a product-reference study, not a replacement design
  source.
