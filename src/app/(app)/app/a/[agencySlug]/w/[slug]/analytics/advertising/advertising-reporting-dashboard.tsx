"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  CircleDollarSign,
  Database,
  Eye,
  Gauge,
  Percent,
  RefreshCw,
  Target,
  TriangleAlert,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ReportingKpiCard } from "@/components/reporting/reporting-kpi-card";
import type {
  AdvertisingMetricKey,
  AdvertisingMetricSnapshot,
  MetricAvailability,
  MetricStatus,
} from "@/lib/advertising/reporting-metrics";
import type { AdvertisingSupplementaryMetricKey } from "@/lib/advertising/reporting-view-config";
import type { ComparisonSummary } from "@/lib/advertising/reporting-comparison";
import type { DataHealthSummary } from "@/lib/advertising/reporting-health";
import type { AdvertisingCampaignSummary } from "@/lib/advertising/reporting-view";
import type {
  BudgetPacingInsight,
  CampaignPerformanceConfidence,
  CampaignPerformanceInsight,
  CreativeFatigueInsight,
} from "@/lib/advertising/intelligence";
import type {
  AdvertisingTrendPoint,
  TrendGranularity,
  TrendMetricKey,
} from "@/lib/advertising/reporting-trend";
import {
  advertisingSignalFeedbackKey,
  type AdvertisingSignalEntityType,
  type AdvertisingSignalFeedbackState,
  type AdvertisingSignalFeedbackView,
} from "@/lib/advertising/signal-feedback";

