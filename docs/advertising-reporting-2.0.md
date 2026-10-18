# Advertising Reporting 2.0

The reporting route is a read-only, workspace-scoped decision surface backed by the existing authorized Meta canonical facts. It keeps the LaraTik light Stitch system and adds an executive layer above the existing detailed tables.

## Metric dictionary

| Metric               | Source and calculation                               | Availability rule                                |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| Spend                | Sum of provider spend in account currency            | Available when canonical facts exist             |
| Impressions          | Sum of provider impressions                          | Available when canonical facts exist             |
| Reach                | Provider account-level reach                         | Never summed across overlapping ad rows          |
| Frequency            | Impressions / safe reach                             | Unavailable without a unique reach value         |
| All clicks           | Sum of canonical clicks                              | Available when canonical facts exist             |
| Link/outbound clicks | `resultActions` action totals                        | Unavailable when Meta omits the action           |
| Results              | Sum of persisted results within one `resultType`     | Mixed objective/result types are not combined    |
| Cost per result      | Spend / objective-aware results                      | Unavailable when results are unavailable or zero |
| CTR / CPC / CPM      | Aggregate numerator divided by aggregate denominator | Zero denominators return unavailable             |

Every metric definition exposes its source field and formula in the report's progressive-disclosure metric dictionary. The provider result type remains the attribution boundary; the UI does not replace an unavailable value with zero or an estimate.

## Comparison semantics

The URL-driven comparison selector supports the previous matching period, the previous year, and custom dates. Absolute and percentage deltas are rendered only when both periods contain comparable complete data. Cost metrics treat a decrease as favorable; reach, results, and rate metrics treat an increase as favorable.

## Data health

The health strip shows freshness, last successful sync, account timezone, selected coverage, and partial state. Partial or stale data is labelled explicitly and remains available for inspection, but should be reviewed before financial decisions.

## Audience, targeting, and provider limitations

Audience rows are provider-returned observations and are not inferred. Targeting and creative metadata remain read-only provider object metadata. Missing creative previews, unsupported breakdowns, unavailable reach, and incomplete action arrays must render as unavailable states. No campaign editing, publishing, provider scraping, or estimated reach is introduced by this redesign.

## Export and access

Exports continue through the authenticated, tenant-scoped reporting boundary. The selected account and date range remain required; future export extensions should include comparison settings, timezone, currency, attribution notes, metric definitions, and data-health notes alongside the rows.

## Responsive and bilingual contract

The executive dashboard uses the current light tokens, logical spacing, compact cards, 44px controls, keyboard-visible focus, SVG icons, and a table fallback for the trend chart. English/LTR and Arabic/RTL use the same route and centralized advertising message catalog. Existing detailed campaign, ad set, ad, audience, and targeting tables remain below the executive layer for drill-down continuity.
