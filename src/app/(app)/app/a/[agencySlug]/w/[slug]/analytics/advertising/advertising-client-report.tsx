import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/i18n/format-locale";
import {
  AdvertisingRecommendations,
  type AdvertisingRecommendationsLabels,
} from "./advertising-recommendations";
import type {
  BudgetPacingInsight,
  CampaignPerformanceInsight,
  CreativeFatigueInsight,
} from "@/lib/advertising/intelligence";
import type {
  AdvertisingCampaignSummary,
  AdvertisingPromotedPostSummary,
} from "@/lib/advertising/reporting-view";

export type AdvertisingClientReportLabels = {
  backToAnalytics: string;
  reportBadge: string;
  title: string;
  description: string;
  period: string;
  source: string;
  dataStatus: string;
  partial: string;
  complete: string;
  summary: string;
  spend: string;
  impressions: string;
  clicks: string;
  results: string;
  ctr: string;
  cpc: string;
  campaignScorecard: string;
  campaign: string;
  status: string;
  effective: string;
  underperforming: string;
  monitor: string;
  insufficient: string;
  budgetPacing: string;
  actual: string;
  expected: string;
  over: string;
  onTrack: string;
  under: string;
  unavailable: string;
  creativeHealth: string;
  fatiguing: string;
  stable: string;
  needsData: string;
  promotedContent: string;
  promotedContentDescription: string;
  post: string;
  paidImpressions: string;
  organicViews: string;
  combinedViews: string;
  notAvailable: string;
  aiRecommendations: AdvertisingRecommendationsLabels;
};

