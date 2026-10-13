import type { AdvertisingFact } from "./reporting-service";

type AdvertisingReportObject = {
  objectType: "campaign" | "adset" | "ad" | "creative";
  externalObjectId: string;
  name: string | null;
  status: string | null;
  objective: string | null;
  dailyBudget: string | null;
  lifetimeBudget: string | null;
  promotedPostId: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AdvertisingMetricTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  results: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
};

export type AdvertisingDailySpend = { date: string; spend: number };

export type AdvertisingCampaignSummary = AdvertisingMetricTotals & {
  campaignId: string;
  adCount: number;
  name?: string | null;
  status?: string | null;
  objective?: string | null;
  dailyBudget?: string | null;
  lifetimeBudget?: string | null;
};

export type AdvertisingReportView = {
  dailySpend: AdvertisingDailySpend[];
  campaigns: AdvertisingCampaignSummary[];
  adCount: number;
  promotedPosts?: AdvertisingPromotedPostSummary[];
};

export type AdvertisingPromotedPostSummary = AdvertisingMetricTotals & {
  postId: string;
  adCount: number;
};

function totals(rows: readonly AdvertisingFact[]): AdvertisingMetricTotals {
  const spend = rows.reduce((sum, row) => sum + row.spend, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const resultRows = rows.filter((row) => row.results !== null && row.results !== undefined);
  return {
    spend,
    impressions,
    clicks,
    results:
      resultRows.length === rows.length && rows.length > 0
        ? resultRows.reduce((sum, row) => sum + (row.results ?? 0), 0)
        : null,
    ctr: impressions > 0 ? clicks / impressions : null,
    cpc: clicks > 0 ? spend / clicks : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
  };
}

/** Build display rollups only from the already-authorized fact projection. */
export function buildAdvertisingReportView(
  rows: readonly AdvertisingFact[],
  objects: readonly AdvertisingReportObject[] = [],
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
    .map(([campaignId, campaignFacts]) => {
      const object = objects.find(
        (candidate) =>
          candidate.objectType === "campaign" && candidate.externalObjectId === campaignId,
      );
      return {
        campaignId,
        ...totals(campaignFacts),
        adCount: new Set(campaignFacts.flatMap((row) => (row.adId ? [row.adId] : []))).size,
        ...(object
          ? {
              name: object.name,
              status: object.status,
              objective: object.objective,
              dailyBudget: object.dailyBudget,
              lifetimeBudget: object.lifetimeBudget,
            }
          : {}),
      };
    })
    .sort(
      (left, right) => right.spend - left.spend || left.campaignId.localeCompare(right.campaignId),
    );
  const promotedPosts = new Map<string, AdvertisingFact[]>();
  const adToPost = new Map(
    objects
      .filter((object) => object.objectType === "ad" && object.promotedPostId)
      .map((object) => [object.externalObjectId, object.promotedPostId!]),
  );
  for (const row of rows) {
    const postId = row.adId ? adToPost.get(row.adId) : undefined;
    if (postId) promotedPosts.set(postId, [...(promotedPosts.get(postId) ?? []), row]);
  }
  return {
    dailySpend: [...daily.entries()]
      .map(([date, facts]) => ({ date, spend: totals(facts).spend }))
      .sort((left, right) => left.date.localeCompare(right.date)),
    campaigns,
    adCount: adIds.size,
    ...(objects.length > 0
      ? {
          promotedPosts: [...promotedPosts.entries()]
            .map(([postId, postFacts]) => ({
              postId,
              ...totals(postFacts),
              adCount: new Set(postFacts.flatMap((row) => (row.adId ? [row.adId] : []))).size,
            }))
            .sort(
              (left, right) => right.spend - left.spend || left.postId.localeCompare(right.postId),
            ),
        }
      : {}),
  };
}
