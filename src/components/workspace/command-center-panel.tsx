import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Eye,
  Heart,
  RefreshCw,
  Timer,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DashboardPanel } from "@/components/workspace/dashboard-panel";
import { CommandCenterRefresh } from "@/components/workspace/command-center-refresh";
import { CommandCenterSectionNav } from "@/components/workspace/command-center-section-nav";
import {
  CommandCenterContentInventory,
  type CommandCenterContentInventoryLabels,
} from "@/components/workspace/command-center-content-inventory";
import { ResearchBookmarkButton } from "@/components/workspace/research-bookmark-button";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import type { CommandCenterLengthBandKey, CommandCenterSummary } from "@/lib/social/command-center";

export type CommandCenterLabels = {
  title: string;
  eyebrow: string;
  description: string;
  analysisWindow: string;
  last30Days: string;
  last90Days: string;
  refreshData: string;
  refreshingData: string;
  refreshSuccess: string;
  refreshPartial: string;
  refreshError: string;
  viewAnalytics: string;
  viewResearch: string;
  freshness: string;
  noDataTitle: string;
  noDataDescription: string;
  connectChannels: string;
  setupTitle: string;
  setupDescription: string;
  setupConnectAccount: string;
  setupCollectSignals: string;
  setupReviewAnalytics: string;
  setupOpenChannels: string;
  setupOpenAnalytics: string;
  setupComplete: string;
  setupNext: string;
  partial: string;
  followers: string;
  followerChange: string;
  reach: string;
  views: string;
  interactions: string;
  engagementRate: string;
  trendTitle: string;
  trendDescription: string;
  trendTable: string;
  date: string;
  strongestAccounts: string;
  strongestAccountsDescription: string;
  channelPerformance: string;
  channelPerformanceDescription: string;
  noPerformanceData: string;
  topContent: string;
  topContentDescription: string;
  contentInventory: CommandCenterContentInventoryLabels;
  noContentData: string;
  outlier: string;
  likes: string;
  comments: string;
  saved: string;
  shares: string;
  openSource: string;
  createBriefFromPost: string;
  saveResearch: string;
  savedResearch: string;
  researchSaveError: string;
  bestTime: string;
  bestTimeDescription: string;
  noBestTimeData: string;
  sampleSize: string;
  averageViews: string;
  bestVideoLength: string;
  bestVideoLengthDescription: string;
  noLengthData: string;
  medianViews: string;
  relativePerformance: string;
  under15Seconds: string;
  fifteenTo30Seconds: string;
  thirtyTo60Seconds: string;
  over60Seconds: string;
  noAccountData: string;
  planningSignal: string;
  planningSignalDescription: string;
  openPlanning: string;
  sourceNote: string;
  latestMetricDate: string;
  coverage: string;
  notEnoughData: string;
  dataHealth: string;
  dataHealthDescription: string;
  healthy: string;
  degraded: string;
  stalled: string;
  noSync: string;
  reviewData: string;
  watchlistTitle: string;
  watchlistDescription: string;
  watchlistSourceOnly: string;
  watchlistProviderAvailable: string;
  watchlistProviderUnsupported: string;
  watchlistProviderError: string;
};

export type CommandCenterWatchlistAccount = {
  id: string;
  platform: "instagram" | "facebook" | "tiktok" | "youtube";
  handle: string;
  displayName: string | null;
  sourceUrl: string;
  providerStatus: "manual" | "available" | "unsupported" | "error";
};

function formatNumber(value: number | null, locale: string): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat(locale, { numberingSystem: "latn", maximumFractionDigits: 0 }).format(
        value,
      );
}