export function AdvertisingClientReport({
  accountName,
  accountId,
  workspaceId,
  currency,
  since,
  until,
  freshness,
  partial,
  totals,
  campaigns,
  performance,
  pacing,
  fatigue,
  promotedPosts,
  organicByPostId,
  backHref,
  labels,
  locale,
}: {
  accountName: string;
  accountId: string;
  workspaceId: string;
  currency: string | null;
  since: string;
  until: string;
  freshness: string;
  partial: boolean;
  totals: {
    spend: number;
    impressions: number;
    clicks: number;
    results: number | null;
    ctr: number | null;
    cpc: number | null;
  };
  campaigns: readonly AdvertisingCampaignSummary[];
  performance: readonly CampaignPerformanceInsight[];
  pacing: readonly BudgetPacingInsight[];
  fatigue: readonly CreativeFatigueInsight[];
  promotedPosts: readonly AdvertisingPromotedPostSummary[];
  organicByPostId: ReadonlyMap<string, number | null>;
  backHref: string;
  labels: AdvertisingClientReportLabels;
  locale: string;
}) {
  const performanceById = new Map(performance.map((item) => [item.campaignId, item]));
  const fatiguingCount = fatigue.filter((item) => item.status === "fatiguing").length;

  return (
    <article className="mx-auto max-w-6xl space-y-6" data-testid="advertising-client-report">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              <FileText className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {labels.reportBadge}
            </Badge>
            <Badge variant={partial ? "warning" : "success"}>
              {labels.dataStatus}: {partial ? labels.partial : labels.complete}
            </Badge>
          </div>
          <h1 className="text-display text-fg-primary mt-3 font-semibold">{labels.title}</h1>
          <p className="text-body text-fg-secondary mt-2 max-w-3xl">{labels.description}</p>
        </div>
        <Link
          href={backHref}
          className="border-border text-label text-fg-primary focus-visible:ring-focus-ring inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border px-4 font-semibold focus:outline-none focus-visible:ring-2"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {labels.backToAnalytics}
        </Link>
      </div>

      <Card padding="md">
        <div className="text-label grid gap-3 sm:grid-cols-3">
          <ReportMeta label={labels.source} value={accountName} />
          <ReportMeta label={labels.period} value={`${since} – ${until}`} dir="ltr" />
          <ReportMeta label={labels.dataStatus} value={freshness} />
        </div>
      </Card>

      <section aria-labelledby="advertising-client-report-summary" className="space-y-3">
        <h2
          id="advertising-client-report-summary"
          className="text-title-card text-fg-primary font-semibold"
        >
          {labels.summary}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <ReportMetric
            label={labels.spend}
            value={money(totals.spend, currency, locale, labels.notAvailable)}
          />
          <ReportMetric label={labels.impressions} value={number(totals.impressions, locale)} />
          <ReportMetric label={labels.clicks} value={number(totals.clicks, locale)} />
          <ReportMetric
            label={labels.results}
            value={totals.results === null ? labels.notAvailable : number(totals.results, locale)}
          />
          <ReportMetric
            label={labels.ctr}
            value={
              totals.ctr === null
                ? labels.notAvailable
                : formatPercent(totals.ctr, locale as "en" | "ar")
            }
          />
          <ReportMetric
            label={labels.cpc}
            value={
              totals.cpc === null
                ? labels.notAvailable
                : money(totals.cpc, currency, locale, labels.notAvailable)
            }
          />
        </div>
      </section>

      <Card padding="none" className="overflow-hidden">
        <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5">
          <CardTitle>{labels.campaignScorecard}</CardTitle>
        </CardHeader>
        <div
          className="overflow-x-auto"
          role="region"
          tabIndex={0}
          aria-label={labels.campaignScorecard}
        >
          <table className="text-body w-full min-w-[820px] text-start">
            <caption className="sr-only">{labels.campaignScorecard}</caption>
            <thead className="bg-surface-subtle text-label text-fg-muted">
              <tr>
                <th className="px-4 py-3 text-start font-semibold" scope="col">
                  {labels.campaign}
                </th>
                <th className="px-4 py-3 text-end font-semibold" scope="col">
                  {labels.spend}
                </th>
                <th className="px-4 py-3 text-end font-semibold" scope="col">
                  {labels.impressions}
                </th>
                <th className="px-4 py-3 text-end font-semibold" scope="col">
                  {labels.ctr}
                </th>
                <th className="px-4 py-3 text-end font-semibold" scope="col">
                  {labels.cpc}
                </th>
                <th className="px-4 py-3 text-start font-semibold" scope="col">
                  {labels.status}
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {campaigns.map((campaign) => {
                const signal = performanceById.get(campaign.campaignId);
                return (
                  <tr key={campaign.campaignId}>
                    <th className="px-4 py-3 text-start font-semibold" scope="row">
                      <span className="block">{campaign.name ?? campaign.campaignId}</span>
                      <bdi className="text-label text-fg-muted" dir="ltr">
                        {campaign.campaignId}
                      </bdi>
                    </th>
                    <td className="px-4 py-3 text-end">
                      {money(campaign.spend, currency, locale, labels.notAvailable)}
                    </td>
                    <td className="px-4 py-3 text-end">{number(campaign.impressions, locale)}</td>
                    <td className="px-4 py-3 text-end">
                      {campaign.ctr === null
                        ? labels.notAvailable
                        : formatPercent(campaign.ctr, locale as "en" | "ar")}
                    </td>
                    <td className="px-4 py-3 text-end">
                      {campaign.cpc === null
                        ? labels.notAvailable
                        : money(campaign.cpc, currency, locale, labels.notAvailable)}
                    </td>
                    <td className="px-4 py-3 text-start">
                      <StatusBadge status={signal?.status ?? "monitor"} labels={labels} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card padding="md">
          <CardTitle>{labels.budgetPacing}</CardTitle>
          <div className="mt-3 space-y-3">
            {pacing.map((item) => {
              const campaign = campaigns.find(
                (candidate) => candidate.campaignId === item.campaignId,
              );
              return (
                <div
                  key={item.campaignId}
                  className="text-label flex items-center justify-between gap-3"
                >
                  <span className="text-fg-primary min-w-0 truncate">
                    {campaign?.name ?? item.campaignId}
                  </span>
                  <span className="text-fg-muted shrink-0 tabular-nums">
                    {item.expectedSpend === null
                      ? labels.unavailable
                      : `${money(item.actualSpend, currency, locale, labels.notAvailable)} / ${money(item.expectedSpend, currency, locale, labels.notAvailable)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
        <Card padding="md">
          <CardTitle>{labels.creativeHealth}</CardTitle>
          <p className="text-label text-fg-muted mt-1">
            {fatiguingCount} {labels.fatiguing}
          </p>
          <div className="mt-3 space-y-2">
            {fatigue.slice(0, 5).map((item) => (
              <div key={item.adId} className="text-label flex items-center justify-between gap-3">
                <span className="text-fg-primary min-w-0 truncate">{item.name ?? item.adId}</span>
                <Badge variant={item.status === "fatiguing" ? "warning" : "outline"}>
                  {item.status === "fatiguing"
                    ? labels.fatiguing
                    : item.status === "stable"
                      ? labels.stable
                      : labels.needsData}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {promotedPosts.length > 0 ? (
        <Card padding="none" className="overflow-hidden">
          <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5">
            <CardTitle>{labels.promotedContent}</CardTitle>
            <p className="text-label text-fg-muted mt-1">{labels.promotedContentDescription}</p>
          </CardHeader>
          <div
            className="overflow-x-auto"
            role="region"
            tabIndex={0}
            aria-label={labels.promotedContent}
          >
            <table className="text-body w-full min-w-[680px] text-start">
              <caption className="sr-only">{labels.promotedContent}</caption>
              <thead className="bg-surface-subtle text-label text-fg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold" scope="col">
                    {labels.post}
                  </th>
                  <th className="px-4 py-3 text-end font-semibold" scope="col">
                    {labels.paidImpressions}
                  </th>
                  <th className="px-4 py-3 text-end font-semibold" scope="col">
                    {labels.organicViews}
                  </th>
                  <th className="px-4 py-3 text-end font-semibold" scope="col">
                    {labels.combinedViews}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {promotedPosts.map((post) => {
                  const organic = organicByPostId.get(post.postId);
                  const combined =
                    organic === null || organic === undefined ? null : post.impressions + organic;
                  return (
                    <tr key={post.postId}>
                      <th className="px-4 py-3 text-start font-semibold" scope="row">
                        <bdi dir="ltr">{post.postId}</bdi>
                      </th>
                      <td className="px-4 py-3 text-end">{number(post.impressions, locale)}</td>
                      <td className="px-4 py-3 text-end">
                        {organic === null || organic === undefined
                          ? labels.notAvailable
                          : number(organic, locale)}
                      </td>
                      <td className="px-4 py-3 text-end">
                        {combined === null ? labels.notAvailable : number(combined, locale)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <AdvertisingRecommendations
        accountId={accountId}
        workspaceId={workspaceId}
        since={since}
        until={until}
        labels={labels.aiRecommendations}
      />
    </article>
  );
}

function ReportMeta({ label, value, dir }: { label: string; value: string; dir?: "ltr" }) {
  return (
    <div>
      <p className="text-fg-muted">{label}</p>
      <p className="text-fg-primary mt-1 font-semibold" dir={dir}>
        {value}
      </p>
    </div>
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border rounded-[var(--radius-control)] border p-3">
      <p className="text-label text-fg-muted">{label}</p>
      <p className="text-title-card text-fg-primary mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function StatusBadge({
  status,
  labels,
}: {
  status: CampaignPerformanceInsight["status"];
  labels: AdvertisingClientReportLabels;
}) {
  const label =
    status === "effective"
      ? labels.effective
      : status === "underperforming"
        ? labels.underperforming
        : status === "insufficient_data"
          ? labels.insufficient
          : labels.monitor;
  return (
    <Badge
      variant={
        status === "effective" ? "success" : status === "underperforming" ? "warning" : "outline"
      }
    >
      {label}
    </Badge>
  );
}

function number(value: number, locale: string): string {
  return formatNumber(value, locale as "en" | "ar");
}

function money(
  value: number,
  currency: string | null,
  locale: string,
  unavailable: string,
): string {
  return currency ? formatCurrency(value, currency, locale as "en" | "ar") : unavailable;
}
