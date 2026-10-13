import type { AdvertisingFact } from "./reporting-service";

export type AdvertisingMetricTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
};

export type AdvertisingDailySpend = { date: string; spend: number };

export type AdvertisingCampaignSummary = AdvertisingMetricTotals & {
  campaignId: string;
  adCount: number;
};

export type AdvertisingReportView = {
  dailySpend: AdvertisingDailySpend[];
  campaigns: AdvertisingCampaignSummary[];
  adCount: number;
};

function totals(rows: readonly AdvertisingFact[]): AdvertisingMetricTotals {
  const spend = rows.reduce((sum, row) => sum + row.spend, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  return {
    spend,
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : null,
    cpc: clicks > 0 ? spend / clicks : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
  };
}

/** Build display rollups only from the already-authorized fact projection. */
export function buildAdvertisingReportView(
  rows: readonly AdvertisingFact[],
): AdvertisingReportView {
  const daily = new Map<string, AdvertisingFact[]>();
  const campaignRows = new Map<string, AdvertisingFact[]>();
  const adIds = new Set<string>();
  for (const row of rows) {
    daily.set(row.date, [...(daily.get(row.date) ?? []), row]);
    campaignRows.set(row.campaignId, [...(campaignRows.get(row.campaignId) ?? []), row]);
    if (row.adId) adIds.add(row.adId);
  }
  const campaigns = [...campaignRows.entries()]
    .map(([campaignId, campaignFacts]) => ({
      campaignId,
      ...totals(campaignFacts),
      adCount: new Set(campaignFacts.flatMap((row) => (row.adId ? [row.adId] : []))).size,
    }))
    .sort(
      (left, right) => right.spend - left.spend || left.campaignId.localeCompare(right.campaignId),
    );
  return {
    dailySpend: [...daily.entries()]
      .map(([date, facts]) => ({ date, spend: totals(facts).spend }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    campaigns,
    adCount: adIds.size,
  };
}