function formatPostMetric(value: number | null, label: string, locale: string): string | null {
  return value === null ? null : `${formatNumber(value, locale)} ${label}`;
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

type TrendGeometry = {
  linePath: string;
  areaPath: string;
  points: Array<{ x: number; y: number; value: number }>;
};

function trendGeometry(summary: CommandCenterSummary): TrendGeometry | null {
  const points = summary.trend
    .map((point) => point.followerCount)
    .flatMap((value, index) => (typeof value === "number" ? [{ value, index }] : []));
  if (points.length < 2) return null;
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const range = Math.max(1, max - min);
  const coordinates = points.map((point, index) => {
    const x = 4 + (index * 92) / Math.max(1, points.length - 1);
    const y = 92 - ((point.value - min) / range) * 78;
    return { x, y, value: point.value };
  });
  const linePath = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (!first || !last) return null;
  return {
    linePath,
    areaPath: `${linePath} L${last.x},92 L${first.x},92 Z`,
    points: coordinates,
  };
}

function lengthBandLabel(labels: CommandCenterLabels, key: CommandCenterLengthBandKey): string {
  if (key === "under15") return labels.under15Seconds;
  if (key === "15to30") return labels.fifteenTo30Seconds;
  if (key === "30to60") return labels.thirtyTo60Seconds;
  return labels.over60Seconds;
}

export function CommandCenterPanel({
  summary,
  locale,
  timezone,
  analyticsHref,
  researchHref,
  channelsHref,
  planningHref,
  workspaceSlug,
  canRefresh,
  savedResearchObservationIds,
  canSaveResearch,
  watchlist,
  labels,
  windowDays,
  window30Href,
  window90Href,
}: {
  summary: CommandCenterSummary;
  locale: string;
  timezone: string;
  analyticsHref: string;
  researchHref: string;
  channelsHref: string;
  planningHref: string;
  workspaceSlug: string;
  canRefresh: boolean;
  savedResearchObservationIds: ReadonlySet<string>;
  canSaveResearch: boolean;
  watchlist: CommandCenterWatchlistAccount[];
  labels: CommandCenterLabels;
  windowDays: 30 | 90;
  window30Href: string;
  window90Href: string;
}) {
  const hasData = summary.channelsWithData > 0;
  const trend = trendGeometry(summary);
  const asOf = summary.lastSyncedAt
    ? formatRelativeDate(summary.lastSyncedAt, new Date(), locale as "en" | "ar")
    : null;
  const bestTimeDay = summary.content.bestTime
    ? new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
        new Date(Date.UTC(2024, 0, 7 + summary.content.bestTime.dayOfWeek)),
      )
    : null;
  const bestTimeHour = summary.content.bestTime
    ? new Intl.DateTimeFormat(locale, {
        hour: "numeric",
        hourCycle: "h23",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(2024, 0, 1, summary.content.bestTime.hour)))
    : null;
  const heatmapHours = [6, 9, 12, 15, 18, 21] as const;
  const heatmapDays = Array.from({ length: 7 }, (_, day) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 0, 7 + day)),
    ),
  );
  const timeSlotsByKey = new Map(
    summary.content.timeSlots.map((slot) => [`${slot.dayOfWeek}:${slot.hour}`, slot]),
  );
  const maxSlotViews = Math.max(1, ...summary.content.timeSlots.map((slot) => slot.averageViews));
  const setupSteps = [
    {
      title: labels.setupConnectAccount,
      href: channelsHref,
      complete: summary.channelCount > 0,
      action: labels.setupOpenChannels,
    },
    {
      title: labels.setupCollectSignals,
      href: analyticsHref,
      complete: summary.channelsWithData > 0,
      action: labels.setupOpenAnalytics,
    },
    {
      title: labels.setupReviewAnalytics,
      href: analyticsHref,
      complete: hasData,
      action: labels.setupOpenAnalytics,
    },
  ];

  return (
    <section
      className="space-y-4"
      data-testid="command-center-panel"
      aria-labelledby="command-center-title"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label text-fg-muted font-semibold tracking-wide uppercase">
            {labels.eyebrow}
          </p>
          <h2
            id="command-center-title"
            className="text-title-section text-fg-primary font-semibold"
          >
            {labels.title}
          </h2>
          <p className="text-body text-fg-secondary mt-1 max-w-3xl">{labels.description}</p>
          {asOf ? (
            <p className="text-label text-fg-muted mt-2">
              {labels.freshness}: {asOf}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="border-border bg-surface-subtle flex items-center gap-1 rounded-[var(--radius-control)] border p-1"
            aria-label={labels.analysisWindow}
            data-testid="command-center-window"
          >
            <span className="text-label text-fg-muted px-2 font-semibold">
              {labels.analysisWindow}
            </span>
            <Link
              href={window30Href}
              aria-current={windowDays === 30 ? "page" : undefined}
              className={`text-label rounded-[calc(var(--radius-control)-2px)] px-2 py-1 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none ${windowDays === 30 ? "bg-surface text-fg-primary" : "text-fg-secondary hover:bg-surface hover:text-fg-primary"}`}
            >
              {labels.last30Days}
            </Link>
            <Link
              href={window90Href}
              aria-current={windowDays === 90 ? "page" : undefined}
              className={`text-label rounded-[calc(var(--radius-control)-2px)] px-2 py-1 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none ${windowDays === 90 ? "bg-surface text-fg-primary" : "text-fg-secondary hover:bg-surface hover:text-fg-primary"}`}
            >
              {labels.last90Days}
            </Link>
          </div>
          {canRefresh ? (
            <CommandCenterRefresh
              slug={workspaceSlug}
              labels={{
                refresh: labels.refreshData,
                refreshing: labels.refreshingData,
                success: labels.refreshSuccess,
                partial: labels.refreshPartial,
                error: labels.refreshError,
              }}
            />
          ) : null}
          <Button variant="outline" asChild>
            <Link href={analyticsHref}>
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              {labels.viewAnalytics}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href={researchHref}>{labels.viewResearch}</Link>
          </Button>
        </div>
      </div>

      {summary.channelCount > 0 && hasData ? (
        <CommandCenterSectionNav
          title={labels.title}
          items={[
            { id: "command-center-health", label: labels.dataHealth },
            { id: "command-center-trend", label: labels.trendTitle },
            { id: "command-center-performance", label: labels.channelPerformance },
            { id: "command-center-content", label: labels.topContent },
            { id: "command-center-inventory", label: labels.contentInventory.title },
            { id: "command-center-recommendations", label: labels.bestTime },
            { id: "command-center-planning-signal", label: labels.planningSignal },
            ...(watchlist.length > 0
              ? [{ id: "command-center-watchlist", label: labels.watchlistTitle }]
              : []),
          ]}
        />
      ) : null}

      {summary.channelCount > 0 ? (
        <DashboardPanel
          id="command-center-health"
          title={labels.dataHealth}
          description={labels.dataHealthDescription}
          data-testid="command-center-health"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {summary.health.healthy} {labels.healthy}
            </Badge>
            <Badge variant="warning">
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
              {summary.health.degraded} {labels.degraded}
            </Badge>
            <Badge variant="danger">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              {summary.health.stalled} {labels.stalled}
            </Badge>
            {summary.health.degraded + summary.health.stalled > 0 ? (
              <Link
                href={analyticsHref}
                className="text-label text-primary focus-visible:ring-focus-ring ms-auto rounded font-semibold focus:outline-none focus-visible:ring-2"
              >
                {labels.reviewData}
              </Link>
            ) : null}
          </div>
          {summary.accountHealth.length > 0 ? (
            <ol
              className="border-border mt-4 divide-y border-t"
              data-testid="command-center-account-health"
            >
              {summary.accountHealth.map((account) => {
                const statusLabel =
                  account.status === "healthy"
                    ? labels.healthy
                    : account.status === "degraded"
                      ? labels.degraded
                      : labels.stalled;
                const statusVariant =
                  account.status === "healthy"
                    ? "success"
                    : account.status === "degraded"
                      ? "warning"
                      : "danger";
                return (
                  <li
                    key={account.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-2.5 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-label text-fg-primary truncate font-semibold">
                        <bdi>{account.accountName}</bdi>
                      </p>
                      <p className="text-label text-fg-muted capitalize">{account.platform}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-label text-fg-muted">
                        {account.lastSyncedAt
                          ? `${labels.freshness}: ${formatRelativeDate(account.lastSyncedAt, new Date(), locale as "en" | "ar")}`
                          : labels.noSync}
                      </span>
                      <Badge variant={statusVariant}>{statusLabel}</Badge>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </DashboardPanel>
      ) : null}

      {watchlist.length > 0 ? (
        <DashboardPanel
          id="command-center-watchlist"
          title={labels.watchlistTitle}
          description={labels.watchlistDescription}
          data-testid="command-center-watchlist"
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {watchlist.slice(0, 6).map((account) => {
              const statusLabel =
                account.providerStatus === "available"
                  ? labels.watchlistProviderAvailable
                  : account.providerStatus === "unsupported"
                    ? labels.watchlistProviderUnsupported
                    : account.providerStatus === "error"
                      ? labels.watchlistProviderError
                      : labels.watchlistSourceOnly;
              const statusVariant =
                account.providerStatus === "available"
                  ? "success"
                  : account.providerStatus === "error"
                    ? "warning"
                    : "outline";
              return (
                <div
                  key={account.id}
                  className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body text-fg-primary truncate font-semibold">
                        <bdi>{account.displayName || `@${account.handle}`}</bdi>
                      </p>
                      <p className="text-label text-fg-muted capitalize">
                        {account.platform} · <bdi>@{account.handle}</bdi>
                      </p>
                    </div>
                    <Badge variant={statusVariant}>{statusLabel}</Badge>
                  </div>
                  <a
                    href={account.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-label text-primary mt-3 inline-flex items-center gap-1 font-semibold"
                  >
                    {labels.openSource}
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </div>
              );
            })}
          </div>
          <Link
            href={researchHref}
            className="text-label text-primary focus-visible:ring-focus-ring mt-4 inline-flex rounded font-semibold focus:outline-none focus-visible:ring-2"
          >
            {labels.viewResearch}
            <ArrowUpRight className="ms-1 h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </DashboardPanel>
      ) : null}

      {!hasData ? (
        <Card variant="dashed" padding="lg" data-testid="command-center-empty">
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-title-card text-fg-primary font-semibold">
                  {labels.noDataTitle}
                </h3>
                <p className="text-body text-fg-secondary mt-1 max-w-2xl">
                  {labels.noDataDescription}
                </p>
              </div>
              <Button asChild>
                <Link href={summary.channelCount > 0 ? analyticsHref : channelsHref}>
                  {summary.channelCount > 0 ? labels.viewAnalytics : labels.connectChannels}
                </Link>
              </Button>
            </div>

            <div className="border-border border-t pt-4">
              <h4 className="text-body text-fg-primary font-semibold">{labels.setupTitle}</h4>
              <p className="text-label text-fg-secondary mt-1">{labels.setupDescription}</p>
              <ol className="mt-3 grid gap-3 md:grid-cols-3">
                {setupSteps.map((step, index) => (
                  <li
                    key={step.title}
                    className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="bg-primary text-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                        {index + 1}
                      </span>
                      <Badge variant={step.complete ? "success" : "outline"}>
                        {step.complete ? labels.setupComplete : labels.setupNext}
                      </Badge>
                    </div>
                    <p className="text-label text-fg-primary mt-3 font-semibold">{step.title}</p>
                    {!step.complete ? (
                      <Link
                        href={step.href}
                        className="text-label text-primary focus-visible:ring-focus-ring mt-2 inline-flex rounded font-semibold focus:outline-none focus-visible:ring-2"
                      >
                        {step.action}
                        <ArrowUpRight className="ms-1 h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label={labels.title}>
            <MetricCard
              icon={<Users className="h-4 w-4" aria-hidden="true" />}
              label={labels.followers}
              value={formatNumber(summary.currentFollowers, locale)}
              note={`${labels.followerChange}: ${formatPercent(summary.followerGrowth.percent)}`}
            />
            <MetricCard
              icon={<Eye className="h-4 w-4" aria-hidden="true" />}
              label={labels.reach}
              value={formatNumber(summary.currentReach, locale)}
              note={summary.partial ? labels.partial : labels.freshness}
            />
            <MetricCard
              icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
              label={labels.views}
              value={formatNumber(summary.currentViews, locale)}
              note={`${summary.channelsWithData}/${summary.channelCount}`}
            />
            <MetricCard
              icon={<Heart className="h-4 w-4" aria-hidden="true" />}
              label={labels.engagementRate}
              value={
                summary.engagementRate.percent === null
                  ? "—"
                  : `${summary.engagementRate.percent.toFixed(1)}%`
              }
              note={formatNumber(summary.currentInteractions, locale) + ` ${labels.interactions}`}
            />
          </div>
          <p
            className="text-label text-fg-muted flex flex-wrap items-center gap-x-2 gap-y-1"
            data-testid="command-center-evidence"
          >
            <span>{labels.sourceNote}</span>
            <span aria-hidden="true">·</span>
            <span>
              {labels.latestMetricDate}: <bdi>{summary.latestMetricDate ?? "—"}</bdi>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {formatNumber(summary.channelsWithData, locale)} /{" "}
              {formatNumber(summary.channelCount, locale)} {labels.coverage}
            </span>
          </p>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
            <DashboardPanel
              id="command-center-trend"
              className="lg:col-span-4"
              title={labels.trendTitle}
              description={`${labels.trendDescription} · ${timezone}`}
              data-testid="command-center-trend"
              footer={
                <details>
                  <summary className="text-label text-primary focus-visible:ring-focus-ring cursor-pointer rounded font-semibold focus:outline-none focus-visible:ring-2">
                    {labels.trendTable}
                  </summary>
                  <div className="overflow-x-auto pt-3">
                    <table className="text-label text-fg-secondary w-full text-start">
                      <thead>
                        <tr className="border-border border-b">
                          <th className="px-2 py-2 font-semibold">{labels.date}</th>
                          <th className="px-2 py-2 text-end font-semibold">{labels.followers}</th>
                          <th className="px-2 py-2 text-end font-semibold">{labels.views}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.trend.slice(-7).map((point) => (
                          <tr
                            key={point.metricDate}
                            className="border-border border-b last:border-0"
                          >
                            <td className="px-2 py-2">
                              <bdi>{point.metricDate}</bdi>
                            </td>
                            <td className="px-2 py-2 text-end">
                              {formatNumber(point.followerCount, locale)}
                            </td>
                            <td className="px-2 py-2 text-end">
                              {formatNumber(point.views, locale)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              }
            >
              {trend ? (
                <figure aria-labelledby="command-center-trend-title">
                  <svg
                    viewBox="0 0 100 100"
                    className="h-44 w-full overflow-visible"
                    role="img"
                    aria-label={`${labels.followers}: ${formatNumber(summary.currentFollowers, locale)}; ${labels.followerChange}: ${formatPercent(summary.followerGrowth.percent)}`}
                    preserveAspectRatio="none"
                  >
                    <title id="command-center-trend-title">{labels.trendTitle}</title>
                    <line x1="4" x2="96" y1="92" y2="92" className="stroke-border" />
                    <line
                      x1="4"
                      x2="96"
                      y1="53"
                      y2="53"
                      className="stroke-border"
                      strokeDasharray="2 3"
                    />
                    <line
                      x1="4"
                      x2="96"
                      y1="14"
                      y2="14"
                      className="stroke-border"
                      strokeDasharray="2 3"
                    />
                    <path
                      d={trend.areaPath}
                      fill="var(--primary)"
                      opacity="0.1"
                      aria-hidden="true"
                    />
                    <path
                      d={trend.linePath}
                      className="stroke-primary fill-none"
                      strokeWidth="2.5"
                      vectorEffect="non-scaling-stroke"
                    />
                    {trend.points.map((point, index) => (
                      <circle
                        key={`${point.x}-${index}`}
                        cx={point.x}
                        cy={point.y}
                        r="1.8"
                        fill="var(--surface)"
                        stroke="var(--primary)"
                        strokeWidth="0.9"
                        vectorEffect="non-scaling-stroke"
                        aria-hidden="true"
                      />
                    ))}
                  </svg>
                </figure>
              ) : (
                <p className="text-body text-fg-muted">{labels.notEnoughData}</p>
              )}
            </DashboardPanel>

            <DashboardPanel
              id="command-center-leaders"
              className="lg:col-span-3"
              title={labels.strongestAccounts}
              description={labels.strongestAccountsDescription}
              data-testid="command-center-leaders"
            >
              {summary.leaders.length > 0 ? (
                <ol className="divide-border divide-y">
                  {summary.leaders.map((leader) => (
                    <li
                      key={leader.id}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="text-body text-fg-primary truncate font-semibold">
                          <bdi>{leader.accountName}</bdi>
                        </p>
                        <p className="text-label text-fg-muted capitalize">{leader.platform}</p>
                      </div>
                      <Badge variant="outline">
                        {formatNumber(leader.interactions ?? leader.views, locale)}
                      </Badge>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-body text-fg-muted">{labels.noAccountData}</p>
              )}
            </DashboardPanel>
          </div>

          <DashboardPanel
            id="command-center-content"
            title={labels.topContent}
            description={labels.topContentDescription}
            data-testid="command-center-content"
          >
            {summary.content.topPosts.length > 0 ? (
              <ol className="divide-border divide-y">
                {summary.content.topPosts.map((post) => (
                  <li
                    key={post.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-body text-fg-primary truncate font-semibold">
                        <bdi>{post.accountName}</bdi>
                        <span className="text-label text-fg-muted ms-2 capitalize">
                          {post.mediaType}
                        </span>
                      </p>
                      <p className="text-label text-fg-secondary mt-1">
                        {[
                          formatPostMetric(post.views, labels.views, locale),
                          formatPostMetric(post.reach, labels.reach, locale),
                          formatPostMetric(post.interactions, labels.interactions, locale),
                          formatPostMetric(post.likes, labels.likes, locale),
                          formatPostMetric(post.comments, labels.comments, locale),
                          formatPostMetric(post.saved, labels.saved, locale),
                          formatPostMetric(post.shares, labels.shares, locale),
                        ]
                          .filter((value): value is string => value !== null)
                          .join(" · ")}
                        {post.publishedAt
                          ? ` · ${formatRelativeDate(post.publishedAt, new Date(), locale as "en" | "ar")}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {post.outlierScore !== null && post.outlierScore >= 3 ? (
                        <Badge variant="success">
                          {labels.outlier} {post.outlierScore.toFixed(1)}x
                        </Badge>
                      ) : null}
                      {post.permalink ? (
                        <a
                          href={post.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-label text-primary focus-visible:ring-focus-ring rounded font-semibold focus:outline-none focus-visible:ring-2"
                        >
                          {labels.openSource}
                        </a>
                      ) : null}
                      {canSaveResearch ? (
                        <ResearchBookmarkButton
                          workspaceSlug={workspaceSlug}
                          observationId={post.id}
                          initialSaved={savedResearchObservationIds.has(post.id)}
                          saveLabel={labels.saveResearch}
                          savedLabel={labels.savedResearch}
                          errorLabel={labels.researchSaveError}
                        />
                      ) : null}
                      <Link
                        href={`${planningHref}/new?researchPostObservationId=${encodeURIComponent(post.id)}`}
                        className="text-label text-primary focus-visible:ring-focus-ring rounded font-semibold focus:outline-none focus-visible:ring-2"
                      >
                        {labels.createBriefFromPost}
                      </Link>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-body text-fg-muted">{labels.noContentData}</p>
            )}
          </DashboardPanel>

          <CommandCenterContentInventory
            posts={summary.content.posts}
            locale={locale}
            workspaceSlug={workspaceSlug}
            savedResearchObservationIds={savedResearchObservationIds}
            canSaveResearch={canSaveResearch}
            planningHref={planningHref}
            labels={labels.contentInventory}
          />

          <DashboardPanel
            id="command-center-recommendations"
            title={labels.bestTime}
            description={`${labels.bestTimeDescription} · ${timezone}`}
            data-testid="command-center-recommendations"
          >
            <div className="grid min-w-0 gap-5 lg:grid-cols-2">
              <section className="min-w-0" aria-labelledby="command-center-best-time-title">
                <div className="mb-3 flex items-center gap-2">
                  <CalendarClock className="text-primary h-4 w-4" aria-hidden="true" />
                  <h3
                    id="command-center-best-time-title"
                    className="text-body text-fg-primary font-semibold"
                  >
                    {labels.bestTime}
                  </h3>
                </div>
                {summary.content.bestTime && bestTimeDay && bestTimeHour ? (
                  <div className="border-border bg-surface-subtle rounded-[var(--radius-control)] border p-4">
                    <p className="text-title-card text-fg-primary font-semibold">
                      {bestTimeDay} · {bestTimeHour}
                    </p>
                    <p className="text-label text-fg-secondary mt-1">
                      {formatNumber(summary.content.bestTime.averageViews, locale)}{" "}
                      {labels.averageViews}
                    </p>
                    <p className="text-label text-fg-muted mt-2">
                      {summary.content.bestTime.sampleSize} {labels.sampleSize}
                    </p>
                  </div>
                ) : (
                  <p className="text-body text-fg-muted">{labels.noBestTimeData}</p>
                )}
                {summary.content.timeSlots.length > 0 ? (
                  <div
                    className="mt-4 overflow-x-auto"
                    dir="ltr"
                    tabIndex={0}
                    aria-label={labels.bestTimeDescription}
                  >
                    <table
                      dir={locale.startsWith("ar") ? "rtl" : "ltr"}
                      className="text-label text-fg-secondary w-full min-w-[30rem] border-separate border-spacing-1 text-center"
                    >
                      <caption className="sr-only">{labels.bestTimeDescription}</caption>
                      <thead>
                        <tr>
                          <th scope="col" className="px-1 py-1 text-start font-semibold">
                            {timezone}
                          </th>
                          {heatmapDays.map((day) => (
                            <th key={day} scope="col" className="px-1 py-1 font-semibold">
                              {day}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {heatmapHours.map((hour) => (
                          <tr key={hour}>
                            <th scope="row" className="px-1 py-1 text-start font-medium">
                              {hour}:00
                            </th>
                            {heatmapDays.map((_, day) => {
                              const slot = timeSlotsByKey.get(`${day}:${hour}`);
                              const intensity = slot
                                ? Math.max(0.18, slot.averageViews / maxSlotViews)
                                : 0;
                              const label = slot
                                ? `${formatNumber(slot.averageViews, locale)} ${labels.averageViews} · ${slot.sampleSize} ${labels.sampleSize}${slot.reliable ? "" : ` · ${labels.notEnoughData}`}`
                                : labels.noBestTimeData;
                              return (
                                <td
                                  key={`${day}:${hour}`}
                                  className={`h-8 rounded-[calc(var(--radius-control)/2)] border ${slot?.reliable ? "border-primary/60" : "border-border"}`}
                                  title={label}
                                  aria-label={`${heatmapDays[day]} ${hour}:00 — ${label}`}
                                  style={
                                    slot
                                      ? {
                                          backgroundColor: "var(--primary)",
                                          opacity: intensity,
                                        }
                                      : undefined
                                  }
                                >
                                  <span className="sr-only">{label}</span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>

              <section className="min-w-0" aria-labelledby="command-center-length-title">
                <div className="mb-3 flex items-center gap-2">
                  <Timer className="text-primary h-4 w-4" aria-hidden="true" />
                  <h3
                    id="command-center-length-title"
                    className="text-body text-fg-primary font-semibold"
                  >
                    {labels.bestVideoLength}
                  </h3>
                </div>
                {summary.content.lengthBands.length > 0 ? (
                  <ol className="space-y-3">
                    {summary.content.lengthBands.map((band) => (
                      <li key={band.key}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-label text-fg-primary font-semibold">
                            {lengthBandLabel(labels, band.key)}
                          </p>
                          {band.reliable ? (
                            <p className="text-label text-fg-secondary tabular-nums">
                              {band.relativePerformance.toFixed(2)}x {labels.relativePerformance}
                            </p>
                          ) : (
                            <p className="text-label text-fg-muted">{labels.notEnoughData}</p>
                          )}
                        </div>
                        <div className="text-label text-fg-muted mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          <span>
                            {formatNumber(band.medianViews, locale)} {labels.medianViews}
                          </span>
                          <span>
                            {band.sampleSize} {labels.sampleSize}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-body text-fg-muted">{labels.noLengthData}</p>
                )}
              </section>
            </div>
          </DashboardPanel>

          <DashboardPanel
            id="command-center-performance"
            title={labels.channelPerformance}
            description={labels.channelPerformanceDescription}
            data-testid="command-center-performance"
          >
            {summary.channelPerformance.length > 0 ? (
              <div className="space-y-4">
                {summary.channelPerformance.map((channel) => {
                  const maxViews = Math.max(
                    1,
                    ...summary.channelPerformance.map((item) => item.views ?? 0),
                  );
                  const width = Math.max(4, ((channel.views ?? 0) / maxViews) * 100);
                  return (
                    <div key={channel.id} className="space-y-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="text-body text-fg-primary min-w-0 truncate font-semibold">
                          <bdi>{channel.accountName}</bdi>
                          <span className="text-label text-fg-muted ms-2 capitalize">
                            {channel.platform}
                          </span>
                        </p>
                        <p className="text-label text-fg-secondary tabular-nums">
                          {formatNumber(channel.views, locale)} {labels.views}
                        </p>
                      </div>
                      <div
                        className="bg-surface-subtle h-2 overflow-hidden rounded-full"
                        role="img"
                        aria-label={
                          channel.accountName +
                          ": " +
                          formatNumber(channel.views, locale) +
                          " " +
                          labels.views
                        }
                      >
                        <div
                          className="bg-primary h-full rounded-full transition-[width]"
                          style={{ width: width + "%" }}
                        />
                      </div>
                      <p className="text-label text-fg-muted">
                        {formatNumber(channel.interactions, locale)} {labels.interactions} ·{" "}
                        {formatNumber(channel.reach, locale)} {labels.reach}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-body text-fg-muted">{labels.noPerformanceData}</p>
            )}
          </DashboardPanel>

          <Card
            id="command-center-planning-signal"
            className="bg-primary-subtle border-primary/30"
            padding="md"
            data-testid="command-center-planning-signal"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <RefreshCw className="text-primary mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-body text-fg-primary font-semibold">{labels.planningSignal}</p>
                  <p className="text-label text-fg-secondary mt-1">
                    {labels.planningSignalDescription}
                  </p>
                  <p className="text-label text-fg-muted mt-1">{labels.sourceNote}</p>
                  {asOf ? (
                    <p className="text-label text-fg-muted mt-1">
                      {labels.freshness}: {asOf}
                    </p>
                  ) : null}
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={planningHref}>{labels.openPlanning}</Link>
              </Button>
            </div>
          </Card>
        </>
      )}
    </section>
  );
}

function MetricCard({
  icon,
  label,
  value,
  note,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card padding="md" className="min-w-0">
      <div className="text-primary flex items-center gap-2">
        {icon}
        <span className="text-label text-fg-secondary truncate">{label}</span>
      </div>
      <p className="text-title-page text-fg-primary mt-3 font-semibold">
        <bdi>{value}</bdi>
      </p>
      <p className="text-label text-fg-muted mt-1 truncate">
        <bdi>{note}</bdi>
      </p>
    </Card>
  );
}
