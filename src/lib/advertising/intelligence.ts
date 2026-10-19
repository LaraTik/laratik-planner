import type { AdvertisingFact } from "./reporting-service";
import type { AdvertisingAdSummary, AdvertisingCampaignSummary } from "./reporting-view";

const MIN_COMPARISON_IMPRESSIONS = 100;
const STRONG_SAMPLE_IMPRESSIONS = 1_000;
const ON_TRACK_LOW = 0.9;
const ON_TRACK_HIGH = 1.1;
const EFFECTIVE_SCORE = 1.15;
const UNDERPERFORMING_SCORE = 0.85;
const FATIGUE_CHANGE_THRESHOLD = 0.2;

export type CampaignPerformanceStatus =
  "effective" | "underperforming" | "monitor" | "insufficient_data";

export type CampaignPerformanceReason =
  | "strong_efficiency"
  | "weak_efficiency"
  | "mixed_efficiency"
  | "insufficient_sample"
  | "limited_comparison";
export type CampaignPerformanceConfidence = "strong" | "minimum" | "insufficient";

export type CampaignPerformanceInsight = {
  campaignId: string;
  name: string | null | undefined;
  status: CampaignPerformanceStatus;
  reason: CampaignPerformanceReason;
  score: number | null;
  sampleImpressions: number;
  baselineCtr: number | null;
  baselineCpc: number | null;
  confidence: CampaignPerformanceConfidence;
};

export type BudgetPacingStatus = "over" | "on_track" | "under" | "unavailable";

export type BudgetPacingInsight = {
  campaignId: string;
  name: string | null | undefined;
  budgetType: "daily" | "lifetime" | "none";
  status: BudgetPacingStatus;
  actualSpend: number;
  expectedSpend: number | null;
  paceRatio: number | null;
};

export type CreativeFatigueStatus = "fatiguing" | "stable" | "insufficient_data";

export type CreativeFatigueInsight = {
  adId: string;
  name: string | null | undefined;
  status: CreativeFatigueStatus;
  priorImpressions: number;
  recentImpressions: number;
  ctrChange: number | null;
  cpcChange: number | null;
};

/**
 * Compare campaigns only when the report contains a meaningful peer sample.
 * The score is intentionally explainable: higher CTR and lower CPC improve it.
 * No unavailable provider metric is substituted with an estimate.
 */
export function buildCampaignPerformanceInsights(
  campaigns: readonly AdvertisingCampaignSummary[],
): CampaignPerformanceInsight[] {
  const eligible = campaigns.filter(
    (campaign) =>
      campaign.impressions >= MIN_COMPARISON_IMPRESSIONS &&
      campaign.spend > 0 &&
      campaign.ctr !== null &&
      campaign.cpc !== null &&
      campaign.ctr > 0 &&
      campaign.cpc > 0,
  );
  const medianCtr = median(eligible.map((campaign) => campaign.ctr!));
  const medianCpc = median(eligible.map((campaign) => campaign.cpc!));
  const canCompare = eligible.length >= 2 && medianCtr > 0 && medianCpc > 0;

  return campaigns.map((campaign) => {
    if (campaign.impressions < MIN_COMPARISON_IMPRESSIONS) {
      return {
        campaignId: campaign.campaignId,
        name: campaign.name,
        status: "insufficient_data",
        reason: "insufficient_sample",
        score: null,
        sampleImpressions: campaign.impressions,
        baselineCtr: null,
        baselineCpc: null,
        confidence: "insufficient",
      };
    }
    if (!canCompare || campaign.ctr === null || campaign.cpc === null || campaign.cpc <= 0) {
      return {
        campaignId: campaign.campaignId,
        name: campaign.name,
        status: "monitor",
        reason: "limited_comparison",
        score: null,
        sampleImpressions: campaign.impressions,
        baselineCtr: canCompare ? medianCtr : null,
        baselineCpc: canCompare ? medianCpc : null,
        confidence: campaign.impressions >= STRONG_SAMPLE_IMPRESSIONS ? "strong" : "minimum",
      };
    }

    const score = (campaign.ctr / medianCtr + medianCpc / campaign.cpc) / 2;
    const status: CampaignPerformanceStatus =
      score >= EFFECTIVE_SCORE
        ? "effective"
        : score <= UNDERPERFORMING_SCORE
          ? "underperforming"
          : "monitor";
    return {
      campaignId: campaign.campaignId,
      name: campaign.name,
      status,
      reason:
        status === "effective"
          ? "strong_efficiency"
          : status === "underperforming"
            ? "weak_efficiency"
            : "mixed_efficiency",
      score,
      sampleImpressions: campaign.impressions,
      baselineCtr: medianCtr,
      baselineCpc: medianCpc,
      confidence: campaign.impressions >= STRONG_SAMPLE_IMPRESSIONS ? "strong" : "minimum",
    };
  });
}

