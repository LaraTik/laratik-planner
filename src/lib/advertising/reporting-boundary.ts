import { Buffer } from "node:buffer";
import {
  advertisingReportCacheKey,
  buildScopedAdvertisingReport,
  type AdvertisingFact,
  type AdvertisingReportingScope,
  type ScopedAdvertisingReport,
} from "./reporting-service";
import type { DataHealthSummary } from "./reporting-health";
import { ADVERTISING_METRIC_DEFINITIONS } from "./reporting-metrics";
import { rowsToXlsx } from "@/lib/exports/xlsx";

export type AdvertisingReportSurface =
  | "workspace_dashboard"
  | "tenant_dashboard"
  | "campaign_detail"
  | "ad_detail"
  | "aggregate"
  | "csv_export"
  | "xlsx_export"
  | "pdf_export"
  | "background_report"
  | "ai_context"
  | "financial_dashboard";

type SurfaceOperation = "report_read" | "financial_read" | "export" | "ai_context";

const SURFACE_OPERATIONS: Record<AdvertisingReportSurface, SurfaceOperation> = {
  workspace_dashboard: "report_read",
  tenant_dashboard: "report_read",
  campaign_detail: "report_read",
  ad_detail: "report_read",
  aggregate: "report_read",
  csv_export: "export",
  xlsx_export: "export",
  pdf_export: "export",
  background_report: "report_read",
  ai_context: "ai_context",
  financial_dashboard: "financial_read",
};

export type ScopedAdvertisingSurfaceReport = ScopedAdvertisingReport & {
  readonly surface: AdvertisingReportSurface;
  readonly operation: SurfaceOperation;
  readonly cacheKey: string | null;
};

/**
 * Shared projection boundary for every advertising read surface. Callers pass
 * synthetic or canonical facts, but never pre-aggregate them: authorization
 * happens inside `buildScopedAdvertisingReport` before rows enter totals.
 */
export function buildAdvertisingSurfaceReport(args: {
  surface: AdvertisingReportSurface;
  scope: AdvertisingReportingScope;
  facts: readonly AdvertisingFact[];
  cache?:
    | {
        agencyId: string;
        workspaceId: string;
        since: string;
        until: string;
        grantRevision: string | number;
      }
    | undefined;
  now?: string | undefined;
}): ScopedAdvertisingSurfaceReport {
  const operation = SURFACE_OPERATIONS[args.surface];
  const report = buildScopedAdvertisingReport(args.scope, args.facts, {
    operation,
    ...(args.now ? { now: args.now } : {}),
  });
  return {
    ...report,
    surface: args.surface,
    operation,
    cacheKey:
      report.authorized && args.cache && args.scope.account
        ? advertisingReportCacheKey({ ...args.cache, accountId: args.scope.account.id })
        : null,
  };
}

export type AdvertisingCsvExportMetadata = {
  readonly accountId: string;
  readonly accountName: string;
  readonly since: string;
  readonly until: string;
  readonly timezone: string | null;
  readonly currency: string | null;
  readonly filters: Readonly<Record<string, string | null>>;
  readonly dataHealth: DataHealthSummary;
  readonly attributionSettings: string;
  readonly localTagsByEntity?: Readonly<Record<string, readonly string[]>>;
};

