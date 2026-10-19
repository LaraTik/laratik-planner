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

## Explainable signals and Action Center

The overview Action Center prioritizes underperforming campaigns before
effective campaigns and links each affected entity to the authenticated
Campaigns explorer. Every signal keeps its reason, selected period, impression
sample, and peer CTR/CPC baseline. The baseline is computed only when at least
two eligible campaigns meet the comparison threshold; otherwise it remains
unavailable. Review evidence is progressively disclosed so the default scan
stays compact while the evidence remains keyboard-accessible. Confidence is
described as a sample guard, not as fabricated statistical certainty.

## Data health

The health strip is backed by `DataHealthSummary` from the report query and API. It shows freshness, last successful sync, account timezone, selected coverage, and one of four explicit states:

- `complete` — a fresh successful sync with complete coverage;
- `partial` — the provider or sync run reports incomplete coverage;
- `delayed` — the latest data is stale, failed, or still running;
- `unavailable` — no successful sync exists for the account.

These states are not converted to zeroes or hidden behind a generic error. Partial, delayed, or unavailable data remains inspectable but should be reviewed before financial decisions.

## Audience, targeting, and provider limitations

Audience rows are provider-returned observations and are not inferred. The Audience section presents Age, Gender, Country, and Placement tabs, ranks by a selected compatible metric, defaults to the top five rows, and keeps a show-all disclosure. It explains Meta privacy/permission limits and suppresses Results/Cost per Result when the audience response does not carry compatible objective attribution. Targeting is rendered as readable category chips with unknown provider fields preserved and the complete raw JSON available behind a disclosure. Creative metadata remains read-only provider object metadata. Creative presentation fields are retained only when Meta returns them (`thumbnail_url`, `image_url`, `video_id`, headline/body, format, link, CTA, and provider spec payloads); the Creatives section shows validated HTTPS previews and an accessible detail drawer, while missing previews remain unavailable rather than fabricated. Unsupported breakdowns, unavailable reach, and incomplete action arrays must render as unavailable states. No campaign editing, publishing, provider scraping, or estimated reach is introduced by this redesign.

## Export and access

Exports continue through the authenticated, tenant-scoped reporting boundary. The
CSV starts with a documented metadata preamble, followed by the authorized
fact rows. The preamble includes account identity, selected date range,
account timezone, currency, active section/search/objective/status filters,
comparison mode and custom dates when present, trend selections, data-health
state/coverage/issues, attribution semantics, and the metric dictionary used
by the report. Metadata is derived from the authorized account/report and is
never a substitute for authorization. Missing values remain `Not available`;
they are not converted to zeroes.

The export menu also provides XLSX. It is generated server-side from the same
authorized projection as CSV and keeps the metadata preamble, metric
definitions, data-health notes, and local taxonomy columns in the first
worksheet. The XLSX writer is intentionally dependency-free and bounded to a
single report sheet.

Report sharing creates a short-lived token whose SHA-256 digest is stored in
the tenant database. The link is only a locator: the recipient must still be
signed in, belong to the workspace, and hold an internal reporting role. An
expired, revoked, cross-agency, or malformed share resolves to the same
not-found boundary as other protected report routes.

Local taxonomy labels are workspace-owned metadata, never provider mutations.
Campaigns, ad sets, ads, and creatives can receive `brand`, `platform`,
`objective`, `topic`, `language`, or `month` labels. The creative explorer
exposes the first editing surface for these labels; search and exports retain
the labels as context. Provider names and delivery state are not silently
rewritten.

The Campaigns explorer keeps its sort and visible metric columns in the typed
URL view configuration. The state survives section navigation, filter submits,
exports, reloads, and saved-view restoration. At least one metric column must
remain visible; invalid or unavailable column values fall back to the complete
safe set.

## Responsive and bilingual contract

The executive dashboard uses the current light tokens, logical spacing, compact cards, 44px controls, keyboard-visible focus, SVG icons, and a table fallback for the trend chart. English/LTR and Arabic/RTL use the same route and centralized advertising message catalog. Campaign, ad set, ad, creative, audience, and targeting explorers are separate URL-driven sections so each view presents only its relevant information.
