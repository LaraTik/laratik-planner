"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Download, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { PlatformIcon } from "@/components/workspace/platform-icon";
import {
  buildComparisonSeries,
  commonMetricsForChannels,
  encodeAnalyticsSelection,
  filterAnalyticsChannels,
  parseAnalyticsSelection,
  type ComparisonView,
  type AnalyticsDashboardChannel,
} from "@/lib/social/analytics-dashboard";
import {
  calculateGrowth,
  seriesInWindow,
  type SocialMetric,
  type SocialWindow,
} from "@/lib/social/analytics";

type DashboardLabels = {
  platformFilter: string;
  accountFilter: string;
  accountFilterDescription: string;
  allPlatforms: string;
  clear: string;
  selectAll: string;
  allAccounts: string;
  selectedCount: string;
  comparisonTitle: string;
  comparisonDescription: string;
  comparisonInsightLabel: string;
  comparisonInsight: string;
  comparisonInsightNoGrowth: string;
  comparisonMode: string;
  comparisonAbsolute: string;
  comparisonGrowth: string;
  comparisonLegend: string;
  showSeries: string;
  hideSeries: string;
  period: string;
  metric: string;
  noComparableMetrics: string;
  noData: string;
  refresh: string;
  export: string;
  channels: string;
  currentFollowers: string;
  latestMetric: string;
  changeInPeriod: string;
  changeUnavailable: string;
  window: string;
  days: string;
  ranking: string;
  channel: string;
  latestValue: string;
  change: string;
  dataStatus: string;
  healthy: string;
  partialData: string;
  providerDataLimited: string;
  noMetricData: string;
  dataTable: string;
  details: string;
  followerTrend: string;
  date: string;
  partial: string;
  metricLabels: Record<SocialMetric, string>;
  platformLabels: Record<string, string>;
};

const PLATFORMS: AnalyticsDashboardChannel["platform"][] = ["facebook", "instagram", "tiktok"];
const COMPARISON_COLORS = ["#3525cd", "#dc5f00", "#16825d", "#a23a8c", "#087ea4", "#7a5c00"];
const COMPARISON_LINE_STYLES = [undefined, "8 4", "2 4", "12 4 2 4", "4 4", "8 2 2 2"];