/** Export serializers accept only an already-authorized projection. */
export function advertisingCsvFromReport(
  report: ScopedAdvertisingSurfaceReport,
  metadata?: AdvertisingCsvExportMetadata,
): string {
  if (
    !report.authorized ||
    (report.operation !== "export" && report.surface !== "background_report")
  )
    return "";
  const lines = metadata
    ? [
        "# LaraTik Advertising Reporting 2.0 export",
        `# account_id,${csvCell(metadata.accountId)}`,
        `# account_name,${csvCell(metadata.accountName)}`,
        `# date_range,${csvCell(`${metadata.since} to ${metadata.until}`)}`,
        `# timezone,${csvCell(metadata.timezone ?? "Not available")}`,
        `# currency,${csvCell(metadata.currency ?? "Not available")}`,
        `# data_health_state,${csvCell(metadata.dataHealth.state)}`,
        `# data_health_coverage,${csvCell(metadata.dataHealth.coverage)}`,
        `# data_health_issues,${csvCell(metadata.dataHealth.issues.join("; ") || "none")}`,
        `# attribution_settings,${csvCell(metadata.attributionSettings)}`,
        `# metric_definitions,${csvCell(
          ADVERTISING_METRIC_DEFINITIONS.map(
            (definition) => `${definition.label} (${definition.key}): ${definition.formula}`,
          ).join(" | "),
        )}`,
        ...Object.entries(metadata.filters).map(
          ([key, value]) => `# filter_${key},${csvCell(value ?? "All")}`,
        ),
        "",
        "campaign_id,ad_set_id,ad_id,date,spend,impressions,clicks,campaign_tags,ad_tags",
      ]
    : ["campaign_id,ad_set_id,ad_id,date,spend,impressions,clicks,campaign_tags,ad_tags"];
  for (const row of report.rows) {
    lines.push(
      [
        row.campaignId,
        row.adSetId ?? "",
        row.adId ?? "",
        row.date,
        row.spend,
        row.impressions,
        row.clicks,
        metadata?.localTagsByEntity?.[`campaign:${row.campaignId}`]?.join("; ") ?? "",
        row.adId ? (metadata?.localTagsByEntity?.[`ad:${row.adId}`]?.join("; ") ?? "") : "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}

/** XLSX export uses the same authorized rows and metadata as CSV. */
export function advertisingXlsxFromReport(
  report: ScopedAdvertisingSurfaceReport,
  metadata: AdvertisingCsvExportMetadata,
): Buffer {
  if (
    !report.authorized ||
    (report.operation !== "export" && report.surface !== "background_report")
  ) {
    return Buffer.alloc(0);
  }
  const rows: (string | number | null)[][] = [
    ["LaraTik Advertising Reporting 2.0 export"],
    ["Account ID", metadata.accountId],
    ["Account name", metadata.accountName],
    ["Date range", `${metadata.since} to ${metadata.until}`],
    ["Timezone", metadata.timezone ?? "Not available"],
    ["Currency", metadata.currency ?? "Not available"],
    ["Data health", metadata.dataHealth.state],
    ["Coverage", metadata.dataHealth.coverage],
    ["Data health issues", metadata.dataHealth.issues.join("; ") || "none"],
    ["Attribution settings", metadata.attributionSettings],
    [
      "Metric definitions",
      ADVERTISING_METRIC_DEFINITIONS.map(
        (definition) => `${definition.label} (${definition.key}): ${definition.formula}`,
      ).join(" | "),
    ],
    ...Object.entries(metadata.filters).map(([key, value]) => [`Filter: ${key}`, value ?? "All"]),
    [],
    [
      "campaign_id",
      "ad_set_id",
      "ad_id",
      "date",
      "spend",
      "impressions",
      "clicks",
      "campaign_tags",
      "ad_tags",
    ],
  ];
  rows.push(
    ...report.rows.map((row) => [
      row.campaignId,
      row.adSetId ?? "",
      row.adId ?? "",
      row.date,
      row.spend,
      row.impressions,
      row.clicks,
      metadata.localTagsByEntity?.[`campaign:${row.campaignId}`]?.join("; ") ?? "",
      row.adId ? (metadata.localTagsByEntity?.[`ad:${row.adId}`]?.join("; ") ?? "") : "",
    ]),
  );
  return rowsToXlsx(rows);
}

export function advertisingAiContextFromReport(report: ScopedAdvertisingSurfaceReport) {
  if (!report.authorized || report.operation !== "ai_context") return null;
  return {
    surface: report.surface,
    totals: report.totals,
    rows: report.rows.map((row) => ({
      campaignId: row.campaignId,
      adSetId: row.adSetId ?? null,
      adId: row.adId ?? null,
      date: row.date,
      spend: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
    })),
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
