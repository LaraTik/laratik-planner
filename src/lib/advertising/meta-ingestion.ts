import type { AdvertisingReportContext } from "./types";
import type { AdvertisingSpendObservationInput } from "./ingestion-service";

export type NormalizedMetaAdInsights = {
  readonly observations: readonly AdvertisingSpendObservationInput[];
  readonly skippedRows: number;
  readonly partial: boolean;
};

export type NormalizedMetaAccountInsights = {
  readonly rows: readonly { reportDate: string; spend: string }[];
  readonly skippedRows: number;
  readonly partial: boolean;
};

/**
 * Convert only explicit Meta ad-level rows into canonical provider facts.
 * Missing identifiers or metrics are skipped and surfaced as partial data;
 * this function never allocates account totals to an inferred campaign/ad.
 */
export function normalizeMetaAdInsights(
  value: unknown,
  context: AdvertisingReportContext,
): NormalizedMetaAdInsights {
  if (context.grain !== "ad_day") throw new Error("meta_ad_insights_grain_required");
  if (context.breakdowns.length > 0) throw new Error("meta_ad_insights_breakdowns_not_canonical");
  const rows = collectionRows(value);
  const observations: AdvertisingSpendObservationInput[] = [];
  let skippedRows = 0;
  for (const row of rows) {
    const externalAdId = stringValue(row.ad_id);
    const reportDate = stringValue(row.date_start);
    const spend = decimalValue(row.spend);
    const impressions = countValue(row.impressions);
    const clicks = countValue(row.clicks);
    if (!externalAdId || !reportDate || spend === null || impressions === null || clicks === null) {
      skippedRows += 1;
      continue;
    }
    observations.push({
      externalAdId,
      externalCampaignId: stringValue(row.campaign_id),
      externalAdSetId: stringValue(row.adset_id),
      reportDate,
      currency: context.currency,
      spend,
      impressions,
      clicks,
      attributionWindow: context.attributionWindow ?? "account",
      actionReportTime: context.actionReportTime ?? "impression",
    });
  }
  return { observations, skippedRows, partial: skippedRows > 0 || rows.length === 0 };
}

export function normalizeMetaAccountInsights(value: unknown): NormalizedMetaAccountInsights {
  const rows = collectionRows(value);
  const normalized: Array<{ reportDate: string; spend: string }> = [];
  let skippedRows = 0;
  for (const row of rows) {
    const reportDate = stringValue(row.date_start);
    const spend = decimalValue(row.spend);
    if (!reportDate || spend === null) {
      skippedRows += 1;
      continue;
    }
    normalized.push({ reportDate, spend });
  }
  return { rows: normalized, skippedRows, partial: skippedRows > 0 || rows.length === 0 };
}

export function sumSpendValues(values: readonly string[]): string {
  const micros = values.reduce((sum, value) => sum + parseMicros(value), 0n);
  return formatMicros(micros);
}

function collectionRows(value: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (isRecord(value) && Array.isArray(value.data)) return value.data.filter(isRecord);
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function decimalValue(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0)
    return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  if (typeof value === "string" && /^\d+(?:\.\d{1,6})?$/.test(value)) return value;
  return null;
}

function countValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function parseMicros(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole ?? "0") * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

function formatMicros(value: bigint): string {
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole.toString()}${fraction ? `.${fraction}` : ""}`;
}
