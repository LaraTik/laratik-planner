# Advertising reporting UI foundation

Updated: 2026-10-19

This document records the final refinement pass for the Advertising Reporting
2.0 route. The attached product reference is used for information hierarchy
and density; LaraTik's current Stitch light system remains the source of truth
for tokens, shell behavior, bilingual support, and accessibility.

## Parity review

| Reference expectation          | LaraTik implementation                                            | Decision                                                                                          |
| ------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Persistent application sidebar | Workspace-aware LaraTik sidebar with expanded Advertising branch  | Keep Advertising sections in the primary rail; use the mobile drawer below                        |
| Dense reporting workspace      | Light, border-first cards with compact KPI and table rhythm       | Match density without importing the reference's dark theme                                        |
| Six primary KPIs               | Spend, Results, Cost / result, Reach, CTR, Frequency              | Keep objective-aware and unavailable-safe                                                         |
| Trend chart with comparison    | SVG bar + line chart with localized values and table fallback     | Preserve as a lightweight dependency-free chart foundation                                        |
| Objective breakdown donut      | Objective spend donut with legend, results, and cost / result     | Added to align more closely with the reference                                                    |
| AI/action insight rail         | Evidence-backed Action Center and intelligence panels             | Keep actions read-only and link to the Campaigns section                                          |
| Evidence disclosure            | Prioritized signals with period, sample, peer baseline, and guard | Keep the scan compact; disclose decision evidence on demand                                       |
| Campaign/ad/ad-set detail      | Separate URL-driven report sections                               | Do not render all explorers as one long page                                                      |
| Audience and targeting         | Dedicated Audience and Targeting sections                         | Audience tabs rank compact provider rows; targeting keeps chips + raw JSON                        |
| Technical metric detail        | Progressive-disclosure Metric definitions panel                   | Keep available without dominating the first scan                                                  |
| Report export context          | CSV metadata preamble plus authorized fact rows                   | Preserve filters, comparison, metric, attribution, and health context                             |
| Campaign explorer controls     | URL-backed hierarchy, sort, and visible-column picker             | Keep delivery and core efficiency columns available while preserving state across section changes |

## Section contract

The reporting route uses `?section=` as its local navigation state:

- `overview` — data health, six KPIs, trend, objective mix, action center,
  campaign snapshot, audience snapshot, and metric definitions.
- `reporting` — daily account performance and metric-definition status.
- `campaigns` — campaign-level performance table and pagination.
- `adsets` — ad-set-level performance table and pagination.
- `ads` — ad-level performance table and pagination.
- `creatives` — provider creative cards with real HTTPS previews when available,
  fatigue evidence, and an accessible detail drawer; unavailable previews remain
  explicit, with promoted-post joins below.
- `audience` — provider-returned Age, Gender, Country, and Placement tabs with
  metric ranking, top-five default, show-all disclosure, and explicit
  attribution/privacy limitations.
- `targeting` — readable category chips, preserved unknown fields, and a raw
  provider JSON disclosure with an explicit unavailable state.

The persistent sidebar owns the Advertising section hierarchy: Overview,
Reporting, Campaigns, Ad Sets, Ads, Audience, Creatives, and Targeting. Each
child is URL-driven and keeps the report parent expanded while active. If the
user chooses the collapsed icon rail (or is on a tablet-width rail), the
Advertising icon opens an accessible portal flyout containing the same child
links; this preserves the reference hierarchy without forcing a global shell
preference. Each view renders only its own data set; the route does not use one
long scroll to present every explorer. On narrower layouts, the same section
links are also available in the mobile navigation drawer; the compact
page-local row remains only as a tablet fallback and is hidden on wide desktop
to avoid duplicate navigation.

## Shared foundation