/**
 * Daily budgets are comparable with observed spend over the selected period.
 * Lifetime budgets deliberately remain unavailable until a provider campaign
 * schedule is persisted; displaying a guessed pace would mislead operators.
 */
export function buildBudgetPacingInsights(
  campaigns: readonly AdvertisingCampaignSummary[],
  since: string,
  until: string,
): BudgetPacingInsight[] {
  const days = inclusiveDays(since, until);
  return campaigns.map((campaign) => {
    const dailyBudget = parseBudget(campaign.dailyBudget);
    const lifetimeBudget = parseBudget(campaign.lifetimeBudget);
    if (dailyBudget !== null && days !== null) {
      const expectedSpend = dailyBudget * days;
      const paceRatio = expectedSpend > 0 ? campaign.spend / expectedSpend : null;
      return {
        campaignId: campaign.campaignId,
        name: campaign.name,
        budgetType: "daily",
        status: paceStatus(paceRatio),
        actualSpend: campaign.spend,
        expectedSpend,
        paceRatio,
      };
    }
    return {
      campaignId: campaign.campaignId,
      name: campaign.name,
      budgetType: lifetimeBudget !== null ? "lifetime" : "none",
      status: "unavailable",
      actualSpend: campaign.spend,
      expectedSpend: null,
      paceRatio: null,
    };
  });
}

/**
 * Detect fatigue from the same authorized ad-day facts used by reporting.
 * Both halves need a minimum impression sample; otherwise the UI says that
 * the signal is insufficient instead of turning noise into a recommendation.
 */
export function buildCreativeFatigueInsights(
  rows: readonly AdvertisingFact[],
  ads: readonly AdvertisingAdSummary[],
  since: string,
  until: string,
): CreativeFatigueInsight[] {
  const midpoint = midpointDate(since, until);
  return ads.map((ad) => {
    const adRows = rows.filter((row) => row.adId === ad.adId);
    const prior = aggregate(adRows.filter((row) => row.date < midpoint));
    const recent = aggregate(adRows.filter((row) => row.date >= midpoint));
    if (
      prior.impressions < MIN_COMPARISON_IMPRESSIONS ||
      recent.impressions < MIN_COMPARISON_IMPRESSIONS
    ) {
      return {
        adId: ad.adId,
        name: ad.name,
        status: "insufficient_data",
        priorImpressions: prior.impressions,
        recentImpressions: recent.impressions,
        ctrChange: null,
        cpcChange: null,
      };
    }
    const ctrChange = relativeChange(prior.ctr, recent.ctr);
    const cpcChange = relativeChange(prior.cpc, recent.cpc);
    const status =
      (ctrChange !== null && ctrChange <= -FATIGUE_CHANGE_THRESHOLD) ||
      (cpcChange !== null && cpcChange >= FATIGUE_CHANGE_THRESHOLD)
        ? "fatiguing"
        : "stable";
    return {
      adId: ad.adId,
      name: ad.name,
      status,
      priorImpressions: prior.impressions,
      recentImpressions: recent.impressions,
      ctrChange,
      cpcChange,
    };
  });
}

function aggregate(rows: readonly AdvertisingFact[]) {
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const spend = rows.reduce((sum, row) => sum + row.spend, 0);
  return {
    impressions,
    ctr: impressions > 0 ? clicks / impressions : null,
    cpc: clicks > 0 ? spend / clicks : null,
  };
}

function relativeChange(prior: number | null, recent: number | null): number | null {
  return prior !== null && recent !== null && prior > 0 ? (recent - prior) / prior : null;
}

function parseBudget(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function paceStatus(ratio: number | null): BudgetPacingStatus {
  if (ratio === null) return "unavailable";
  if (ratio > ON_TRACK_HIGH) return "over";
  if (ratio < ON_TRACK_LOW) return "under";
  return "on_track";
}

function inclusiveDays(since: string, until: string): number | null {
  const start = Date.parse(`${since}T00:00:00Z`);
  const end = Date.parse(`${until}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.floor((end - start) / 86_400_000) + 1;
}

function midpointDate(since: string, until: string): string {
  const start = Date.parse(`${since}T00:00:00Z`);
  const end = Date.parse(`${until}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return since;
  return new Date(start + Math.floor((end - start) / 2)).toISOString().slice(0, 10);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}
