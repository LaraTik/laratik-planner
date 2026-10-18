# Advertising reporting UI foundation

Updated: 2026-10-18

This document records the final refinement pass for the Advertising Reporting
2.0 route. The attached product reference is used for information hierarchy
and density; LaraTik's current Stitch light system remains the source of truth
for tokens, shell behavior, bilingual support, and accessibility.

## Parity review

| Reference expectation          | LaraTik implementation                                        | Decision                                                   |
| ------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------- |
| Persistent application sidebar | Existing workspace-aware LaraTik sidebar                      | Keep as the only app-level navigation rail                 |
| Dense reporting workspace      | Light, border-first cards with compact KPI and table rhythm   | Match density without importing the reference's dark theme |
| Six primary KPIs               | Spend, Results, Cost / result, Reach, CTR, Frequency          | Keep objective-aware and unavailable-safe                  |
| Trend chart with comparison    | SVG bar + line chart with localized values and table fallback | Preserve as a lightweight dependency-free chart foundation |
| Objective breakdown donut      | Objective spend donut with legend, results, and cost / result | Added to align more closely with the reference             |
| AI/action insight rail         | Evidence-backed Action Center and intelligence panels         | Keep actions read-only and link to the Campaigns section   |
| Campaign/ad/ad-set detail      | Separate URL-driven report sections                           | Do not render all explorers as one long page               |
| Audience and targeting         | Dedicated Audience and Targeting sections                     | Keep provider limitations and unavailable states explicit  |
| Technical metric detail        | Progressive-disclosure Metric definitions panel               | Keep available without dominating the first scan           |

## Section contract

The reporting route uses `?section=` as its local navigation state:

- `overview` — data health, six KPIs, trend, objective mix, action center,
  campaign snapshot, audience snapshot, and metric definitions.
- `campaigns` — campaign-level performance table and pagination.
- `creatives` — ad-set, ad, and promoted-post performance tables.
- `audience` — provider-returned audience delivery rows and pagination.
- `targeting` — readable targeting metadata with an explicit unavailable state.

The persistent sidebar remains responsible for moving between application
destinations. The reporting section nav is a secondary, page-local navigation;
it must remain deep-linkable, keyboard reachable, and preserve account, date,
comparison, search, objective, and status state.

## Shared foundation

New reporting surfaces should reuse:

- `src/components/reporting/reporting-section-nav.tsx` for deep-linkable local
  sections. Pass translated labels and fully-built authenticated URLs; do not
  put product routes or filter semantics inside the component.
- `src/components/reporting/reporting-kpi-card.tsx` for metric cards. Pass a
  preformatted value, optional Lucide icon, and an explicit positive/negative/
  neutral delta state with accessible text.
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, and `Button` from the
  existing UI primitives before introducing another card or control variant.
- Semantic tokens from `src/app/globals.css`; reporting cards are
  border-first, while elevation remains reserved for transient surfaces.

Do not create a second analytics token file, a second dashboard store, a
second navigation rail, or page-local raw colors. Feature-specific data
aggregation stays in `src/lib/advertising`; shared presentation components
must remain provider-agnostic.

## Interaction and accessibility rules

- Every report-local navigation item has a URL, visible label, active state,
  and visible focus ring.
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

## Remaining recommendations

These are deliberately not bundled into this refinement pass:

1. Add a report-level saved-view persistence model and a dedicated share/export
   metadata contract after the current read-only API shape is finalized.
2. Add selectable day/week/month trend granularity and a server-provided
   comparison trace when comparison-period daily observations are available.
3. Add creative preview/detail drawers only when Meta returns a validated
   preview URL and creative metadata; never fabricate thumbnails.
4. Add a reviewed Stitch capture for this route and record each responsive
   baseline in the visual evidence manifest.
5. Consolidate or retire the now-unmounted legacy
   `advertising-report-visuals.tsx` component in a separate cleanup after its
   standalone visual test is migrated to the executive dashboard.
