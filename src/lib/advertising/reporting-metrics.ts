import type { AdvertisingFact } from "./reporting-service";

export type AdvertisingMetricKey =
  | "spend"
  | "impressions"
  | "reach"
  | "frequency"
  | "allClicks"
  | "linkClicks"
  | "outboundClicks"
  | "landingPageViews"
  | "results"
  | "costPerResult"
  | "ctrAll"
  | "ctrLink"
  | "cpcAll"
  | "cpcLink"
  | "cpm";
export type MetricAvailability = "available" | "partial" | "unavailable";
export type MetricDefinition = {
  readonly key: AdvertisingMetricKey;
  readonly label: string;
  readonly sourceField: string;
  readonly formula: string;
  readonly denominator: string | null;
  readonly attributionWindow: string | null;
  readonly note: string;
};
export type AdvertisingMetricSnapshot = {
  readonly spend: number;
  readonly impressions: number;
  readonly reach: number | null;
  readonly frequency: number | null;
  readonly allClicks: number;
  readonly linkClicks: number | null;
  readonly outboundClicks: number | null;
  readonly landingPageViews: number | null;
  readonly results: number | null;
  readonly costPerResult: number | null;
  readonly ctrAll: number | null;
  readonly ctrLink: number | null;
  readonly cpcAll: number | null;
  readonly cpcLink: number | null;
  readonly cpm: number | null;
};
export type MetricStatus = {
  readonly key: AdvertisingMetricKey;
  readonly availability: MetricAvailability;
  readonly reason: string | null;
  readonly sourceField: string;
  readonly formula: string;
};

export const ADVERTISING_METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  {
    key: "spend",
    label: "Spend",
    sourceField: "spend",
    formula: "sum(spend)",
    denominator: null,
    attributionWindow: null,
    note: "Provider-reported account currency.",
  },
  {
    key: "impressions",
    label: "Impressions",
    sourceField: "impressions",
    formula: "sum(impressions)",
    denominator: null,
    attributionWindow: null,
    note: "Provider-reported served impressions.",
  },
  {
    key: "reach",
    label: "Reach",
    sourceField: "reach",
    formula: "provider account reach",
    denominator: null,
    attributionWindow: null,
    note: "Never summed across overlapping entities.",
  },
  {
    key: "frequency",
    label: "Frequency",
    sourceField: "frequency",
    formula: "impressions / reach",
    denominator: "reach",
    attributionWindow: null,
    note: "Unavailable when safe account-level reach is absent.",
  },
  {
    key: "allClicks",
    label: "All clicks",
    sourceField: "clicks",
    formula: "sum(clicks)",
    denominator: null,
    attributionWindow: null,
    note: "Canonical click total.",
  },
  {
    key: "linkClicks",
    label: "Link clicks",
    sourceField: "resultActions.link_click",
    formula: "sum(link_click)",
    denominator: null,
    attributionWindow: null,
    note: "Only when Meta returns the action.",
  },
  {
    key: "outboundClicks",
    label: "Outbound clicks",
    sourceField: "resultActions.outbound_click",
    formula: "sum(outbound_click)",
    denominator: null,
    attributionWindow: null,
    note: "Only when Meta returns the action.",
  },
  {
    key: "landingPageViews",
    label: "Landing-page views",
    sourceField: "resultActions.landing_page_view",
    formula: "sum(landing_page_view)",
    denominator: null,
    attributionWindow: null,
    note: "Only when Meta returns the action.",
  },
  {
    key: "results",
    label: "Objective-aware results",
    sourceField: "results/resultType",
    formula: "sum(results) within one result type",
    denominator: null,
    attributionWindow: "provider resultType",
    note: "Mixed objective result types are not combined.",
  },
  {
    key: "costPerResult",
    label: "Cost per result",
    sourceField: "spend/results",
    formula: "spend / results",
    denominator: "results",
    attributionWindow: "provider resultType",
    note: "Unavailable when results are unavailable or zero.",
  },
  {
    key: "ctrAll",
    label: "CTR (all)",
    sourceField: "clicks/impressions",
    formula: "all clicks / impressions",
    denominator: "impressions",
    attributionWindow: null,
    note: "Recalculated from aggregate numerators.",
  },
  {
    key: "ctrLink",
    label: "CTR (link)",
    sourceField: "resultActions.link_click/impressions",
    formula: "link clicks / impressions",
    denominator: "impressions",
    attributionWindow: null,
    note: "Unavailable without link-click actions.",
  },
  {
    key: "cpcAll",
    label: "CPC (all)",
    sourceField: "spend/clicks",
    formula: "spend / all clicks",
    denominator: "all clicks",
    attributionWindow: null,
    note: "Recalculated from aggregate numerators.",
  },
  {
    key: "cpcLink",
    label: "CPC (link)",
    sourceField: "spend/resultActions.link_click",
    formula: "spend / link clicks",
    denominator: "link clicks",
    attributionWindow: null,
    note: "Unavailable without link-click actions.",
  },
  {
    key: "cpm",
    label: "CPM",
    sourceField: "spend/impressions",
    formula: "spend / impressions * 1000",
    denominator: "impressions",
    attributionWindow: null,
    note: "Recalculated from aggregate numerators.",
  },
];

