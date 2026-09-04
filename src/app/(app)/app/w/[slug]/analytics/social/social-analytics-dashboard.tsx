"use client";

import { useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
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
  allPlatforms: string;
  clear: string;
  selectAll: string;
  selectedCount: string;
  comparisonTitle: string;
  comparisonDescription: string;
  noComparableMetrics: string;
  noData: string;
  refresh: string;
  export: string;
  channels: string;
  currentFollowers: string;
  selectedMetric: string;
  window: string;
  days: string;
  details: string;
  date: string;
  partial: string;
  metricLabels: Record<SocialMetric, string>;
  platformLabels: Record<string, string>;
};

const PLATFORMS: AnalyticsDashboardChannel["platform"][] = ["facebook", "instagram", "tiktok"];

function formatNumber(value: number | null): string {
  return value === null ? "—" : value.toLocaleString();
}

function selectedMetricOrFallback(
  requested: SocialMetric,
  commonMetrics: SocialMetric[],
): SocialMetric {
  return commonMetrics.includes(requested) ? requested : (commonMetrics[0] ?? requested);
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

  const selectedChannels = useMemo(
    () => filterAnalyticsChannels(channels, selection.platforms, selection.channelIds),
    [channels, selection.channelIds, selection.platforms],
  );
  const commonMetrics = useMemo(
    () => commonMetricsForChannels(selectedChannels),
    [selectedChannels],
  );
  const metric = selectedMetricOrFallback(selection.metric, commonMetrics);
  const comparison = useMemo(
    () => buildComparisonSeries(selectedChannels, selection.window, metric),
    [metric, selectedChannels, selection.window],
  );

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
    const selectedIds = selection.channelIds.length === 0 ? visibleIds : [...selection.channelIds];
    const nextIds = selectedIds.includes(channelId)
      ? selectedIds.filter((id) => id !== channelId)
      : [...selectedIds, channelId];
    const allVisibleSelected =
      visibleIds.length > 0 && visibleIds.every((id) => nextIds.includes(id));
    commit({ ...selection, channelIds: allVisibleSelected ? [] : nextIds });
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
              <div className="mt-2 flex max-w-4xl flex-wrap gap-x-4 gap-y-2">
                <label className="text-body text-fg-secondary inline-flex min-h-11 cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={selection.channelIds.length === 0}
                    onCheckedChange={selectAllAccounts}
                    aria-label={labels.selectAll}
                  />
                  {labels.selectAll}
                </label>
                {channels
                  .filter(
                    (channel) =>
                      selection.platforms.length === 0 ||
                      selection.platforms.includes(channel.platform),
                  )
                  .map((channel) => {
                    const checked =
                      selection.channelIds.length === 0 ||
                      selection.channelIds.includes(channel.id);
                    return (
                      <label
                        key={channel.id}
                        className="text-body text-fg-secondary inline-flex min-h-11 cursor-pointer items-center gap-2"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleChannel(channel.id)}
                          aria-label={channel.accountName}
                        />
                        <span className="max-w-48 truncate">{channel.accountName}</span>
                      </label>
                    );
                  })}
              </div>
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
          label={labels.currentFollowers}
          value={formatNumber(
            selectedChannels.reduce((sum, channel) => {
              const latest = [...channel.series]
                .reverse()
                .find((point) => point.followerCount !== null);
              return sum + (latest?.followerCount ?? 0);
            }, 0),
          )}
        />
        <Kpi
          label={`${labels.selectedMetric} · ${labels.days.replace("{count}", String(selection.window))}`}
          value={formatNumber(
            selectedChannels.reduce((sum, channel) => {
              const latest = [...seriesInWindow(channel.series, selection.window)]
                .reverse()
                .find((point) => typeof point[metric] === "number");
              return sum + (typeof latest?.[metric] === "number" ? latest[metric] : 0);
            }, 0),
          )}
        />
      </div>

      <Card padding="lg" data-testid="social-comparison-panel">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-title-section text-fg-primary font-semibold">
              {labels.comparisonTitle}
            </h2>
            <p className="text-body text-fg-muted mt-1">{labels.comparisonDescription}</p>
          </div>
          <div className="flex flex-wrap gap-2" data-testid="social-analytics-controls">
            {([7, 30, 90] as const).map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={selection.window === days}
                {...(selection.window === days ? { "aria-current": "page" } : {})}
                onClick={() => commit({ ...selection, window: days })}
                className={`text-label min-h-11 cursor-pointer rounded-md border px-3 font-semibold transition-colors duration-200 ${selection.window === days ? "border-primary bg-primary/10 text-primary" : "border-border text-fg-secondary hover:bg-surface-subtle"}`}
                data-testid={`window-${days}`}
              >
                {labels.days.replace("{count}", String(days))}
              </button>
            ))}
            {commonMetrics.map((candidate) => (
              <button
                key={candidate}
                type="button"
                aria-pressed={metric === candidate}
                onClick={() => commit({ ...selection, metric: candidate })}
                className={`text-label min-h-11 cursor-pointer rounded-md border px-3 font-semibold transition-colors duration-200 ${metric === candidate ? "border-primary bg-primary/10 text-primary" : "border-border text-fg-secondary hover:bg-surface-subtle"}`}
                data-testid={`metric-${candidate}`}
              >
                {labels.metricLabels[candidate]}
              </button>
            ))}
          </div>
        </div>
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
          <ComparisonChart comparison={comparison} labels={labels} metric={metric} />
        )}
      </Card>

      <div className="space-y-4" data-testid="social-channel-details">
        <h2 className="text-title-section text-fg-primary font-semibold">{labels.details}</h2>
        {selectedChannels.map((channel) => (
          <ChannelDetail
            key={channel.id}
            channel={channel}
            windowDays={selection.window}
            labels={labels}
          />
        ))}
      </div>
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card padding="md">
      <p className="text-label text-fg-muted">{label}</p>
      <p className="text-title-section text-fg-primary mt-1 font-semibold">{value}</p>
    </Card>
  );
}