The data-health strip is backed by the same typed state used by the report API:
`complete`, `partial`, `delayed`, or `unavailable`. It shows the selected
coverage window, account timezone, localized sync time, freshness, and an
explicit status label. Each primary KPI repeats its availability state, and the
health details dialog exposes metric lineage, source, formula, denominator, and
attribution window without crowding the first scan. A missing or stale provider
value remains unavailable or delayed; it is never rendered as a zero or a fabricated estimate. Objective
results follow the same rule: rollups only sum rows sharing one result type,
while mixed objective actions keep their raw evidence and show an unavailable
aggregate. The result definition is carried into the KPI label and explorer
rows when the provider supplies one, so “Results” is never presented as an
unqualified heterogeneous total. The six-card executive strip also exposes a
URL-driven supplementary metric picker for impressions, click variants,
landing-page views, CTR/CPC variants, and CPM; its comparison delta and
availability state use the same aggregate numerators and metric dictionary.

New reporting surfaces should reuse:

- `src/components/reporting/reporting-section-nav.tsx` for deep-linkable local
  sections. Pass translated labels and fully-built authenticated URLs; do not
  put product routes or filter semantics inside the component.
- `src/components/reporting/reporting-kpi-card.tsx` for metric cards. Pass a
  preformatted value, optional Lucide icon, and an explicit positive/negative/
  neutral delta state with accessible text.
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, and `Button` from the
  existing UI primitives before introducing another card or control variant.
- `src/app/(app)/app/a/[agencySlug]/w/[slug]/analytics/advertising/advertising-hierarchy-explorer.tsx`
  for campaign → ad set → ad exploration. Keep cost/result, reach, frequency,
  CTR(Link), and CPM unavailable-safe and URL-backed when adding future columns.
- Semantic tokens from `src/app/globals.css`; reporting cards are
  border-first, while elevation remains reserved for transient surfaces.

Do not create a second analytics token file, a second dashboard store, a
second navigation rail, or page-local raw colors. Feature-specific data
aggregation stays in `src/lib/advertising`; shared presentation components
must remain provider-agnostic.

## Interaction and accessibility rules

- Every Advertising navigation item has a URL, visible label, active state,
  and visible focus ring in the desktop rail, collapsed-rail flyout, and
  mobile drawer.
- On mobile, report filters collapse into one labeled button that opens an
  accessible dialog drawer; desktop keeps the filter surface sticky and
  visible. Both views submit the same URL-driven configuration so deep links
  and back/forward navigation remain stable.
- Sticky filters and section navigation must not obscure focused content.
- Tables keep local horizontal overflow on narrow screens; the document body
  must not gain horizontal overflow.
- Charts must include a visible legend, localized values, a concise accessible
  summary, and a table fallback. Missing points remain gaps, not zeroes.
- Status and comparison meaning use icon/text plus semantic color; color alone
  is not sufficient.
- All new copy belongs in both `src/messages/en/advertising.json` and
  `src/messages/ar/advertising.json`; use logical spacing for RTL.
- Verify 375, 768, 1024, 1280, and 1440px in EN/LTR and AR/RTL before marking
  a visual refinement complete.

## Saved views and next recommendations

The header **Save view** action now persists a typed, versioned advertising view
configuration through `/api/advertising/saved-views`. The API reuses the
existing workspace-scoped `saved_filter` table with the
`advertising-reporting` surface/version envelope; it does not create a second
analytics store. Every read and write resolves the authenticated actor, active
agency, workspace membership, and owner/share scope server-side. The stored
configuration includes the account, date range, comparison dates, section,
search filters, supplementary metric, chart metrics/granularity, and
pagination/explorer state. The
dialog lists private and workspace-shared views and restores one through the
existing URL-driven route state.

The remaining recommendation is deliberately separate from this refinement:

1. Consolidate or retire the now-unmounted legacy
   `advertising-report-visuals.tsx` component in a separate cleanup after its
   standalone visual test is migrated to the executive dashboard.

The app-only visual inventory now covers the populated canonical advertising
route at 375, 768, 1024, 1280, and 1440px. The five responsive baselines are
committed under `tests/e2e/visual-regression.spec.ts-snapshots/responsive/` and
the strict visual slice passes 5/5. Sync timestamps are marked as dynamic data
in the report markup so captures remain comparable across runs.

Trend controls are now URL-driven and support day/week/month buckets. When
both periods are complete, the chart renders a dashed comparison trace;
missing result points remain unavailable rather than being converted to zero.