function actionValue(row: AdvertisingFact, keys: readonly string[]): number | null {
  const actions = row.resultActions;
  if (!actions) return null;
  for (const key of keys) {
    const value = actions[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))
      return Number(value);
  }
  return null;
}
function sumOptional(values: readonly (number | null)[]): number | null {
  return values.some((value) => value === null)
    ? null
    : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}
function uniqueReach(rows: readonly AdvertisingFact[]): number | null {
  const values = [
    ...new Set(
      rows.map((row) => row.reach).filter((value): value is number => typeof value === "number"),
    ),
  ];
  return values.length === 1 ? values[0]! : null;
}

export function aggregateAdvertisingMetrics(
  rows: readonly AdvertisingFact[],
): AdvertisingMetricSnapshot {
  const spend = rows.reduce((sum, row) => sum + row.spend, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const allClicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const linkClicks = sumOptional(
    rows.map((row) => actionValue(row, ["link_click", "link_clicks", "linkClicks"])),
  );
  const outboundClicks = sumOptional(
    rows.map((row) => actionValue(row, ["outbound_click", "outbound_clicks", "outboundClicks"])),
  );
  const landingPageViews = sumOptional(
    rows.map((row) =>
      actionValue(row, ["landing_page_view", "landing_page_views", "landingPageViews"]),
    ),
  );
  const resultTypes = new Set(
    rows.map((row) => row.resultType).filter((value): value is string => Boolean(value)),
  );
  const compatibleResults = resultTypes.size <= 1;
  const resultValues = rows.map((row) => row.results);
  const results =
    compatibleResults &&
    resultValues.every((value) => typeof value === "number") &&
    resultValues.length > 0
      ? resultValues.reduce((sum, value) => sum + (value ?? 0), 0)
      : null;
  const reach = uniqueReach(rows);
  return {
    spend,
    impressions,
    reach,
    frequency: reach && reach > 0 ? impressions / reach : null,
    allClicks,
    linkClicks,
    outboundClicks,
    landingPageViews,
    results,
    costPerResult: results && results > 0 ? spend / results : null,
    ctrAll: impressions > 0 ? allClicks / impressions : null,
    ctrLink: linkClicks !== null && impressions > 0 ? linkClicks / impressions : null,
    cpcAll: allClicks > 0 ? spend / allClicks : null,
    cpcLink: linkClicks !== null && linkClicks > 0 ? spend / linkClicks : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
  };
}

export function metricStatuses(snapshot: AdvertisingMetricSnapshot): readonly MetricStatus[] {
  return ADVERTISING_METRIC_DEFINITIONS.map((definition) => {
    const value = snapshot[definition.key];
    return {
      key: definition.key,
      availability: value === null ? "unavailable" : "available",
      reason: value === null ? definition.note : null,
      sourceField: definition.sourceField,
      formula: definition.formula,
    };
  });
}