function ComparisonChart({
  comparison,
  labels,
  metric,
}: {
  comparison: ReturnType<typeof buildComparisonSeries>;
  labels: DashboardLabels;
  metric: SocialMetric;
}) {
  const max = Math.max(
    1,
    ...comparison.lines.flatMap((line) =>
      line.values.filter((value): value is number => value !== null),
    ),
  );
  const colors = ["#3525cd", "#dc5f00", "#16825d", "#a23a8c", "#087ea4", "#7a5c00"];
  const lineStyles = [undefined, "8 4", "2 4", "12 4 2 4", "4 4", "8 2 2 2"];
  const x = (index: number) => 52 + (index * 516) / Math.max(1, comparison.dates.length - 1);
  const y = (value: number) => 188 - (value / max) * 148;
  return (
    <div className="mt-6" data-testid="social-comparison-chart">
      <svg
        viewBox="0 0 600 220"
        className="w-full"
        role="img"
        aria-label={`${labels.comparisonTitle}: ${labels.metricLabels[metric]}`}
        preserveAspectRatio="none"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <line
            key={ratio}
            x1="52"
            x2="568"
            y1={188 - ratio * 148}
            y2={188 - ratio * 148}
            className="stroke-border"
            strokeDasharray={ratio === 0 ? undefined : "2 4"}
          />
        ))}
        {comparison.lines.map((line, lineIndex) => (
          <g key={line.channelId}>
            {segments(line.values).map((segment, segmentIndex) =>
              segment.length === 1 ? (
                <circle
                  key={`${line.channelId}-${segmentIndex}`}
                  cx={x(segment[0] ?? 0)}
                  cy={y(line.values[segment[0] ?? 0] ?? 0)}
                  r="3.5"
                  fill={colors[lineIndex % colors.length]}
                />
              ) : (
                <path
                  key={`${line.channelId}-${segmentIndex}`}
                  d={segment
                    .map(
                      (pointIndex, index) =>
                        `${index === 0 ? "M" : "L"}${x(pointIndex)},${y(line.values[pointIndex] ?? 0)}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke={colors[lineIndex % colors.length]}
                  strokeDasharray={lineStyles[lineIndex % lineStyles.length]}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ),
            )}
          </g>
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2" data-testid="social-comparison-legend">
        {comparison.lines.map((line, index) => (
          <span
            key={line.channelId}
            className="text-label text-fg-secondary inline-flex items-center gap-1.5"
          >
            <svg width="20" height="8" viewBox="0 0 20 8" aria-hidden="true">
              <line
                x1="1"
                x2="19"
                y1="4"
                y2="4"
                stroke={colors[index % colors.length]}
                strokeDasharray={lineStyles[index % lineStyles.length]}
                strokeLinecap="round"
                strokeWidth="2.5"
              />
            </svg>
            <span>{line.label}</span>
            <span className="text-fg-muted">({labels.platformLabels[line.platform]})</span>
          </span>
        ))}
      </div>
    </div>
  );
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

function ChannelDetail({
  channel,
  windowDays,
  labels,
}: {
  channel: AnalyticsDashboardChannel;
  windowDays: SocialWindow;
  labels: DashboardLabels;
}) {
  const rows = seriesInWindow(channel.series, windowDays);
  const growth = calculateGrowth(rows, "followerCount");
  const supported = [
    "followerCount",
    "reach",
    "views",
    ...(channel.series.some((row) => row.engagedAccounts !== null)
      ? (["engagedAccounts"] as const)
      : []),
    "interactions",
  ] as const;
  return (
    <Card padding="lg" data-testid={`social-card-${channel.id}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <PlatformIcon platform={channel.platform} tile />
          <div>
            <h3 className="text-title-card text-fg-primary font-semibold">{channel.accountName}</h3>
            <p className="text-label text-fg-muted">
              {labels.platformLabels[channel.platform]}
              {channel.handle ? ` · @${channel.handle}` : ""}
            </p>
          </div>
        </div>
        <p className="text-label text-fg-muted">
          {growth.absolute === null
            ? "—"
            : `${growth.absolute > 0 ? "+" : ""}${growth.absolute.toLocaleString()}`}
        </p>
      </header>
      {channel.latestProviderErrorCode ? (
        <p className="border-warning/30 bg-warning/5 text-warning text-label mt-4 rounded-md border px-3 py-2">
          {channel.latestProviderErrorCode}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-body text-fg-muted mt-4">{labels.noData}</p>
      ) : (
        <div className="border-border mt-4 overflow-x-auto rounded-md border">
          <table className="text-body w-full min-w-[620px] text-start">
            <thead className="bg-surface-subtle text-label text-fg-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">{labels.date}</th>
                {supported.map((metric) => (
                  <th key={metric} className="px-3 py-2 font-semibold">
                    {labels.metricLabels[metric]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.metricDate} className="border-border border-t">
                  <td className="px-3 py-2">{row.metricDate}</td>
                  {supported.map((metric) => (
                    <td key={metric} className="px-3 py-2">
                      {formatNumber(row[metric])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export type { DashboardLabels };
