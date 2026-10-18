"use client";

import { useState, type ReactNode } from "react";
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
  Percent,
  RefreshCw,
  Target,
  TrendingUp,
} from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportingKpiCard } from "@/components/reporting/reporting-kpi-card";
import type {
  AdvertisingMetricKey,
  AdvertisingMetricSnapshot,
  MetricStatus,
} from "@/lib/advertising/reporting-metrics";
import type { ComparisonSummary } from "@/lib/advertising/reporting-comparison";
import type { AdvertisingCampaignSummary } from "@/lib/advertising/reporting-view";
import type { CampaignPerformanceInsight } from "@/lib/advertising/intelligence";
import type {
  AdvertisingTrendPoint,
  TrendGranularity,
  TrendMetricKey,
} from "@/lib/advertising/reporting-trend";

export type AdvertisingReportingDashboardLabels = {
  dataHealth: string;
  synced: string;
  timezone: string;
  coverage: string;
  retry: string;
  primaryMetrics: string;
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
  definition: string;
  noSignals: string;
  sample: string;
  evidence: string;
  metricSpend: string;
  metricResults: string;
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
  accountName: string;
  currency: string;
  locale: string;
  timezone: string;
  freshness: string;
  partial: boolean;
  lastSync: string | null;
  since: string;
  until: string;
  metrics: AdvertisingMetricSnapshot;
  comparison: ComparisonSummary | null;
  statuses: readonly MetricStatus[];
  campaigns: readonly AdvertisingCampaignSummary[];
  insights: readonly CampaignPerformanceInsight[];
  dailyMetrics: readonly AdvertisingTrendPoint[];
  comparisonDailyMetrics: readonly AdvertisingTrendPoint[];
  comparisonComparable: boolean;
  trendGranularity: TrendGranularity;
  trendMetricA: TrendMetricKey;
  trendMetricB: TrendMetricKey;
  audienceCount: number;
  campaignsHref: string;
  labels: AdvertisingReportingDashboardLabels;
}) {
  const { labels } = props;
  const router = useRouter();
  const [metricA, setMetricA] = useState<TrendMetricKey>(props.trendMetricA);
  const [metricB, setMetricB] = useState<TrendMetricKey>(props.trendMetricB);
  const [granularity, setGranularity] = useState<TrendGranularity>(props.trendGranularity);
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
  }[] = [
    {
      key: "spend",
      label: labels.metricSpend,
      value: props.metrics.spend,
      kind: "money",
      icon: <CircleDollarSign className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: "results",
      label: labels.metricResults,
      value: props.metrics.results,
      kind: "number",
      icon: <Target className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: "costPerResult",
      label: labels.metricCostPerResult,
      value: props.metrics.costPerResult,
      kind: "money",
      icon: <CircleDollarSign className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: "reach",
      label: labels.metricReach,
      value: props.metrics.reach,
      kind: "number",
      icon: <Eye className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: "ctrLink",
      label: labels.metricCtr,
      value: props.metrics.ctrLink,
      kind: "percent",
      icon: <Percent className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: "frequency",
      label: labels.metricFrequency,
      value: props.metrics.frequency,
      kind: "number",
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
              delta={formatDelta(props.comparison?.deltas[card.key]?.percent, props.locale)}
              deltaState={deltaState(props.comparison?.deltas[card.key]?.favorable)}
              deltaLabel={deltaLabel(props.comparison?.deltas[card.key]?.favorable, labels)}
            />
          ))}
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
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
                <span className="text-label text-fg-primary font-semibold">{status.key}</span>
                <span
                  className={`text-label font-semibold ${status.availability === "available" ? "text-success" : "text-fg-muted"}`}
                >
                  {status.availability === "available" ? labels.available : labels.unavailable}
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

function DataHealth({
  freshness,
  partial,
  lastSync,
  locale,
  timezone,
  since,
  until,
  labels,
}: {
  freshness: string;
  partial: boolean;
  lastSync: string | null;
  locale: string;
  timezone: string;
  since: string;
  until: string;
  labels: AdvertisingReportingDashboardLabels;
}) {
  return (
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
        {labels.synced}: {formatLastSync(lastSync, locale, timezone)}
      </span>
      <span className="text-label text-fg-secondary">
        {labels.timezone}: {timezone}
      </span>
      <span className="text-label text-fg-secondary">
        {labels.coverage}: {since} – {until}
      </span>
      <span className="text-label ms-auto inline-flex items-center gap-2 font-medium">
        {partial ? (
          <AlertTriangle className="text-warning h-4 w-4" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="text-success h-4 w-4" aria-hidden="true" />
        )}
        <span>{partial ? labels.partial : labels.complete}</span>
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
    </aside>
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
  const values = new Map<string, { spend: number; results: number | null }>();
  for (const campaign of campaigns) {
    const key = campaign.objective ?? labels.unknownObjective;
    const current = values.get(key) ?? { spend: 0, results: 0 };
    values.set(key, {
      spend: current.spend + campaign.spend,
      results:
        current.results === null || campaign.results === null
          ? null
          : current.results + campaign.results,
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
                        ·{" "}
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
  values: readonly [string, { spend: number; results: number | null }][];
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
function ActionCenter({
  insights,
  labels,
  locale,
  campaignsHref,
}: {
  insights: readonly CampaignPerformanceInsight[];
  labels: AdvertisingReportingDashboardLabels;
  locale: string;
  campaignsHref: string;
}) {
  const items = insights
    .filter((insight) => insight.status === "underperforming" || insight.status === "effective")
    .slice(0, 3);
  return (
    <Card className="reporting-card" data-testid="advertising-reporting-action-center">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="text-primary h-4 w-4" aria-hidden="true" />
          {labels.actionCenter}
        </CardTitle>
        <CardDescription>{labels.actionCenterDescription}</CardDescription>
      </CardHeader>
      <div className="grid gap-3 px-5 pb-5 md:grid-cols-3">
        {items.length === 0 ? (
          <p className="text-label text-fg-muted md:col-span-3">{labels.noSignals}</p>
        ) : (
          items.map((insight) => (
            <div
              key={insight.campaignId}
              className="border-border-subtle bg-surface-subtle rounded-[var(--radius-control)] border p-3"
            >
              <div className="text-label text-fg-primary flex items-center gap-2 font-semibold">
                {insight.status === "underperforming" ? (
                  <AlertTriangle className="text-warning h-4 w-4" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="text-success h-4 w-4" aria-hidden="true" />
                )}
                {insight.name ?? insight.campaignId}
              </div>
              <p className="text-label text-fg-muted mt-2">
                {labels.evidence}: {insight.reason.replaceAll("_", " ")} · {labels.sample}:{" "}
                {new Intl.NumberFormat(locale).format(insight.sampleImpressions)}
              </p>
              <a
                href={campaignsHref}
                className="text-label text-primary focus-visible:outline-primary mt-3 inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:underline focus-visible:outline-2"
              >
                {labels.review}
                <ChevronRight className="ms-1 h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          ))
        )}
      </div>
    </Card>
  );
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
                  {campaign.results === null
                    ? labels.unavailable
                    : new Intl.NumberFormat(locale).format(campaign.results)}
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