export type AdvertisingReportingDashboardLabels = {
  dataHealth: string;
  synced: string;
  timezone: string;
  coverage: string;
  retry: string;
  details: string;
  close: string;
  detailsTitle: string;
  detailsDescription: string;
  lastSuccessfulSync: string;
  currency: string;
  healthState: string;
  freshnessLabel: string;
  syncStatus: string;
  issues: string;
  noIssues: string;
  metricStatus: string;
  source: string;
  formula: string;
  denominator: string;
  attributionWindow: string;
  notSet: string;
  statusEstimated: string;
  issueNoSuccessfulSync: string;
  issuePartialCoverage: string;
  issueSyncRunning: string;
  issueSyncFailed: string;
  issueSyncDeadLetter: string;
  issueStaleData: string;
  primaryMetrics: string;
  supplementaryMetric: string;
  supplementaryMetricDescription: string;
  selectSupplementaryMetric: string;
  metricImpressions: string;
  metricAllClicks: string;
  metricLinkClicks: string;
  metricOutboundClicks: string;
  metricLandingPageViews: string;
  metricCtrAll: string;
  metricCpcAll: string;
  metricCpcLink: string;
  metricCpm: string;
  comparison: string;
  noComparison: string;
  performanceTrend: string;
  performanceTrendDescription: string;
  showTable: string;
  hideTable: string;
  objectiveMix: string;
  objectiveMixDescription: string;
  actionCenter: string;
  actionCenterDescription: string;
  budgetPacing: string;
  creativeHealth: string;
  audienceOpportunity: string;
  noBudgetData: string;
  noFatigueData: string;
  markReviewed: string;
  dismiss: string;
  snooze: string;
  reopen: string;
  feedbackReason: string;
  selectReason: string;
  reasonNotRelevant: string;
  reasonAlreadyHandled: string;
  reasonDataIncomplete: string;
  saveFeedback: string;
  feedbackSaved: string;
  feedbackError: string;
  reviewed: string;
  dismissed: string;
  snoozed: string;
  review: string;
  campaignExplorer: string;
  campaignExplorerDescription: string;
  audienceSnapshot: string;
  audienceSnapshotDescription: string;
  noAudienceData: string;
  available: string;
  unavailable: string;
  partial: string;
  complete: string;
  delayed: string;
  definition: string;
  noSignals: string;
  sample: string;
  evidence: string;
  baseline: string;
  period: string;
  confidence: string;
  confidenceGuarded: string;
  confidenceLimited: string;
  reviewEvidence: string;
  metricSpend: string;
  metricResults: string;
  resultDefinition: string;
  metricCostPerResult: string;
  metricReach: string;
  metricCtr: string;
  metricFrequency: string;
  deltaImproved: string;
  deltaDeclined: string;
  deltaUnchanged: string;
  unknownObjective: string;
  trendSpend: string;
  trendImpressions: string;
  trendClicks: string;
  trendResults: string;
  trendGranularity: string;
  trendDay: string;
  trendWeek: string;
  trendMonth: string;
  comparisonTrace: string;
  campaign: string;
  objective: string;
  status: string;
  date: string;
};
export function AdvertisingReportingDashboard(props: {
  accountId: string;
  workspaceSlug: string;
  accountName: string;
  currency: string;
  locale: string;
  timezone: string;
  freshness: string;
  syncStatus: string;
  partial: boolean;
  dataHealth: DataHealthSummary;
  lastSync: string | null;
  since: string;
  until: string;
  metrics: AdvertisingMetricSnapshot;
  supplementaryMetric: AdvertisingSupplementaryMetricKey;
  comparison: ComparisonSummary | null;
  statuses: readonly MetricStatus[];
  campaigns: readonly AdvertisingCampaignSummary[];
  insights: readonly CampaignPerformanceInsight[];
  pacing: readonly BudgetPacingInsight[];
  fatigue: readonly CreativeFatigueInsight[];
  dailyMetrics: readonly AdvertisingTrendPoint[];
  comparisonDailyMetrics: readonly AdvertisingTrendPoint[];
  comparisonComparable: boolean;
  trendGranularity: TrendGranularity;
  trendMetricA: TrendMetricKey;
  trendMetricB: TrendMetricKey;
  audienceCount: number;
  campaignsHref: string;
  creativesHref: string;
  audienceHref: string;
  labels: AdvertisingReportingDashboardLabels;
}) {
  const { labels } = props;
  const router = useRouter();
  const [metricA, setMetricA] = useState<TrendMetricKey>(props.trendMetricA);
  const [metricB, setMetricB] = useState<TrendMetricKey>(props.trendMetricB);
  const [granularity, setGranularity] = useState<TrendGranularity>(props.trendGranularity);
  const [supplementaryMetric, setSupplementaryMetric] = useState<AdvertisingSupplementaryMetricKey>(
    props.supplementaryMetric,
  );
  const [tableOpen, setTableOpen] = useState(false);
  const updateTrendSetting = (name: string, value: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set(name, value);
    router.push(`${window.location.pathname}?${params.toString()}`);
  };
  const cards: readonly {
    key: AdvertisingMetricKey;
    label: string;
    value: number | null;
    kind: "money" | "number" | "percent";
    icon: ReactNode;
    status: ReturnType<typeof metricStatus>;
  }[] = [
    {
      key: "spend",
      label: labels.metricSpend,
      value: props.metrics.spend,
      kind: "money",
      status: metricStatus(props.statuses, "spend", labels),
      icon: <CircleDollarSign className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: "results",
      label: resultLabel(labels.metricResults, labels.resultDefinition, props.metrics.resultType),
      value: props.metrics.results,
      kind: "number",
      status: metricStatus(props.statuses, "results", labels),
      icon: <Target className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: "costPerResult",
      label: labels.metricCostPerResult,
      value: props.metrics.costPerResult,
      kind: "money",
      status: metricStatus(props.statuses, "costPerResult", labels),
      icon: <CircleDollarSign className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: "reach",
      label: labels.metricReach,
      value: props.metrics.reach,
      kind: "number",
      status: metricStatus(props.statuses, "reach", labels),
      icon: <Eye className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: "ctrLink",
      label: labels.metricCtr,
      value: props.metrics.ctrLink,
      kind: "percent",
      status: metricStatus(props.statuses, "ctrLink", labels),
      icon: <Percent className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: "frequency",
      label: labels.metricFrequency,
      value: props.metrics.frequency,
      kind: "number",
      status: metricStatus(props.statuses, "frequency", labels),
      icon: <TrendingUp className="h-4 w-4" aria-hidden="true" />,
    },
  ];
  return (
    <div className="reporting-dashboard space-y-4" data-testid="advertising-reporting-dashboard">
      <DataHealth {...props} />
      <section aria-labelledby="advertising-reporting-executive-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="advertising-reporting-executive-title"
              className="text-title-card text-fg-primary font-semibold"
            >
              {labels.primaryMetrics}
            </h2>
            <p className="text-label text-fg-muted mt-1">
              {props.accountName} · {props.since} – {props.until}
            </p>
          </div>
          <span className="text-label text-fg-muted">
            {props.comparison
              ? `${labels.comparison}: ${props.comparison.since} – ${props.comparison.until}`
              : labels.noComparison}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {cards.map((card) => (
            <ReportingKpiCard
              key={card.key}
              label={card.label}
              value={formatMetricValue(
                card.value,
                card.kind,
                props.locale,
                props.currency,
                labels.unavailable,
              )}
              icon={card.icon}
              status={card.status}
              delta={formatDelta(props.comparison?.deltas[card.key]?.percent, props.locale)}
              deltaState={deltaState(props.comparison?.deltas[card.key]?.favorable)}
              deltaLabel={deltaLabel(props.comparison?.deltas[card.key]?.favorable, labels)}
            />
          ))}
        </div>
        <SupplementaryMetricCard
          metric={supplementaryMetric}
          metrics={props.metrics}
          comparison={props.comparison}
          statuses={props.statuses}
          locale={props.locale}
          currency={props.currency}
          labels={labels}
          onChange={(value) => {
            setSupplementaryMetric(value);
            updateTrendSetting("supplementaryMetric", value);
          }}
        />
      </section>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
        <div className="space-y-4">
          <TrendPanel
            {...props}
            metricA={metricA}
            metricB={metricB}
            comparisonDailyMetrics={props.comparisonDailyMetrics}
            comparisonComparable={props.comparisonComparable}
            granularity={granularity}
            setMetricA={(value) => {
              setMetricA(value);
              updateTrendSetting("trendMetricA", value);
            }}
            setMetricB={(value) => {
              setMetricB(value);
              updateTrendSetting("trendMetricB", value);
            }}
            setGranularity={(value) => {
              setGranularity(value);
              updateTrendSetting("trendGranularity", value);
            }}
            tableOpen={tableOpen}
            setTableOpen={setTableOpen}
          />
          <ObjectiveMix {...props} />
        </div>
        <ActionCenter {...props} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        <CampaignExplorer {...props} />
        <Card className="reporting-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="text-primary h-4 w-4" aria-hidden="true" />
              {labels.audienceSnapshot}
            </CardTitle>
            <CardDescription>{labels.audienceSnapshotDescription}</CardDescription>
          </CardHeader>
          <div className="px-5 pb-5">
            <p className="text-fg-primary text-3xl font-semibold tabular-nums">
              {new Intl.NumberFormat(props.locale).format(props.audienceCount)}
            </p>
            <p className="text-label text-fg-muted mt-1">
              {props.audienceCount ? labels.available : labels.noAudienceData}
            </p>
          </div>
        </Card>
      </div>
      <details className="reporting-card border-border bg-surface rounded-[var(--radius-card)] border">
        <summary className="text-body text-fg-primary focus-visible:outline-primary flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 font-semibold focus-visible:outline-2">
          <CircleHelp className="text-primary h-4 w-4" aria-hidden="true" />
          {labels.definition}
          <ChevronRight className="ms-auto h-4 w-4" aria-hidden="true" />
        </summary>
        <div className="border-border grid gap-2 border-t p-4 sm:grid-cols-2 xl:grid-cols-3">
          {props.statuses.map((status) => (
            <div
              key={status.key}
              className="border-border-subtle bg-surface-subtle rounded-[var(--radius-control)] border p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-label text-fg-primary font-semibold">
                  {metricDisplayLabel(status.key, labels)}
                </span>
                <span className="text-label text-fg-muted font-semibold">
                  {metricAvailabilityLabel(status.availability, labels)}
                </span>
              </div>
              <p className="text-label text-fg-muted mt-2">{status.formula}</p>
              <p className="text-label text-fg-secondary mt-1">{status.sourceField}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

type SupplementaryMetricKind = "money" | "number" | "percent";

type SupplementaryMetricDefinition = {
  key: AdvertisingSupplementaryMetricKey;
  label: string;
  kind: SupplementaryMetricKind;
};

function supplementaryMetricDefinitions(
  labels: AdvertisingReportingDashboardLabels,
): readonly SupplementaryMetricDefinition[] {
  return [
    { key: "impressions", label: labels.metricImpressions, kind: "number" },
    { key: "allClicks", label: labels.metricAllClicks, kind: "number" },
    { key: "linkClicks", label: labels.metricLinkClicks, kind: "number" },
    { key: "outboundClicks", label: labels.metricOutboundClicks, kind: "number" },
    { key: "landingPageViews", label: labels.metricLandingPageViews, kind: "number" },
    { key: "ctrAll", label: labels.metricCtrAll, kind: "percent" },
    { key: "cpcAll", label: labels.metricCpcAll, kind: "money" },
    { key: "cpcLink", label: labels.metricCpcLink, kind: "money" },
    { key: "cpm", label: labels.metricCpm, kind: "money" },
  ];
}

function SupplementaryMetricCard({
  metric,
  metrics,
  comparison,
  statuses,
  locale,
  currency,
  labels,
  onChange,
}: {
  metric: AdvertisingSupplementaryMetricKey;
  metrics: AdvertisingMetricSnapshot;
  comparison: ComparisonSummary | null;
  statuses: readonly MetricStatus[];
  locale: string;
  currency: string;
  labels: AdvertisingReportingDashboardLabels;
  onChange: (value: AdvertisingSupplementaryMetricKey) => void;
}) {
  const options = supplementaryMetricDefinitions(labels);
  const definition = options.find((option) => option.key === metric) ?? options[0]!;
  const status = metricStatus(statuses, metric, labels);
  const delta = comparison?.deltas[metric];
  return (
    <div
      className="border-border-subtle bg-surface-subtle flex flex-col gap-3 rounded-[var(--radius-control)] border p-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid="advertising-reporting-supplementary-metric"
    >
      <div className="min-w-0">
        <p className="text-label text-fg-primary font-semibold">{labels.supplementaryMetric}</p>
        <p className="text-label text-fg-muted mt-1">{labels.supplementaryMetricDescription}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
        <label className="sr-only" htmlFor="advertising-supplementary-metric">
          {labels.selectSupplementaryMetric}
        </label>
        <select
          id="advertising-supplementary-metric"
          value={metric}
          onChange={(event) => onChange(event.target.value as AdvertisingSupplementaryMetricKey)}
          className="border-border bg-surface text-label text-fg-primary focus-visible:ring-focus-ring min-h-11 min-w-[12rem] rounded-[var(--radius-control)] border px-3 font-semibold focus:outline-none focus-visible:ring-2"
        >
          {options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="min-w-[9rem] text-end">
          <p className="text-label text-fg-muted">{definition.label}</p>
          <p className="text-title-card text-fg-primary font-semibold tabular-nums">
            {formatMetricValue(
              metrics[metric],
              definition.kind,
              locale,
              currency,
              labels.unavailable,
            )}
          </p>
          <div className="text-label mt-1 flex flex-wrap items-center justify-end gap-2">
            <span className="text-fg-muted">{status?.label ?? labels.unavailable}</span>
            {delta ? (
              <span className={deltaState(delta.favorable)}>
                {formatDelta(delta.percent, locale)} {deltaLabel(delta.favorable, labels)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function DataHealth({
  freshness,
  partial,
  dataHealth,
  lastSync,
  locale,
  timezone,
  since,
  until,
  syncStatus,
  statuses,
  labels,
}: {
  freshness: string;
  partial: boolean;
  dataHealth: DataHealthSummary;
  lastSync: string | null;
  locale: string;
  timezone: string;
  since: string;
  until: string;
  syncStatus: string;
  statuses: readonly MetricStatus[];
  labels: AdvertisingReportingDashboardLabels;
}) {
  return (
    <div className="space-y-2">
      <aside
        className="reporting-card border-border bg-surface-subtle flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border px-4 py-3"
        aria-label={labels.dataHealth}
        data-testid="advertising-reporting-data-health"
      >
        <div className="text-fg-primary flex items-center gap-2 font-semibold">
          <Database className="text-primary h-4 w-4" aria-hidden="true" />
          {labels.dataHealth}
        </div>
        <span className="text-label text-fg-secondary">
          {labels.synced}: <span data-timestamp>{formatLastSync(lastSync, locale, timezone)}</span>
        </span>
        <span className="text-label text-fg-secondary">
          {labels.timezone}: {timezone}
        </span>
        <span className="text-label text-fg-secondary">
          {labels.coverage}: {since} – {until}
        </span>
        <span className="text-label ms-auto inline-flex items-center gap-2 font-medium">
          {dataHealth.state === "complete" && !partial ? (
            <CheckCircle2 className="text-success h-4 w-4" aria-hidden="true" />
          ) : (
            <AlertTriangle className="text-warning h-4 w-4" aria-hidden="true" />
          )}
          <span>
            {dataHealth.state === "unavailable"
              ? labels.unavailable
              : dataHealth.state === "complete" && !partial
                ? labels.complete
                : dataHealth.state === "delayed"
                  ? labels.delayed
                  : labels.partial}
          </span>
          <span className="text-fg-muted">{freshness}</span>
        </span>
        <button
          type="button"
          className="text-label text-primary focus-visible:outline-primary inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-3 font-semibold underline-offset-4 hover:underline focus-visible:outline-2"
          onClick={() => window.location.reload()}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {labels.retry}
        </button>
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className="text-label text-fg-primary border-border focus-visible:ring-focus-ring inline-flex min-h-11 items-center rounded-[var(--radius-control)] border px-3 font-semibold focus:outline-none focus-visible:ring-2"
              data-testid="advertising-reporting-data-health-details-trigger"
            >
              {labels.details}
            </button>
          </DialogTrigger>
          <DialogContent
            closeAriaLabel={labels.close}
            className="max-h-[min(90vh,760px)] max-w-2xl overflow-y-auto"
            data-testid="advertising-reporting-data-health-details"
          >
            <DialogHeader>
              <DialogTitle>{labels.detailsTitle}</DialogTitle>
              <DialogDescription>{labels.detailsDescription}</DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              <dl className="grid gap-3 sm:grid-cols-2">
                <HealthDetail
                  label={labels.healthState}
                  value={healthStateLabel(dataHealth.state, labels)}
                />
                <HealthDetail label={labels.freshnessLabel} value={freshness} />
                <HealthDetail label={labels.syncStatus} value={syncStatus} />
                <HealthDetail
                  label={labels.lastSuccessfulSync}
                  value={formatLastSync(lastSync, locale, timezone)}
                />
                <HealthDetail
                  label={labels.timezone}
                  value={dataHealth.timezone ?? labels.unavailable}
                />
                <HealthDetail
                  label={labels.currency}
                  value={dataHealth.currency ?? labels.unavailable}
                />
                <HealthDetail
                  label={labels.coverage}
                  value={`${dataHealth.since} – ${dataHealth.until}`}
                />
              </dl>
              <div>
                <h3 className="text-body text-fg-primary font-semibold">{labels.issues}</h3>
                {dataHealth.issues.length > 0 ? (
                  <ul className="text-label text-fg-secondary mt-2 list-disc space-y-1 ps-5">
                    {dataHealth.issues.map((issue) => (
                      <li key={issue}>{healthIssueLabel(issue, labels)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-label text-fg-muted mt-2">{labels.noIssues}</p>
                )}
              </div>
              <div>
                <h3 className="text-body text-fg-primary font-semibold">{labels.metricStatus}</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {statuses.map((status) => (
                    <div
                      key={status.key}
                      className="border-border-subtle bg-surface-subtle rounded-[var(--radius-control)] border p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-label text-fg-primary font-semibold">
                          {metricDisplayLabel(status.key, labels)}
                        </span>
                        <span className="text-label text-fg-muted">
                          {metricAvailabilityLabel(status.availability, labels)}
                        </span>
                      </div>
                      <p className="text-label text-fg-muted mt-2">{status.note}</p>
                      <dl className="text-label text-fg-secondary mt-2 space-y-1">
                        <div className="flex justify-between gap-2">
                          <dt>{labels.source}</dt>
                          <dd className="text-end" dir="ltr">
                            {status.sourceField}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt>{labels.formula}</dt>
                          <dd className="text-end" dir="ltr">
                            {status.formula}
                          </dd>
                        </div>
                        {status.denominator ? (
                          <div className="flex justify-between gap-2">
                            <dt>{labels.denominator}</dt>
                            <dd className="text-end" dir="ltr">
                              {status.denominator}
                            </dd>
                          </div>
                        ) : null}
                        {status.attributionWindow ? (
                          <div className="flex justify-between gap-2">
                            <dt>{labels.attributionWindow}</dt>
                            <dd className="text-end">{status.attributionWindow}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </aside>
    </div>
  );
}

function HealthDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border-subtle bg-surface-subtle rounded-[var(--radius-control)] border p-3">
      <dt className="text-label text-fg-muted">{label}</dt>
      <dd className="text-body text-fg-primary mt-1 font-medium">{value}</dd>
    </div>
  );
}
function formatMetricValue(
  value: number | null,
  kind: "money" | "number" | "percent",
  locale: string,
  currency: string,
  unavailable: string,
) {
  if (value === null) return unavailable;
  if (kind === "money") {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (kind === "percent") {
    return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(
      value,
    );
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

function formatDelta(value: number | null | undefined, locale: string) {
  if (value === null || value === undefined) return undefined;
  return new Intl.NumberFormat(locale, {
    style: "percent",
    signDisplay: "always",
    maximumFractionDigits: 1,
  }).format(value);
}

function deltaState(favorable: boolean | null | undefined): "positive" | "negative" | "neutral" {
  return favorable === true ? "positive" : favorable === false ? "negative" : "neutral";
}

function deltaLabel(
  favorable: boolean | null | undefined,
  labels: AdvertisingReportingDashboardLabels,
) {
  return favorable === true
    ? labels.deltaImproved
    : favorable === false
      ? labels.deltaDeclined
      : labels.deltaUnchanged;
}

function metricStatus(
  statuses: readonly MetricStatus[],
  key: AdvertisingMetricKey,
  labels: AdvertisingReportingDashboardLabels,
): { label: string; tone: MetricAvailability } | undefined {
  const status = statuses.find((item) => item.key === key);
  return status
    ? { label: metricAvailabilityLabel(status.availability, labels), tone: status.availability }
    : undefined;
}

function metricDisplayLabel(
  key: AdvertisingMetricKey,
  labels: AdvertisingReportingDashboardLabels,
): string {
  switch (key) {
    case "spend":
      return labels.metricSpend;
    case "impressions":
      return labels.metricImpressions;
    case "reach":
      return labels.metricReach;
    case "frequency":
      return labels.metricFrequency;
    case "allClicks":
      return labels.metricAllClicks;
    case "linkClicks":
      return labels.metricLinkClicks;
    case "outboundClicks":
      return labels.metricOutboundClicks;
    case "landingPageViews":
      return labels.metricLandingPageViews;
    case "results":
      return labels.metricResults;
    case "costPerResult":
      return labels.metricCostPerResult;
    case "ctrAll":
      return labels.metricCtrAll;
    case "ctrLink":
      return labels.metricCtr;
    case "cpcAll":
      return labels.metricCpcAll;
    case "cpcLink":
      return labels.metricCpcLink;
    case "cpm":
      return labels.metricCpm;
  }
}

function metricAvailabilityLabel(
  availability: MetricAvailability,
  labels: AdvertisingReportingDashboardLabels,
): string {
  if (availability === "available") return labels.available;
  if (availability === "partial") return labels.partial;
  if (availability === "delayed") return labels.delayed;
  if (availability === "estimated") return labels.statusEstimated;
  return labels.unavailable;
}

function healthStateLabel(
  state: DataHealthSummary["state"],
  labels: AdvertisingReportingDashboardLabels,
): string {
  if (state === "complete") return labels.complete;
  if (state === "partial") return labels.partial;
  if (state === "delayed") return labels.delayed;
  return labels.unavailable;
}

function healthIssueLabel(issue: string, labels: AdvertisingReportingDashboardLabels): string {
  switch (issue) {
    case "no_successful_sync":
      return labels.issueNoSuccessfulSync;
    case "partial_coverage":
      return labels.issuePartialCoverage;
    case "sync_running":
      return labels.issueSyncRunning;
    case "sync_failed":
      return labels.issueSyncFailed;
    case "sync_dead_letter":
      return labels.issueSyncDeadLetter;
    case "stale_data":
      return labels.issueStaleData;
    default:
      return issue;
  }
}

function formatLastSync(lastSync: string | null, locale: string, timezone: string) {
  if (!lastSync) return "—";
  const date = new Date(lastSync);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}
function TrendPanel({
  dailyMetrics,
  comparisonDailyMetrics,
  comparisonComparable,
  labels,
  locale,
  currency,
  metricA,
  metricB,
  granularity,
  setMetricA,
  setMetricB,
  setGranularity,
  tableOpen,
  setTableOpen,
}: {
  dailyMetrics: readonly AdvertisingTrendPoint[];
  comparisonDailyMetrics: readonly AdvertisingTrendPoint[];
  comparisonComparable: boolean;
  labels: AdvertisingReportingDashboardLabels;
  locale: string;
  currency: string;
  metricA: TrendMetricKey;
  metricB: TrendMetricKey;
  granularity: TrendGranularity;
  setMetricA: (value: TrendMetricKey) => void;
  setMetricB: (value: TrendMetricKey) => void;
  setGranularity: (value: TrendGranularity) => void;
  tableOpen: boolean;
  setTableOpen: (value: boolean) => void;
}) {
  const name = (key: TrendMetricKey) =>
    key === "spend"
      ? labels.trendSpend
      : key === "impressions"
        ? labels.trendImpressions
        : key === "clicks"
          ? labels.trendClicks
          : labels.trendResults;
  const maxA = Math.max(...dailyMetrics.map((day) => day[metricA] ?? 0), 1);
  const maxB = Math.max(
    ...dailyMetrics.map((day) => day[metricB] ?? 0),
    ...(comparisonComparable ? comparisonDailyMetrics.map((day) => day[metricB] ?? 0) : []),
    1,
  );
  const chartWidth = 720;
  const chartHeight = 190;
  const plotLeft = 12;
  const plotRight = chartWidth - 12;
  const plotTop = 14;
  const plotBottom = chartHeight - 16;
  const step = dailyMetrics.length > 1 ? (plotRight - plotLeft) / (dailyMetrics.length - 1) : 0;
  const linePoints = (
    points: readonly AdvertisingTrendPoint[],
    key: TrendMetricKey,
    seriesMax: number,
  ) => {
    const segments: string[] = [];
    let current: string[] = [];
    const pointStep = points.length > 1 ? (plotRight - plotLeft) / (points.length - 1) : 0;
    points.forEach((day, index) => {
      const value = day[key];
      if (value === null) {
        if (current.length > 1) segments.push(current.join(" "));
        current = [];
        return;
      }
      const y = plotBottom - (value / seriesMax) * (plotBottom - plotTop);
      current.push(`${points.length > 1 ? plotLeft + index * pointStep : chartWidth / 2},${y}`);
    });
    if (current.length > 1) segments.push(current.join(" "));
    return segments;
  };
  return (
    <Card className="reporting-card" data-testid="advertising-reporting-performance-trend">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="text-primary h-4 w-4" aria-hidden="true" />
              {labels.performanceTrend}
            </CardTitle>
            <CardDescription>{labels.performanceTrendDescription}</CardDescription>
          </div>
          <button
            type="button"
            className="text-label text-primary focus-visible:outline-primary min-h-11 rounded-[var(--radius-control)] px-3 font-semibold underline-offset-4 hover:underline focus-visible:outline-2"
            onClick={() => setTableOpen(!tableOpen)}
          >
            {tableOpen ? labels.hideTable : labels.showTable}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <label className="text-label text-fg-muted" htmlFor="advertising-trend-a">
            {name(metricA)}
          </label>
          <select
            id="advertising-trend-a"
            value={metricA}
            onChange={(event) => setMetricA(event.target.value as TrendMetricKey)}
            className="border-border bg-surface text-label min-h-11 rounded-[var(--radius-control)] border px-2"
          >
            <option value="spend">{labels.trendSpend}</option>
            <option value="impressions">{labels.trendImpressions}</option>
            <option value="clicks">{labels.trendClicks}</option>
            <option value="results">{labels.trendResults}</option>
          </select>
          <label className="text-label text-fg-muted" htmlFor="advertising-trend-granularity">
            {labels.trendGranularity}
          </label>
          <select
            id="advertising-trend-granularity"
            value={granularity}
            onChange={(event) => setGranularity(event.target.value as TrendGranularity)}
            className="border-border bg-surface text-label min-h-11 rounded-[var(--radius-control)] border px-2"
          >
            <option value="day">{labels.trendDay}</option>
            <option value="week">{labels.trendWeek}</option>
            <option value="month">{labels.trendMonth}</option>
          </select>
          <span className="text-label text-fg-muted">vs.</span>
          <label className="text-label text-fg-muted" htmlFor="advertising-trend-b">
            {name(metricB)}
          </label>
          <select
            id="advertising-trend-b"
            value={metricB}
            onChange={(event) => setMetricB(event.target.value as TrendMetricKey)}
            className="border-border bg-surface text-label min-h-11 rounded-[var(--radius-control)] border px-2"
          >
            <option value="results">{labels.trendResults}</option>
            <option value="spend">{labels.trendSpend}</option>
            <option value="impressions">{labels.trendImpressions}</option>
            <option value="clicks">{labels.trendClicks}</option>
          </select>
        </div>
      </CardHeader>
      <div className="px-5 pb-5">
        <div
          className="reporting-chart-surface flex h-52 items-end gap-1 overflow-hidden rounded-[var(--radius-control)] p-3"
          role="img"
          aria-label={`${labels.performanceTrend}: ${name(metricA)} vs ${name(metricB)}; ${dailyMetrics.length} ${labels.date}`}
        >
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            className="h-full w-full"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {[0, 1, 2, 3, 4].map((line) => (
              <line
                key={line}
                x1={plotLeft}
                x2={plotRight}
                y1={plotTop + (line * (plotBottom - plotTop)) / 4}
                y2={plotTop + (line * (plotBottom - plotTop)) / 4}
                stroke="var(--chart-grid)"
                strokeWidth="1"
              />
            ))}
            {dailyMetrics.map((day, index) => {
              const x = dailyMetrics.length > 1 ? plotLeft + index * step : chartWidth / 2;
              const barWidth = Math.max(
                3,
                Math.min(18, ((plotRight - plotLeft) / Math.max(dailyMetrics.length, 1)) * 0.52),
              );
              const value = day[metricA];
              if (value === null) return null;
              const height = Math.max(2, (value / maxA) * (plotBottom - plotTop));
              return (
                <rect
                  key={day.date}
                  x={x - barWidth / 2}
                  y={plotBottom - height}
                  width={barWidth}
                  height={height}
                  rx="3"
                  fill="var(--chart-primary)"
                  opacity="0.72"
                />
              );
            })}
            {linePoints(dailyMetrics, metricB, maxB).map((points, index) => (
              <polyline
                key={`line-${index}`}
                points={points}
                fill="none"
                stroke="var(--chart-secondary)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {comparisonComparable
              ? linePoints(comparisonDailyMetrics, metricB, maxB).map((points, index) => (
                  <polyline
                    key={`comparison-line-${index}`}
                    points={points}
                    fill="none"
                    stroke="var(--fg-muted)"
                    strokeWidth="2"
                    strokeDasharray="6 5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))
              : null}
            {dailyMetrics.map((day, index) => {
              const x = dailyMetrics.length > 1 ? plotLeft + index * step : chartWidth / 2;
              const value = day[metricB];
              if (value === null) return null;
              const y = plotBottom - (value / maxB) * (plotBottom - plotTop);
              return (
                <circle
                  key={`${day.date}-point`}
                  cx={x}
                  cy={y}
                  r="3.5"
                  fill="var(--surface)"
                  stroke="var(--chart-secondary)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>
        </div>
        <div
          className="text-label text-fg-muted mt-3 flex flex-wrap items-center gap-4"
          aria-hidden="true"
        >
          <span className="inline-flex items-center gap-2">
            <span className="bg-chart-primary h-2.5 w-2.5 rounded-sm" />
            {name(metricA)}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="bg-chart-secondary h-2.5 w-2.5 rounded-full" />
            {name(metricB)}
          </span>
          {comparisonComparable ? (
            <span className="inline-flex items-center gap-2">
              <span className="bg-fg-muted h-0.5 w-3" />
              {labels.comparisonTrace}
            </span>
          ) : null}
          <span className="ms-auto">
            {dailyMetrics.length} {labels.date}
          </span>
        </div>
        {tableOpen ? (
          <div className="border-border mt-3 max-h-56 overflow-auto rounded-[var(--radius-control)] border">
            <table className="text-label w-full text-start">
              <caption className="sr-only">{labels.performanceTrend}</caption>
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-3 py-2 text-start">{labels.date}</th>
                  <th className="px-3 py-2 text-end">{name(metricA)}</th>
                  <th className="px-3 py-2 text-end">{name(metricB)}</th>
                  {comparisonComparable ? (
                    <th className="px-3 py-2 text-end">{labels.comparisonTrace}</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {dailyMetrics.map((day, index) => (
                  <tr key={day.date} className="border-border border-t">
                    <th className="px-3 py-2 text-start font-normal">{day.date}</th>
                    <td className="px-3 py-2 text-end tabular-nums">
                      {trendValue(day[metricA], metricA, locale, currency)}
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">
                      {trendValue(day[metricB], metricB, locale, currency)}
                    </td>
                    {comparisonComparable ? (
                      <td className="px-3 py-2 text-end tabular-nums">
                        {trendValue(
                          comparisonDailyMetrics[index]?.[metricB] ?? null,
                          metricB,
                          locale,
                          currency,
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
function trendValue(value: number | null, key: TrendMetricKey, locale: string, currency: string) {
  if (value === null) return "—";
  return key === "spend"
    ? new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency || "EUR",
        maximumFractionDigits: 2,
      }).format(value)
    : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}
function ObjectiveMix({
  campaigns,
  labels,
  locale,
  currency,
}: {
  campaigns: readonly AdvertisingCampaignSummary[];
  labels: AdvertisingReportingDashboardLabels;
  locale: string;
  currency: string;
}) {
  const total = campaigns.reduce((sum, campaign) => sum + campaign.spend, 0);
  const values = new Map<
    string,
    { spend: number; results: number | null; resultType: string | null }
  >();
  for (const campaign of campaigns) {
    const key = campaign.objective ?? labels.unknownObjective;
    const current = values.get(key);
    if (!current) {
      values.set(key, {
        spend: campaign.spend,
        results: campaign.results ?? null,
        resultType: campaign.resultType ?? null,
      });
      continue;
    }
    const compatibleResultType =
      current.resultType !== null && current.resultType === (campaign.resultType ?? null);
    values.set(key, {
      spend: current.spend + campaign.spend,
      results:
        compatibleResultType && current.results !== null && campaign.results !== null
          ? current.results + campaign.results
          : null,
      resultType: compatibleResultType ? current.resultType : null,
    });
  }
  return (
    <Card className="reporting-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="text-primary h-4 w-4" aria-hidden="true" />
          {labels.objectiveMix}
        </CardTitle>
        <CardDescription>{labels.objectiveMixDescription}</CardDescription>
      </CardHeader>
      <div className="px-5 pb-5">
        {values.size === 0 ? (
          <p className="text-label text-fg-muted">{labels.unavailable}</p>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <ObjectiveDonut values={[...values.entries()]} total={total} />
              <p className="text-label text-fg-secondary max-w-[18rem]">
                {new Intl.NumberFormat(locale, {
                  style: "currency",
                  currency: currency || "EUR",
                  maximumFractionDigits: 2,
                }).format(total)}{" "}
                {labels.metricSpend.toLowerCase()}
              </p>
            </div>
            <ul className="mt-4 space-y-3">
              {[...values.entries()].map(([objective, value], index) => {
                const percentage = total > 0 ? (value.spend / total) * 100 : 0;
                const costPerResult =
                  value.results === null || value.results <= 0 ? null : value.spend / value.results;
                return (
                  <li key={objective} className="text-label flex items-start gap-2">
                    <span
                      className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: `var(--chart-series-${(index % 6) + 1})` }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-3">
                        <span className="text-fg-primary font-medium">{objective}</span>
                        <span className="text-fg-muted tabular-nums">
                          {Math.round(percentage)}%
                        </span>
                      </div>
                      <p className="text-fg-muted mt-1">
                        {new Intl.NumberFormat(locale, {
                          style: "currency",
                          currency: currency || "EUR",
                          maximumFractionDigits: 2,
                        }).format(value.spend)}{" "}
                        ·{" "}
                        {value.results === null
                          ? labels.unavailable
                          : `${new Intl.NumberFormat(locale).format(value.results)} ${labels.metricResults}`}{" "}
                        {value.resultType ? <bdi dir="ltr">· {value.resultType}</bdi> : null} ·{" "}
                        {costPerResult === null
                          ? labels.unavailable
                          : new Intl.NumberFormat(locale, {
                              style: "currency",
                              currency: currency || "EUR",
                              maximumFractionDigits: 2,
                            }).format(costPerResult)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

function ObjectiveDonut({
  values,
  total,
}: {
  values: readonly [string, { spend: number; results: number | null; resultType: string | null }][];
  total: number;
}) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0" aria-hidden="true">
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke="var(--surface-subtle)"
        strokeWidth="14"
      />
      {values.map(([objective, value], index) => {
        const length = total > 0 ? (value.spend / total) * circumference : 0;
        const offset = values
          .slice(0, index)
          .reduce(
            (sum, [, previous]) => sum + (total > 0 ? (previous.spend / total) * circumference : 0),
            0,
          );
        return (
          <circle
            key={objective}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={`var(--chart-series-${(index % 6) + 1})`}
            strokeWidth="14"
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 50 50)"
          />
        );
      })}
      <circle cx="50" cy="50" r="23" fill="var(--surface)" />
    </svg>
  );
}

type ActionRailItem = {
  key: string;
  icon: ReactNode;
  title: string;
  detail: string;
  href: string;
  hrefLabel: string;
  signalKey: string;
  entityType: AdvertisingSignalEntityType;
  entityId: string;
  feedbackKey: string;
  insight: CampaignPerformanceInsight | null;
};

function ActionCenter({
  accountId,
  workspaceSlug,
  insights,
  pacing,
  fatigue,
  audienceCount,
  labels,
  locale,
  since,
  until,
  campaignsHref,
  creativesHref,
  audienceHref,
}: {
  accountId: string;
  workspaceSlug: string;
  insights: readonly CampaignPerformanceInsight[];
  pacing: readonly BudgetPacingInsight[];
  fatigue: readonly CreativeFatigueInsight[];
  audienceCount: number;
  labels: AdvertisingReportingDashboardLabels;
  locale: string;
  since: string;
  until: string;
  campaignsHref: string;
  creativesHref: string;
  audienceHref: string;
}) {
  const [feedbackByKey, setFeedbackByKey] = useState<Record<string, AdvertisingSignalFeedbackView>>(
    {},
  );
  const [feedbackBusyKey, setFeedbackBusyKey] = useState<string | null>(null);
  const [dismissKey, setDismissKey] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [feedbackError, setFeedbackError] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void fetch(
      `/api/advertising/signal-feedback?workspace=${encodeURIComponent(workspaceSlug)}&accountId=${encodeURIComponent(accountId)}&since=${since}&until=${until}`,
      { headers: { Accept: "application/json" } },
    )
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { feedback?: AdvertisingSignalFeedbackView[] };
      })
      .then((payload) => {
        if (cancelled || !payload) return;
        setFeedbackByKey(
          Object.fromEntries(
            (payload.feedback ?? []).map((item) => [
              advertisingSignalFeedbackKey(item.entityType, item.entityId, item.signalKey),
              item,
            ]),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setFeedbackError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, since, until, workspaceSlug]);

  const saveFeedback = async (args: {
    item: ActionRailItem;
    state: AdvertisingSignalFeedbackState;
    reason?: string;
    snoozedUntil?: string;
  }) => {
    setFeedbackBusyKey(args.item.key);
    setFeedbackError(false);
    try {
      const response = await fetch("/api/advertising/signal-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace: workspaceSlug,
          accountId,
          since,
          until,
          mutation: {
            signalKey: args.item.signalKey,
            entityType: args.item.entityType,
            entityId: args.item.entityId,
            state: args.state,
            ...(args.reason ? { reason: args.reason } : {}),
            ...(args.snoozedUntil ? { snoozedUntil: args.snoozedUntil } : {}),
          },
        }),
      });
      if (!response.ok) throw new Error("feedback_failed");
      const payload = (await response.json()) as { feedback?: AdvertisingSignalFeedbackView };
      if (!payload.feedback) throw new Error("feedback_missing");
      setFeedbackByKey((current) => ({
        ...current,
        [args.item.feedbackKey]: payload.feedback!,
      }));
      setDismissKey(null);
      setDismissReason("");
    } catch {
      setFeedbackError(true);
    } finally {
      setFeedbackBusyKey(null);
    }
  };

  const items = insights
    .filter((insight) => insight.status === "underperforming" || insight.status === "effective")
    .sort((left, right) => {
      if (left.status === right.status) return right.sampleImpressions - left.sampleImpressions;
      return left.status === "underperforming" ? -1 : 1;
    })
    .slice(0, 3);
  const budgetItem = pacing.find((item) => item.status === "over") ?? null;
  const fatigueItem = fatigue.find((item) => item.status === "fatiguing") ?? null;
  const decisionItems = [
    budgetItem
      ? {
          key: `budget-${budgetItem.campaignId}`,
          icon: <Gauge className="text-warning h-4 w-4" aria-hidden="true" />,
          title: labels.budgetPacing,
          detail:
            budgetItem.paceRatio === null
              ? labels.noBudgetData
              : `${budgetItem.name ?? budgetItem.campaignId} · ${Math.round(budgetItem.paceRatio * 100)}%`,
          href: campaignsHref,
          hrefLabel: labels.review,
          signalKey: "budget_overpace",
          entityType: "budget" as const,
          entityId: budgetItem.campaignId,
        }
      : null,
    fatigueItem
      ? {
          key: `fatigue-${fatigueItem.adId}`,
          icon: <TriangleAlert className="text-warning h-4 w-4" aria-hidden="true" />,
          title: labels.creativeHealth,
          detail: fatigueItem.name ?? fatigueItem.adId,
          href: creativesHref,
          hrefLabel: labels.review,
          signalKey: "creative_fatigue",
          entityType: "creative" as const,
          entityId: fatigueItem.adId,
        }
      : null,
    audienceCount > 0
      ? {
          key: "audience-opportunity",
          icon: <UsersRound className="text-primary h-4 w-4" aria-hidden="true" />,
          title: labels.audienceOpportunity,
          detail: `${new Intl.NumberFormat(locale).format(audienceCount)} ${labels.audienceSnapshot}`,
          href: audienceHref,
          hrefLabel: labels.review,
          signalKey: "audience_opportunity",
          entityType: "audience" as const,
          entityId: "account",
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  const allRailItems = [
    ...items.map((insight) => ({
      key: `campaign-${insight.campaignId}`,
      icon:
        insight.status === "underperforming" ? (
          <AlertTriangle className="text-warning h-4 w-4" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="text-success h-4 w-4" aria-hidden="true" />
        ),
      title: insight.name ?? insight.campaignId,
      detail: `${labels.evidence}: ${insight.reason.replaceAll("_", " ")} · ${labels.sample}: ${new Intl.NumberFormat(locale).format(insight.sampleImpressions)}`,
      href: campaignReviewHref(campaignsHref, insight.campaignId),
      hrefLabel: labels.review,
      signalKey: `campaign_${insight.status}`,
      entityType: "campaign" as const,
      entityId: insight.campaignId,
      insight,
    })),
    ...decisionItems.map((item) => ({ ...item, insight: null })),
  ].map((item) => ({
    ...item,
    feedbackKey: advertisingSignalFeedbackKey(item.entityType, item.entityId, item.signalKey),
  })) as ActionRailItem[];
  const railItems = allRailItems
    .filter((item) => {
      const feedback = feedbackByKey[item.feedbackKey];
      if (!feedback || feedback.state === "open" || feedback.state === "reviewed") return true;
      if (feedback.state === "dismissed") return false;
      return !feedback.snoozedUntil || Date.parse(feedback.snoozedUntil) <= now;
    })
    .slice(0, 4);
  return (
    <Card
      className="reporting-card flex h-full flex-col"
      data-testid="advertising-reporting-action-center"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="text-primary h-4 w-4" aria-hidden="true" />
          {labels.actionCenter}
        </CardTitle>
        <CardDescription>{labels.actionCenterDescription}</CardDescription>
      </CardHeader>
      <div className="grid flex-1 content-start gap-3 px-5 pb-5 md:grid-cols-3 xl:grid-cols-1">
        {railItems.length === 0 ? (
          <p className="text-label text-fg-muted md:col-span-3">{labels.noSignals}</p>
        ) : (
          railItems.map((item) => {
            const insight = item.insight;
            const feedback = feedbackByKey[item.feedbackKey];
            return (
              <div
                key={item.key}
                className="border-border-subtle bg-surface-subtle rounded-[var(--radius-control)] border p-3"
              >
                <div className="text-label text-fg-primary flex items-center gap-2 font-semibold">
                  {item.icon}
                  {item.title}
                </div>
                {feedback && feedback.state !== "open" ? (
                  <span className="text-label text-fg-muted mt-2 inline-flex rounded-full border px-2 py-1">
                    {feedback.state === "reviewed"
                      ? labels.reviewed
                      : feedback.state === "snoozed"
                        ? labels.snoozed
                        : labels.dismissed}
                  </span>
                ) : null}
                <p className="text-label text-fg-muted mt-2">{item.detail}</p>
                {insight ? (
                  <details className="mt-2">
                    <summary className="text-label text-primary focus-visible:outline-primary inline-flex min-h-11 cursor-pointer items-center font-semibold underline-offset-4 hover:underline focus-visible:outline-2">
                      {labels.reviewEvidence}
                    </summary>
                    <dl className="text-label text-fg-secondary mt-2 grid gap-1">
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt>{labels.period}</dt>
                        <dd dir="ltr">{`${since} – ${until}`}</dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt>{labels.sample}</dt>
                        <dd className="tabular-nums">
                          {new Intl.NumberFormat(locale).format(insight.sampleImpressions)}
                        </dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt>{labels.baseline}</dt>
                        <dd className="text-end tabular-nums">
                          {insight.baselineCtr === null || insight.baselineCpc === null
                            ? labels.unavailable
                            : `${formatPercentValue(insight.baselineCtr, locale)} CTR · ${formatNumberValue(insight.baselineCpc, locale)} CPC`}
                        </dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-2">
                        <dt>{labels.confidence}</dt>
                        <dd>{confidenceLabel(insight.confidence, labels)}</dd>
                      </div>
                    </dl>
                  </details>
                ) : null}
                <a
                  href={item.href}
                  className="text-label text-primary focus-visible:outline-primary mt-3 inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:underline focus-visible:outline-2"
                >
                  {item.hrefLabel}
                  <ChevronRight className="ms-1 h-4 w-4" aria-hidden="true" />
                </a>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={feedbackBusyKey === item.key}
                    onClick={() =>
                      void saveFeedback({
                        item,
                        state: feedback?.state === "reviewed" ? "open" : "reviewed",
                      })
                    }
                  >
                    {feedback?.state === "reviewed" ? labels.reopen : labels.markReviewed}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={feedbackBusyKey === item.key}
                    onClick={() => {
                      setDismissKey((current) => (current === item.key ? null : item.key));
                      setDismissReason("");
                    }}
                  >
                    {labels.dismiss}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={feedbackBusyKey === item.key}
                    onClick={() =>
                      void saveFeedback({
                        item,
                        state: "snoozed",
                        snoozedUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(),
                      })
                    }
                  >
                    {labels.snooze}
                  </Button>
                </div>
                {dismissKey === item.key ? (
                  <div className="border-border-subtle bg-surface mt-2 space-y-2 rounded-[var(--radius-control)] border p-2">
                    <label
                      className="text-label text-fg-primary block font-semibold"
                      htmlFor={`advertising-dismiss-reason-${item.key}`}
                    >
                      {labels.feedbackReason}
                    </label>
                    <select
                      id={`advertising-dismiss-reason-${item.key}`}
                      value={dismissReason}
                      onChange={(event) => setDismissReason(event.target.value)}
                      className="border-border bg-surface text-label text-fg-primary min-h-11 w-full rounded-[var(--radius-control)] border px-2"
                    >
                      <option value="">{labels.selectReason}</option>
                      <option value="not_relevant">{labels.reasonNotRelevant}</option>
                      <option value="already_handled">{labels.reasonAlreadyHandled}</option>
                      <option value="data_incomplete">{labels.reasonDataIncomplete}</option>
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!dismissReason || feedbackBusyKey === item.key}
                      onClick={() =>
                        void saveFeedback({ item, state: "dismissed", reason: dismissReason })
                      }
                    >
                      {labels.saveFeedback}
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      {feedbackError ? (
        <p className="text-label text-danger px-5 pb-5" role="status">
          {labels.feedbackError}
        </p>
      ) : null}
    </Card>
  );
}

function campaignReviewHref(href: string, campaignId: string): string {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set("search", campaignId);
  return `${path}?${params.toString()}`;
}

function formatPercentValue(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumberValue(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(value);
}

function confidenceLabel(
  confidence: CampaignPerformanceConfidence,
  labels: AdvertisingReportingDashboardLabels,
) {
  return confidence === "strong" ? labels.confidenceGuarded : labels.confidenceLimited;
}

function resultLabel(label: string, definitionLabel: string, resultType: string | null): string {
  return resultType ? `${label} · ${definitionLabel}: ${resultType}` : label;
}

function CampaignExplorer({
  campaigns,
  labels,
  locale,
  currency,
}: {
  campaigns: readonly AdvertisingCampaignSummary[];
  labels: AdvertisingReportingDashboardLabels;
  locale: string;
  currency: string;
}) {
  return (
    <Card className="reporting-card" id="advertising-reporting-campaign-explorer">
      <CardHeader>
        <CardTitle>{labels.campaignExplorer}</CardTitle>
        <CardDescription>{labels.campaignExplorerDescription}</CardDescription>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="text-label w-full min-w-[620px] text-start">
          <caption className="sr-only">{labels.campaignExplorer}</caption>
          <thead className="bg-surface-subtle text-fg-muted">
            <tr>
              <th className="px-5 py-3 text-start">{labels.campaign}</th>
              <th className="px-3 py-3 text-end">{labels.objective}</th>
              <th className="px-3 py-3 text-end">{labels.metricSpend}</th>
              <th className="px-3 py-3 text-end">{labels.metricResults}</th>
              <th className="px-5 py-3 text-start">{labels.status}</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.slice(0, 8).map((campaign) => (
              <tr key={campaign.campaignId} className="border-border border-t">
                <th className="text-fg-primary max-w-[220px] px-5 py-3 text-start font-medium">
                  <span className="block truncate">{campaign.name ?? campaign.campaignId}</span>
                  <bdi className="text-label text-fg-muted" dir="ltr">
                    {campaign.campaignId}
                  </bdi>
                </th>
                <td className="px-3 py-3 text-end">{campaign.objective ?? "—"}</td>
                <td className="px-3 py-3 text-end tabular-nums">
                  {new Intl.NumberFormat(locale, {
                    style: "currency",
                    currency: currency || "EUR",
                    maximumFractionDigits: 2,
                  }).format(campaign.spend)}
                </td>
                <td className="px-3 py-3 text-end tabular-nums">
                  <span className="block">
                    {campaign.results === null
                      ? labels.unavailable
                      : new Intl.NumberFormat(locale).format(campaign.results)}
                  </span>
                  {campaign.resultType ? (
                    <bdi className="text-label text-fg-muted block" dir="ltr">
                      {campaign.resultType}
                    </bdi>
                  ) : null}
                </td>
                <td className="px-5 py-3 text-start">{campaign.status ?? labels.unavailable}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
