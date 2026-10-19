import { z } from "zod";

export const advertisingReportSectionSchema = z.enum([
  "overview",
  "reporting",
  "campaigns",
  "adsets",
  "ads",
  "creatives",
  "audience",
  "targeting",
]);

export const advertisingReportViewConfigSchema = z
  .object({
    surface: z.literal("advertising-reporting"),
    version: z.literal(1),
    accountId: z.string().min(1).max(255),
    since: z.string().date(),
    until: z.string().date(),
    compare: z.enum(["previous", "previous_year", "custom"]),
    compareSince: z.string().date().optional(),
    compareUntil: z.string().date().optional(),
    section: advertisingReportSectionSchema,
    search: z.string().max(200).optional(),
    objective: z.string().max(120).optional(),
    status: z.string().max(120).optional(),
    trendMetricA: z.enum(["spend", "impressions", "clicks", "results"]),
    trendMetricB: z.enum(["spend", "impressions", "clicks", "results"]),
    trendGranularity: z.enum(["day", "week", "month"]),
    campaignPage: z.string().regex(/^\d+$/).optional(),
    adSetPage: z.string().regex(/^\d+$/).optional(),
    adPage: z.string().regex(/^\d+$/).optional(),
    audiencePage: z.string().regex(/^\d+$/).optional(),
    explorerLevel: z.enum(["campaign", "adset", "ad"]).optional(),
    audienceBreakdown: z.string().max(80).optional(),
    sort: z.string().max(120).optional(),
    visibleColumns: z.array(z.string().max(80)).max(40).optional(),
  })
  .strict();

export type AdvertisingReportViewConfig = z.infer<typeof advertisingReportViewConfigSchema>;

export function advertisingReportViewConfigFromSearch({
  params,
  accountId,
  since,
  until,
}: {
  params: URLSearchParams;
  accountId: string;
  since: string;
  until: string;
}): AdvertisingReportViewConfig {
  const visibleColumns = params
    .get("visibleColumns")
    ?.split(",")
    .map((column) => column.trim())
    .filter(Boolean);
  return advertisingReportViewConfigSchema.parse({
    surface: "advertising-reporting",
    version: 1,
    accountId,
    since,
    until,
    compare: valueOrDefault(params.get("compare"), "previous"),
    ...(params.get("compareSince") ? { compareSince: params.get("compareSince") } : {}),
    ...(params.get("compareUntil") ? { compareUntil: params.get("compareUntil") } : {}),
    section: valueOrDefault(params.get("section"), "overview"),
    ...(params.get("search") ? { search: params.get("search") } : {}),
    ...(params.get("objective") ? { objective: params.get("objective") } : {}),
    ...(params.get("status") ? { status: params.get("status") } : {}),
    trendMetricA: valueOrDefault(params.get("trendMetricA"), "spend"),
    trendMetricB: valueOrDefault(params.get("trendMetricB"), "results"),
    trendGranularity: valueOrDefault(params.get("trendGranularity"), "day"),
    ...(params.get("campaignPage") ? { campaignPage: params.get("campaignPage") } : {}),
    ...(params.get("adSetPage") ? { adSetPage: params.get("adSetPage") } : {}),
    ...(params.get("adPage") ? { adPage: params.get("adPage") } : {}),
    ...(params.get("audiencePage") ? { audiencePage: params.get("audiencePage") } : {}),
    ...(params.get("sort") ? { sort: params.get("sort") } : {}),
    ...(visibleColumns && visibleColumns.length > 0 ? { visibleColumns } : {}),
  });
}

export function advertisingReportViewConfigToSearchParams(
  config: AdvertisingReportViewConfig,
): URLSearchParams {
  const params = new URLSearchParams();
  const entries = Object.entries(config) as [keyof AdvertisingReportViewConfig, unknown][];
  for (const [key, value] of entries) {
    if (key === "surface" || key === "version") continue;
    if (key === "visibleColumns" && Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(","));
      continue;
    }
    if (typeof value === "string" && value.length > 0) params.set(key, value);
  }
  return params;
}

function valueOrDefault(value: string | null, fallback: string) {
  return value ?? fallback;
}
