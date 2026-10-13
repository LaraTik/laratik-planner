import {
  advertisingReportCacheKey,
  buildScopedAdvertisingReport,
  type AdvertisingFact,
  type AdvertisingReportingScope,
  type ScopedAdvertisingReport,
} from "./reporting-service";

export type AdvertisingReportSurface =
  | "workspace_dashboard"
  | "tenant_dashboard"
  | "campaign_detail"
  | "ad_detail"
  | "aggregate"
  | "csv_export"
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

/** Export serializers accept only an already-authorized projection. */
export function advertisingCsvFromReport(report: ScopedAdvertisingSurfaceReport): string {
  if (
    !report.authorized ||
    (report.operation !== "export" && report.surface !== "background_report")
  )
    return "";
  const lines = ["campaign_id,ad_set_id,ad_id,date,spend,impressions,clicks"];
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
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
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