function formatNumber(value: number | null): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function formatSigned(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function interpolate(value: string, params: Record<string, string | number>): string {
  return Object.entries(params).reduce(
    (result, [name, replacement]) => result.replaceAll(`{${name}}`, String(replacement)),
    value,
  );
}

function selectedMetricOrFallback(
  requested: SocialMetric,
  commonMetrics: SocialMetric[],
): SocialMetric {
  return commonMetrics.includes(requested) ? requested : (commonMetrics[0] ?? requested);
}

type ComparisonRow = {
  channel: AnalyticsDashboardChannel;
  initial: number | null;
  latest: number | null;
  growth: ReturnType<typeof calculateGrowth>;
};

function comparisonRows(
  channels: AnalyticsDashboardChannel[],
  windowDays: SocialWindow,
  metric: SocialMetric,
): ComparisonRow[] {
  return channels.map((channel) => {
    const rows = seriesInWindow(channel.series, windowDays);
    const initial = rows.find((row) => typeof row[metric] === "number")?.[metric];
    const latest = [...rows].reverse().find((row) => typeof row[metric] === "number")?.[metric];
    return {
      channel,
      initial: typeof initial === "number" ? initial : null,
      latest: typeof latest === "number" ? latest : null,
      growth: calculateGrowth(rows, metric),
    };
  });
}

function aggregateGrowth(rows: ComparisonRow[]): ReturnType<typeof calculateGrowth> {
  const starts = rows.map((row) => row.initial).filter((value): value is number => value !== null);
  const latestValues = rows
    .map((row) => row.latest)
    .filter((value): value is number => value !== null);
  if (starts.length === 0 || latestValues.length === 0) {
    return {
      absolute: null,
      percent: null,
      partial: rows.some((row) => row.growth.partial),
    };
  }
  const startTotal = starts.reduce((sum, value) => sum + value, 0);
  const latestTotal = latestValues.reduce((sum, value) => sum + value, 0);
  return {
    absolute: latestTotal - startTotal,
    percent: startTotal === 0 ? null : ((latestTotal - startTotal) / startTotal) * 100,
    partial: rows.some((row) => row.growth.partial),
  };
}

function comparisonScore(row: ComparisonRow, view: ComparisonView): number {
  if (view === "growth") return row.growth.percent ?? row.growth.absolute ?? -Infinity;
  return row.latest ?? -Infinity;
}

function transformComparisonToGrowth(
  comparison: ReturnType<typeof buildComparisonSeries>,
): ReturnType<typeof buildComparisonSeries> {
  return {
    dates: comparison.dates,
    lines: comparison.lines.map((line) => {
      const baseline = line.values.find((value): value is number => value !== null);
      return {
        ...line,
        values: line.values.map((value) =>
          value === null || baseline === undefined || baseline === 0
            ? value === null
              ? null
              : 0
            : ((value - baseline) / baseline) * 100,
        ),
      };
    }),
  };
}

export function SocialAnalyticsDashboard({
  channels,
  initialQuery,
  labels,
}: {
  channels: AnalyticsDashboardChannel[];
  initialQuery: string;
  labels: DashboardLabels;
}) {
  const router = useRouter();
  const initial = useMemo(() => parseAnalyticsSelection(initialQuery), [initialQuery]);
  const [selection, setSelection] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [hiddenLineIds, setHiddenLineIds] = useState<string[]>([]);

  const selectedChannels = useMemo(
    () => filterAnalyticsChannels(channels, selection.platforms, selection.channelIds),
    [channels, selection.channelIds, selection.platforms],
  );
  const commonMetrics = useMemo(
    () => commonMetricsForChannels(selectedChannels),
    [selectedChannels],
  );
  const metric = selectedMetricOrFallback(selection.metric, commonMetrics);
  const absoluteComparison = useMemo(
    () => buildComparisonSeries(selectedChannels, selection.window, metric),
    [metric, selectedChannels, selection.window],
  );
  const comparison = useMemo(
    () =>
      selection.view === "growth"
        ? transformComparisonToGrowth(absoluteComparison)
        : absoluteComparison,
    [absoluteComparison, selection.view],
  );
  const comparisonHiddenLineIds = useMemo(
    () => hiddenLineIds.filter((id) => comparison.lines.some((line) => line.channelId === id)),
    [comparison.lines, hiddenLineIds],
  );
  const visibleComparison = useMemo(
    () => ({
      dates: comparison.dates,
      lines: comparison.lines.filter((line) => !comparisonHiddenLineIds.includes(line.channelId)),
    }),
    [comparison.dates, comparison.lines, comparisonHiddenLineIds],
  );
  const rows = useMemo(
    () => comparisonRows(selectedChannels, selection.window, metric),
    [metric, selectedChannels, selection.window],
  );
  const rankedRows = useMemo(
    () =>
      [...rows].sort(
        (a, b) => comparisonScore(b, selection.view) - comparisonScore(a, selection.view),
      ),
    [rows, selection.view],
  );
  const aggregate = useMemo(() => aggregateGrowth(rows), [rows]);
  const leader = rankedRows[0];
  const latestValues = rows
    .map((row) => row.latest)
    .filter((value): value is number => value !== null);
  const totalLatest =
    latestValues.length > 0 ? latestValues.reduce((sum, value) => sum + value, 0) : null;

  function commit(next: typeof selection) {
    const normalized = {
      ...next,
      metric: selectedMetricOrFallback(
        next.metric,
        commonMetricsForChannels(
          filterAnalyticsChannels(channels, next.platforms, next.channelIds),
        ),
      ),
    };
    setSelection(normalized);
    const query = encodeAnalyticsSelection(normalized);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${query}`);
  }

  function togglePlatform(platform: AnalyticsDashboardChannel["platform"]) {
    const platforms = selection.platforms.includes(platform)
      ? selection.platforms.filter((value) => value !== platform)
      : [...selection.platforms, platform];
    commit({ ...selection, platforms });
  }

  function toggleChannel(channelId: string) {
    const visibleIds = filterAnalyticsChannels(channels, selection.platforms, []).map(
      (channel) => channel.id,
    );
    const selectedIds =
      selection.channelIds.length === 0
        ? visibleIds
        : selection.channelIds.filter((id) => visibleIds.includes(id));
    const nextIds = selectedIds.includes(channelId)
      ? selectedIds.filter((id) => id !== channelId)
      : [...selectedIds, channelId];
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => nextIds.includes(id));
    commit({ ...selection, channelIds: allVisibleSelected ? [] : nextIds });
  }

  function toggleLine(channelId: string) {
    const isHidden = comparisonHiddenLineIds.includes(channelId);
    if (!isHidden && comparison.lines.length - comparisonHiddenLineIds.length <= 1) return;
    setHiddenLineIds((current) =>
      isHidden ? current.filter((id) => id !== channelId) : [...current, channelId],
    );
  }

  function selectAllAccounts() {
    commit({ ...selection, channelIds: [] });
  }

  function downloadCsv() {
    if (selectedChannels.length === 0) return;
    const rows = selectedChannels.flatMap((channel) =>
      seriesInWindow(channel.series, selection.window).map((point) =>
        [
          channel.accountName,
          labels.platformLabels[channel.platform],
          point.metricDate,
          point.followerCount,
          point.reach,
          point.views,
          point.engagedAccounts,
          point.interactions,
          point.partial ? labels.partial : "",
        ]
          .map((value) => {
            const text = value === null ? "" : String(value);
            return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
          })
          .join(","),
      ),
    );
    const csv = [
      [
        labels.accountFilter,
        labels.platformFilter,
        labels.date,
        ...Object.values(labels.metricLabels),
        labels.partial,
      ].join(","),
      ...rows,
    ].join("\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `social-analytics-${selection.window}d.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function refreshData() {
    setRefreshing(true);
    try {
      router.refresh();
    } finally {
      window.setTimeout(() => setRefreshing(false), 600);
    }
  }

  return (
    <section className="space-y-6" data-testid="social-analytics-dashboard">
      <Card padding="md" data-testid="social-analytics-filters">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div>
              <p className="text-label text-fg-muted">{labels.platformFilter}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={selection.platforms.length === 0}
                  onClick={() => commit({ ...selection, platforms: [] })}
                  className={`text-body inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3 py-1.5 font-semibold transition-colors duration-200 ${selection.platforms.length === 0 ? "border-primary bg-primary/10 text-primary" : "border-border text-fg-secondary hover:bg-surface-subtle"}`}
                  data-testid="analytics-platform-all"
                >
                  {labels.allPlatforms}
                </button>
                {PLATFORMS.map((platform) => (
                  <button
                    key={platform}
                    type="button"
                    aria-pressed={selection.platforms.includes(platform)}
                    onClick={() => togglePlatform(platform)}
                    className={`text-body inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 font-semibold transition-colors duration-200 ${selection.platforms.includes(platform) ? "border-primary bg-primary/10 text-primary" : "border-border text-fg-secondary hover:bg-surface-subtle"}`}
                    data-testid={`analytics-platform-${platform}`}
                  >
                    <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
                    {labels.platformLabels[platform]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-label text-fg-muted">{labels.accountFilter}</p>
                <span className="text-label text-fg-muted" aria-live="polite">
                  {labels.selectedCount.replace("{count}", String(selectedChannels.length))}
                </span>
              </div>
              <ChannelMultiSelect
                channels={channels}
                selection={selection}
                selectedChannels={selectedChannels}
                labels={labels}
                onToggleChannel={toggleChannel}
                onSelectAll={selectAllAccounts}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={downloadCsv}
              className="border-border bg-surface text-fg-primary text-body hover:bg-surface-subtle inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border px-3 font-semibold transition-colors duration-200"
              data-testid="social-analytics-export"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {labels.export}
            </button>
            <button
              type="button"
              onClick={refreshData}
              disabled={refreshing}
              className="border-border bg-surface text-fg-primary text-body hover:bg-surface-subtle inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border px-3 font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="social-analytics-refresh"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {labels.refresh}
            </button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3" data-testid="social-analytics-kpis">
        <Kpi label={labels.channels} value={String(selectedChannels.length)} />
        <Kpi
          label={
            metric === "followerCount"
              ? labels.currentFollowers
              : interpolate(labels.latestMetric, { metric: labels.metricLabels[metric] })
          }
          value={formatNumber(totalLatest)}
        />
        <Kpi
          label={interpolate(labels.changeInPeriod, { count: selection.window })}
          value={formatSigned(aggregate.absolute)}
          detail={formatPercent(aggregate.percent)}
        />
      </div>

      <Card padding="lg" data-testid="social-comparison-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-title-section text-fg-primary font-semibold">
              {labels.comparisonTitle}
            </h2>
            <p className="text-body text-fg-muted mt-1">{labels.comparisonDescription}</p>
          </div>
          <div className="flex flex-wrap gap-4" data-testid="social-analytics-controls">
            <ControlGroup label={labels.period}>
              {([7, 30, 90] as const).map((days) => (
                <ControlButton
                  key={days}
                  active={selection.window === days}
                  testId={`window-${days}`}
                  onClick={() => commit({ ...selection, window: days })}
                >
                  {labels.days.replace("{count}", String(days))}
                </ControlButton>
              ))}
            </ControlGroup>
            <ControlGroup label={labels.metric}>
              {commonMetrics.map((candidate) => (
                <ControlButton
                  key={candidate}
                  active={metric === candidate}
                  testId={`metric-${candidate}`}
                  onClick={() => commit({ ...selection, metric: candidate })}
                >
                  {labels.metricLabels[candidate]}
                </ControlButton>
              ))}
            </ControlGroup>
            <ControlGroup label={labels.comparisonMode}>
              <ControlButton
                active={selection.view === "absolute"}
                testId="comparison-view-absolute"
                onClick={() => commit({ ...selection, view: "absolute" })}
              >
                {labels.comparisonAbsolute}
              </ControlButton>
              <ControlButton
                active={selection.view === "growth"}
                testId="comparison-view-growth"
                onClick={() => commit({ ...selection, view: "growth" })}
              >
                {labels.comparisonGrowth}
              </ControlButton>
            </ControlGroup>
          </div>
        </div>
        {leader ? (
          <div
            className="border-primary/30 bg-primary/5 mt-6 rounded-lg border px-4 py-3"
            data-testid="comparison-insight"
          >
            <p className="text-label text-primary font-semibold">{labels.comparisonInsightLabel}</p>
            <p className="text-body text-fg-primary mt-1">
              {leader.growth.percent === null
                ? interpolate(labels.comparisonInsightNoGrowth, {
                    leader: leader.channel.accountName,
                    value: formatNumber(leader.latest),
                    metric: labels.metricLabels[metric],
                  })
                : interpolate(labels.comparisonInsight, {
                    leader: leader.channel.accountName,
                    value: formatNumber(leader.latest),
                    metric: labels.metricLabels[metric],
                    change: formatSigned(leader.growth.absolute),
                    percent: formatPercent(leader.growth.percent),
                    count: selection.window,
                  })}
            </p>
          </div>
        ) : null}
        {commonMetrics.length === 0 ? (
          <p
            className="text-body text-fg-muted border-border bg-surface-subtle mt-6 rounded-md border p-6"
            data-testid="social-no-comparable-metrics"
          >
            {labels.noComparableMetrics}
          </p>
        ) : comparison.dates.length === 0 ? (
          <p
            className="text-body text-fg-muted border-border bg-surface-subtle mt-6 rounded-md border p-6"
            data-testid="social-comparison-no-data"
          >
            {labels.noData}
          </p>
        ) : (
          <ComparisonChart
            comparison={comparison}
            visibleComparison={visibleComparison}
            hiddenLineIds={comparisonHiddenLineIds}
            onToggleLine={toggleLine}
            labels={labels}
            metric={metric}
            view={selection.view}
          />
        )}
      </Card>

      <MetricComparisonTable rows={rankedRows} metric={metric} labels={labels} />
    </section>
  );
}

function ChannelMultiSelect({
  channels,
  selection,
  selectedChannels,
  labels,
  onToggleChannel,
  onSelectAll,
}: {
  channels: AnalyticsDashboardChannel[];
  selection: ReturnType<typeof parseAnalyticsSelection>;
  selectedChannels: AnalyticsDashboardChannel[];
  labels: DashboardLabels;
  onToggleChannel: (channelId: string) => void;
  onSelectAll: () => void;
}) {
  const visibleChannels = channels.filter(
    (channel) => selection.platforms.length === 0 || selection.platforms.includes(channel.platform),
  );
  const allVisibleSelected =
    visibleChannels.length > 0 &&
    visibleChannels.every(
      (channel) => selection.channelIds.length === 0 || selection.channelIds.includes(channel.id),
    );

  return (
    <details className="relative mt-2 max-w-4xl" data-testid="analytics-account-multiselect">
      <summary className="border-border bg-surface text-fg-primary text-body hover:bg-surface-subtle focus-visible:ring-primary inline-flex min-h-11 w-full max-w-md cursor-pointer list-none items-center justify-between gap-3 rounded-md border px-3 font-semibold transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 truncate">
          {allVisibleSelected
            ? labels.allAccounts
            : labels.selectedCount.replace("{count}", String(selectedChannels.length))}
        </span>
        <ChevronDown className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />
      </summary>
      <div className="border-border bg-surface absolute z-20 mt-2 w-full max-w-md rounded-md border p-2 shadow-lg">
        <div className="border-border flex items-center justify-between gap-3 border-b px-2 pb-2">
          <p className="text-label text-fg-muted">{labels.accountFilterDescription}</p>
          <button
            type="button"
            className="text-label text-primary hover:bg-primary/10 focus-visible:ring-primary min-h-11 shrink-0 cursor-pointer rounded-md px-2 font-semibold focus-visible:ring-2"
            onClick={onSelectAll}
          >
            {labels.selectAll}
          </button>
        </div>
        <div
          className="max-h-72 overflow-y-auto pt-1"
          role="group"
          aria-label={labels.accountFilter}
        >
          {visibleChannels.length === 0 ? (
            <p className="text-body text-fg-muted px-2 py-3">{labels.noData}</p>
          ) : (
            visibleChannels.map((channel) => {
              const checked =
                selection.channelIds.length === 0 || selection.channelIds.includes(channel.id);
              return (
                <label
                  key={channel.id}
                  data-testid={`analytics-account-option-${channel.id}`}
                  className="text-body text-fg-secondary hover:bg-surface-subtle flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggleChannel(channel.id)}
                    aria-label={`${channel.accountName} (${labels.platformLabels[channel.platform]})`}
                  />
                  <PlatformIcon platform={channel.platform} className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{channel.accountName}</span>
                  <span className="text-label text-fg-muted max-w-32 truncate">
                    {labels.platformLabels[channel.platform]}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </div>
    </details>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card padding="md">
      <p className="text-label text-fg-muted">{label}</p>
      <p className="text-title-section text-fg-primary mt-1 font-semibold">{value}</p>
      {detail ? <p className="text-label text-fg-muted mt-1">{detail}</p> : null}
    </Card>
  );
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-label text-fg-muted mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function ControlButton({
  active,
  children,
  onClick,
  testId,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...(active ? { "aria-current": "page" } : {})}
      onClick={onClick}
      className={`text-label min-h-11 cursor-pointer rounded-md border px-3 font-semibold transition-colors duration-200 ${active ? "border-primary bg-primary/10 text-primary" : "border-border text-fg-secondary hover:bg-surface-subtle"}`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

function ComparisonChart({
  comparison,
  visibleComparison,
  hiddenLineIds,
  onToggleLine,
  labels,
  metric,
  view,
}: {
  comparison: ReturnType<typeof buildComparisonSeries>;
  visibleComparison: ReturnType<typeof buildComparisonSeries>;
  hiddenLineIds: string[];
  onToggleLine: (channelId: string) => void;
  labels: DashboardLabels;
  metric: SocialMetric;
  view: ComparisonView;
}) {
  const ticks = chartTicks(
    visibleComparison.lines.flatMap((line) => line.values),
    view,
  );
  const min = ticks[0] ?? 0;
  const max = ticks[ticks.length - 1] ?? 1;
  const x = (index: number) => 52 + (index * 516) / Math.max(1, comparison.dates.length - 1);
  const y = (value: number) => 188 - ((value - min) / Math.max(1, max - min)) * 148;
  return (
    <div className="mt-6" data-testid="social-comparison-chart">
      <svg
        viewBox="0 0 600 220"
        className="w-full overflow-visible"
        role="img"
        aria-label={`${labels.comparisonTitle}: ${labels.metricLabels[metric]}`}
        preserveAspectRatio="none"
      >
        {ticks.map((tick) => (
          <g key={tick} aria-hidden="true">
            <line
              x1="52"
              x2="568"
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-border"
              strokeDasharray={tick === 0 ? undefined : "2 4"}
            />
            <text x="42" y={y(tick) + 4} textAnchor="end" className="fill-fg-muted" fontSize="10">
              {formatChartValue(tick, view)}
            </text>
          </g>
        ))}
        {visibleComparison.lines.map((line) => {
          const lineIndex = comparison.lines.findIndex(
            (candidate) => candidate.channelId === line.channelId,
          );
          return (
            <g
              key={line.channelId}
              role="group"
              aria-label={`${line.label} (${labels.platformLabels[line.platform]})`}
            >
              {segments(line.values).map((segment, segmentIndex) => (
                <path
                  key={`${line.channelId}-${segmentIndex}`}
                  d={segment
                    .map(
                      (pointIndex, index) =>
                        `${index === 0 ? "M" : "L"}${x(pointIndex)},${y(line.values[pointIndex] ?? 0)}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke={COMPARISON_COLORS[lineIndex % COMPARISON_COLORS.length]}
                  strokeDasharray={
                    COMPARISON_LINE_STYLES[lineIndex % COMPARISON_LINE_STYLES.length]
                  }
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {line.values.map((value, pointIndex) =>
                value === null ? null : (
                  <circle
                    key={`${line.channelId}-point-${pointIndex}`}
                    cx={x(pointIndex)}
                    cy={y(value)}
                    r="3"
                    fill={COMPARISON_COLORS[lineIndex % COMPARISON_COLORS.length]}
                  >
                    <title>
                      {`${line.label} · ${comparison.dates[pointIndex] ?? ""}: ${formatChartValue(value, view)}`}
                    </title>
                  </circle>
                ),
              )}
            </g>
          );
        })}
        <g aria-hidden="true">
          <text x="52" y="210" className="fill-fg-muted" fontSize="10">
            {comparison.dates[0] ?? ""}
          </text>
          {comparison.dates.length > 1 ? (
            <text x="568" y="210" textAnchor="end" className="fill-fg-muted" fontSize="10">
              {comparison.dates[comparison.dates.length - 1] ?? ""}
            </text>
          ) : null}
        </g>
      </svg>
      <div
        className="border-border bg-surface-subtle mt-3 flex flex-wrap gap-2 rounded-md border p-2"
        data-testid="social-comparison-legend"
        role="group"
        aria-label={labels.comparisonLegend}
      >
        {comparison.lines.map((line, index) => (
          <span key={line.channelId} className="inline-flex">
            <button
              type="button"
              aria-pressed={!hiddenLineIds.includes(line.channelId)}
              aria-label={`${hiddenLineIds.includes(line.channelId) ? labels.showSeries : labels.hideSeries}: ${line.label}`}
              disabled={
                !hiddenLineIds.includes(line.channelId) && visibleComparison.lines.length <= 1
              }
              onClick={() => onToggleLine(line.channelId)}
              className={`text-label text-fg-secondary hover:bg-surface focus-visible:ring-primary inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-2 font-semibold transition-colors duration-200 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${hiddenLineIds.includes(line.channelId) ? "opacity-50" : ""}`}
              data-testid={`comparison-legend-${line.channelId}`}
            >
              {hiddenLineIds.includes(line.channelId) ? (
                <EyeOff className="text-fg-muted h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Eye className="text-primary h-3.5 w-3.5" aria-hidden="true" />
              )}
              <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden="true">
                <line
                  x1="1"
                  x2="19"
                  y1="4"
                  y2="4"
                  stroke={COMPARISON_COLORS[index % COMPARISON_COLORS.length]}
                  strokeDasharray={COMPARISON_LINE_STYLES[index % COMPARISON_LINE_STYLES.length]}
                  strokeLinecap="round"
                  strokeWidth="2.5"
                />
              </svg>
              <PlatformIcon platform={line.platform} className="h-3.5 w-3.5 shrink-0" />
              <span className="max-w-40 truncate">{line.label}</span>
              <span className="text-fg-muted">({labels.platformLabels[line.platform]})</span>
            </button>
          </span>
        ))}
      </div>
      <details className="border-border mt-4 rounded-md border" data-testid="comparison-data-table">
        <summary className="text-body text-fg-secondary flex min-h-11 cursor-pointer items-center px-3 font-semibold">
          {labels.dataTable}
        </summary>
        <div className="border-border overflow-x-auto border-t">
          <table className="text-body w-full min-w-[560px] text-start">
            <thead className="bg-surface-subtle text-label text-fg-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">{labels.date}</th>
                {visibleComparison.lines.map((line) => (
                  <th key={line.channelId} className="px-3 py-2 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <PlatformIcon platform={line.platform} className="h-3.5 w-3.5" />
                      {line.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.dates.map((date, dateIndex) => (
                <tr key={date} className="border-border border-t">
                  <td className="px-3 py-2">{date}</td>
                  {visibleComparison.lines.map((line) => (
                    <td key={line.channelId} className="px-3 py-2">
                      {formatChartValue(line.values[dateIndex] ?? null, view)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function chartTicks(values: Array<number | null>, view: ComparisonView): number[] {
  const numeric = values.filter((value): value is number => value !== null);
  if (numeric.length === 0) return [0, 1, 2, 3, 4];
  const min = Math.min(0, ...numeric);
  const max = Math.max(0, ...numeric);
  if (min === max) {
    return view === "growth" ? [-2, -1, 0, 1, 2] : [0, 1, 2, 3, 4];
  }
  const roughStep = (max - min || 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let tick = start; tick <= end + step / 2; tick += step) {
    ticks.push(Number(tick.toFixed(6)));
  }
  if (view === "growth" && !ticks.includes(0)) ticks.push(0);
  return ticks.sort((a, b) => a - b);
}

function formatChartValue(value: number | null, view: ComparisonView): string {
  if (value === null) return "—";
  return `${formatNumber(value)}${view === "growth" ? "%" : ""}`;
}

function segments(values: Array<number | null>): number[][] {
  const result: number[][] = [];
  let current: number[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 0) result.push(current);
      current = [];
    } else {
      current.push(index);
    }
  });
  if (current.length > 0) result.push(current);
  return result;
}

function MetricComparisonTable({
  rows,
  metric,
  labels,
}: {
  rows: ComparisonRow[];
  metric: SocialMetric;
  labels: DashboardLabels;
}) {
  return (
    <Card padding="lg" data-testid="social-channel-ranking">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-title-section text-fg-primary font-semibold">{labels.ranking}</h2>
          <p className="text-body text-fg-muted mt-1">{labels.metricLabels[metric]}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-body text-fg-muted border-border bg-surface-subtle mt-4 rounded-md border p-4">
          {labels.noData}
        </p>
      ) : (
        <div className="border-border mt-4 overflow-x-auto rounded-md border">
          <table className="text-body w-full min-w-[620px] text-start">
            <thead className="bg-surface-subtle text-label text-fg-muted">
              <tr>
                <th className="px-3 py-3 font-semibold">{labels.channel}</th>
                <th className="px-3 py-3 text-end font-semibold">{labels.latestValue}</th>
                <th className="px-3 py-3 text-end font-semibold">{labels.change}</th>
                <th className="px-3 py-3 font-semibold">{labels.dataStatus}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ channel, latest, growth }) => {
                const status = channel.latestProviderErrorCode
                  ? labels.providerDataLimited
                  : latest === null
                    ? labels.noMetricData
                    : growth.partial
                      ? labels.partialData
                      : labels.healthy;
                return (
                  <tr key={channel.id} className="border-border border-t">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <PlatformIcon platform={channel.platform} tile />
                        <div className="min-w-0">
                          <p className="text-fg-primary truncate font-semibold">
                            {channel.accountName}
                          </p>
                          <p className="text-label text-fg-muted">
                            {labels.platformLabels[channel.platform]}
                            {channel.handle ? ` · @${channel.handle}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-end font-semibold">{formatNumber(latest)}</td>
                    <td className="px-3 py-3 text-end">
                      <span className="font-semibold">{formatSigned(growth.absolute)}</span>
                      <span className="text-label text-fg-muted ms-1">
                        {formatPercent(growth.percent)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-label border-border bg-surface-subtle inline-flex rounded-full border px-2 py-1">
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export type { DashboardLabels };
