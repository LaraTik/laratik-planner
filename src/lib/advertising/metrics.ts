import type { AdvertisingReportContext } from "./types";
export type AdvertisingMetricKey =
  | "spend"
  | "impressions"
  | "clicks"
  | "reach"
  | "conversions"
  | "ctr"
  | "cpc"
  | "cpm"
  | "cost_per_result"
  | "roas";
export type MetricAdditivity = "additive" | "non_additive";
export interface AdvertisingMetricDefinition {
  readonly key: AdvertisingMetricKey;
  readonly unit: "currency" | "count" | "ratio";
  readonly additivity: MetricAdditivity;
  readonly sourceGrain: AdvertisingReportContext["grain"];
  readonly requiresAttributionContext: boolean;
  readonly formula: string;
}
export const ADVERTISING_METRIC_DEFINITIONS: Readonly<
  Record<AdvertisingMetricKey, AdvertisingMetricDefinition>
> = {
  spend: {
    key: "spend",
    unit: "currency",
    additivity: "additive",
    sourceGrain: "ad_day",
    requiresAttributionContext: false,
    formula: "sum(provider spend)",
  },
  impressions: {
    key: "impressions",
    unit: "count",
    additivity: "additive",
    sourceGrain: "ad_day",
    requiresAttributionContext: false,
    formula: "sum(provider impressions)",
  },
  clicks: {
    key: "clicks",
    unit: "count",
    additivity: "additive",
    sourceGrain: "ad_day",
    requiresAttributionContext: false,
    formula: "sum(provider clicks)",
  },
  reach: {
    key: "reach",
    unit: "count",
    additivity: "non_additive",
    sourceGrain: "ad_day",
    requiresAttributionContext: false,
    formula: "provider unique reach; never sum across days",
  },
  conversions: {
    key: "conversions",
    unit: "count",
    additivity: "additive",
    sourceGrain: "ad_day",
    requiresAttributionContext: true,
    formula: "sum(provider actions under one attribution context)",
  },
  ctr: {
    key: "ctr",
    unit: "ratio",
    additivity: "non_additive",
    sourceGrain: "ad_day",
    requiresAttributionContext: false,
    formula: "clicks / impressions",
  },
  cpc: {
    key: "cpc",
    unit: "currency",
    additivity: "non_additive",
    sourceGrain: "ad_day",
    requiresAttributionContext: false,
    formula: "spend / clicks",
  },
  cpm: {
    key: "cpm",
    unit: "currency",
    additivity: "non_additive",
    sourceGrain: "ad_day",
    requiresAttributionContext: false,
    formula: "spend / impressions * 1000",
  },
  cost_per_result: {
    key: "cost_per_result",
    unit: "currency",
    additivity: "non_additive",
    sourceGrain: "ad_day",
    requiresAttributionContext: true,
    formula: "spend / conversions",
  },
  roas: {
    key: "roas",
    unit: "ratio",
    additivity: "non_additive",
    sourceGrain: "ad_day",
    requiresAttributionContext: true,
    formula: "conversion value / spend",
  },
};
export function assertCompatibleReportContexts(
  contexts: readonly AdvertisingReportContext[],
): void {
  const first = contexts[0];
  if (!first) return;
  for (const context of contexts.slice(1)) {
    if (
      context.definitionVersion !== first.definitionVersion ||
      context.provider !== first.provider ||
      context.accountId !== first.accountId ||
      context.currency !== first.currency ||
      context.timezone !== first.timezone ||
      context.attributionWindow !== first.attributionWindow ||
      context.actionReportTime !== first.actionReportTime ||
      context.grain !== first.grain ||
      context.breakdowns.join("|") !== first.breakdowns.join("|")
    )
      throw new Error("incompatible_advertising_report_context");
  }
}
