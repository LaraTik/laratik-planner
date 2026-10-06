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
  TrendingUp,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DashboardPanel } from "@/components/workspace/dashboard-panel";
import { BestTimeHeatmap } from "@/components/workspace/best-time-heatmap";
import { PlatformIcon } from "@/components/workspace/platform-icon";
import { PostCaption, PostThumbnail } from "@/components/workspace/post-thumbnail";
import { Sparkline } from "@/components/workspace/sparkline";
import { cn } from "@/lib/utils";
import { CommandCenterRefresh } from "@/components/workspace/command-center-refresh";
import { CommandCenterSectionNav } from "@/components/workspace/command-center-section-nav";
import {
  CommandCenterContentInventory,
  type CommandCenterContentInventoryLabels,
} from "@/components/workspace/command-center-content-inventory";
import { ResearchBookmarkButton } from "@/components/workspace/research-bookmark-button";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import type {
  CommandCenterLengthBandKey,
  CommandCenterPost,
  CommandCenterSummary,
  CommandCenterTimeSlot,
} from "@/lib/social/command-center";

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
  /* Reference-parity additions. */
  manageAccounts: string;
  viewAllChannels: string;
  viewAll: string;
  lastSynced: string;
  comparedToPrevious: string;
  bestSlot: string;
  bestSlotDescription: string;
  basedOnRecentContent: string;
  heatMapLess: string;
  heatMapMore: string;
  heatMapLegend: string;
  noFollowerData: string;
  observedContent: string;
  observedContentDescription: string;
  channel: string;
  post: string;
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
  const now = new Date();
  const asOf = summary.lastSyncedAt
    ? formatRelativeDate(summary.lastSyncedAt, now, locale as "en" | "ar")
    : null;
  const bestTimeDay = summary.content.bestTime
    ? new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
        new Date(Date.UTC(2024, 0, 7 + summary.content.bestTime.dayOfWeek)),
      )
    : null;
  const bestTimeHour = summary.content.bestTime
    ? // The heatmap's row label is the band start in 24h form ("21:00"),
      // so the pill must match it rather than rendering a bare "21".
      `${String(summary.content.bestTime.hour).padStart(2, "0")}:00`
    : null;
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
      className="border-border bg-surface rounded-[var(--radius-card)] border p-4 sm:p-5"
      data-testid="command-center-panel"
      aria-labelledby="command-center-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="command-center-title" className="text-title-card text-fg-primary font-semibold">
            {labels.title}
          </h2>
          <p className="text-label text-fg-secondary mt-1">{labels.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {asOf ? (
            <span className="text-label text-fg-muted order-2 sm:order-none">
              {labels.lastSynced} {asOf}
            </span>
          ) : null}
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
          <Button variant="outline" size="sm" asChild>
            <Link href={analyticsHref}>
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              {labels.viewAnalytics}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Analysis window + section nav share one tab row, as in the reference. */}
      {summary.channelCount > 0 && hasData ? (
        <div className="border-border mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
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
              className={`text-label rounded-[calc(var(--radius-control)-2px)] px-2.5 py-1 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none ${windowDays === 30 ? "border-primary bg-primary-subtle text-primary" : "text-fg-secondary hover:bg-surface hover:text-fg-primary"}`}
            >
              {labels.last30Days}
            </Link>
            <Link
              href={window90Href}
              aria-current={windowDays === 90 ? "page" : undefined}
              className={`text-label rounded-[calc(var(--radius-control)-2px)] px-2.5 py-1 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none ${windowDays === 90 ? "border-primary bg-primary-subtle text-primary" : "text-fg-secondary hover:bg-surface hover:text-fg-primary"}`}
            >
              {labels.last90Days}
            </Link>
          </div>
          <CommandCenterSectionNav
            title={labels.title}
            items={[
              { id: "command-center-health", label: labels.dataHealth },
              { id: "command-center-trend", label: labels.trendTitle },
              { id: "command-center-performance", label: labels.channelPerformance },
              { id: "command-center-content", label: labels.topContent },
              { id: "command-center-inventory", label: labels.observedContent },
              { id: "command-center-recommendations", label: labels.bestTime },
              ...(watchlist.length > 0
                ? [{ id: "command-center-watchlist", label: labels.watchlistTitle }]
                : []),
            ]}
          />
        </div>
      ) : null}

      {summary.channelCount > 0 && hasData ? (
        <div className="mt-4 grid grid-cols-1 gap-4">
          {/* Row 1 — data health + four KPI cards, matching the reference. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <DataHealthCard
                health={summary.health}
                accounts={summary.accountHealth}
                labels={{
                  title: labels.dataHealth,
                  description: labels.dataHealthDescription,
                  manageAccounts: labels.manageAccounts,
                  channelsHref,
                  freshness: labels.freshness,
                  lastSynced: labels.lastSynced,
                  healthy: labels.healthy,
                  degraded: labels.degraded,
                  stalled: labels.stalled,
                  noSync: labels.noSync,
                  reviewData: labels.reviewData,
                  analyticsHref,
                  locale,
                }}
                now={now}
              />
            </div>
            <div className="grid grid-cols-2 gap-4 lg:col-span-7">
              <MetricCard
                icon={<Users className="h-4 w-4" aria-hidden="true" />}
                label={labels.followers}
                value={formatNumber(summary.currentFollowers, locale)}
                delta={formatPercent(summary.followerGrowth.percent)}
                deltaIsPositive={(summary.followerGrowth.absolute ?? 0) >= 0}
                sparkline={summary.trend.map((point) => point.followerCount)}
                testId="command-center-kpi-followers"
              />
              <MetricCard
                icon={<Eye className="h-4 w-4" aria-hidden="true" />}
                label={labels.reach}
                value={formatNumber(summary.currentReach, locale)}
                note={summary.partial ? labels.partial : labels.freshness}
                sparkline={summary.trend.map((point) => point.reach)}
                testId="command-center-kpi-reach"
              />
              <MetricCard
                icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
                label={labels.views}
                value={formatNumber(summary.currentViews, locale)}
                note={`${formatNumber(summary.channelsWithData, locale)}/${formatNumber(summary.channelCount, locale)} ${labels.coverage}`}
                sparkline={summary.trend.map((point) => point.views)}
                testId="command-center-kpi-views"
              />
              <MetricCard
                icon={<Heart className="h-4 w-4" aria-hidden="true" />}
                label={labels.engagementRate}
                value={
                  summary.engagementRate.percent === null
                    ? "—"
                    : `${summary.engagementRate.percent.toFixed(1)}%`
                }
                note={`${formatNumber(summary.currentInteractions, locale)} ${labels.interactions}`}
                sparkline={summary.trend.map((point) => point.interactions)}
                testId="command-center-kpi-engagement"
              />
            </div>
          </div>

          {/* Row 2 — follower trend, strongest accounts, best time to post. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <FollowerTrendCard
                summary={summary}
                labels={{
                  title: labels.trendTitle,
                  description: labels.trendDescription,
                  windowLabel: labels.analysisWindow,
                  last30Days: labels.last30Days,
                  last90Days: labels.last90Days,
                  table: labels.trendTable,
                  date: labels.date,
                  followers: labels.followers,
                  views: labels.views,
                  comparedToPrevious: labels.comparedToPrevious,
                  noData: labels.noFollowerData,
                  windowDays,
                  window30Href,
                  window90Href,
                  timezone,
                  locale,
                }}
              />
            </div>
            <div className="lg:col-span-3">
              <StrongestAccountsCard
                leaders={summary.leaders}
                locale={locale}
                timezone={timezone}
                title={labels.strongestAccounts}
                description={labels.strongestAccountsDescription}
                viewsAllHref={channelsHref}
                viewAllLabel={labels.viewAllChannels}
                interactionsLabel={labels.interactions}
                noData={labels.noAccountData}
              />
            </div>
            <div className="lg:col-span-4">
              <BestTimeCard
                slots={summary.content.timeSlots}
                bestTime={summary.content.bestTime}
                averageViews={summary.content.averageViews}
                locale={locale}
                timezone={timezone}
                labels={{
                  title: labels.bestTime,
                  description: labels.bestTimeDescription,
                  basedOn: labels.basedOnRecentContent,
                  averageViews: labels.averageViews,
                  sampleSize: labels.sampleSize,
                  noData: labels.noBestTimeData,
                  legend: labels.heatMapLegend,
                  less: labels.heatMapLess,
                  more: labels.heatMapMore,
                  bestSlot: labels.bestSlot,
                  notEnoughData: labels.notEnoughData,
                }}
                bestTimeDay={bestTimeDay}
                bestTimeHour={bestTimeHour}
              />
            </div>
          </div>
        </div>
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
          <p
            className="text-label text-fg-muted mt-3 flex flex-wrap items-center gap-x-2 gap-y-1"
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

          <DashboardPanel
            id="command-center-content"
            title={labels.topContent}
            description={labels.topContentDescription}
            data-testid="command-center-content"
          >
            {summary.content.topPosts.length > 0 ? (
              <div className="overflow-x-auto" dir="ltr" tabIndex={0}>
                <table
                  dir={locale.startsWith("ar") ? "rtl" : "ltr"}
                  className="text-label text-fg-secondary w-full min-w-[34rem] text-start"
                  data-testid="command-center-top-content-table"
                >
                  <thead>
                    <tr className="border-border border-b">
                      <th scope="col" className="px-2 py-2 text-start font-semibold">
                        #
                      </th>
                      <th scope="col" className="px-2 py-2 text-start font-semibold">
                        {labels.post}
                      </th>
                      <th scope="col" className="px-2 py-2 text-start font-semibold">
                        {labels.channel}
                      </th>
                      <th scope="col" className="px-2 py-2 text-end font-semibold">
                        {labels.views}
                      </th>
                      <th scope="col" className="px-2 py-2 text-end font-semibold">
                        {labels.interactions}
                      </th>
                      <th scope="col" className="px-2 py-2 text-end font-semibold">
                        ER
                      </th>
                      <th scope="col" className="px-2 py-2 text-end font-semibold">
                        {labels.date}
                      </th>
                      <th scope="col" className="px-2 py-2">
                        <span className="sr-only">{labels.createBriefFromPost}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.content.topPosts.map((post, index) => (
                      <tr key={post.id} className="border-border border-b last:border-0">
                        <td className="text-fg-muted px-2 py-2 tabular-nums">{index + 1}</td>
                        <td className="px-2 py-2">
                          {/* Thumbnail + text share one cell so the row reads as a
                              single unit. The caption is the primary identifier —
                              it is what the operator recognises the post by — and
                              the account is the secondary meta line. Posts with no
                              caption fall back to the account name as the title. */}
                          <div className="flex items-start gap-3">
                            <PostThumbnail
                              src={post.thumbnailUrl}
                              mediaType={post.mediaType}
                              size={40}
                            />
                            <div className="max-w-[20rem] min-w-0">
                              {post.caption ? (
                                <PostCaption
                                  caption={post.caption}
                                  className="text-fg-primary font-medium"
                                />
                              ) : (
                                <span className="text-label text-fg-primary block truncate font-semibold">
                                  <bdi>{post.accountName}</bdi>
                                </span>
                              )}
                              {/* Meta line: the account is only repeated when the
                                  caption already carries the row's identity. */}
                              <span className="text-label text-fg-muted mt-0.5 flex flex-wrap items-center gap-x-1.5">
                                {post.caption ? (
                                  <>
                                    <span className="truncate">
                                      <bdi>{post.accountName}</bdi>
                                    </span>
                                    <span aria-hidden="true">·</span>
                                  </>
                                ) : null}
                                <span className="capitalize">{post.mediaType}</span>
                                {post.outlierScore !== null && post.outlierScore >= 3 ? (
                                  <Badge variant="success">
                                    {labels.outlier} {post.outlierScore.toFixed(1)}x
                                  </Badge>
                                ) : null}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <PlatformIcon platform={post.platform} />
                        </td>
                        <td className="px-2 py-2 text-end tabular-nums">
                          {formatNumber(post.views, locale)}
                        </td>
                        <td className="px-2 py-2 text-end tabular-nums">
                          {formatNumber(post.interactions, locale)}
                        </td>
                        <td className="px-2 py-2 text-end tabular-nums">
                          {engagementRateLabel(post, locale)}
                        </td>
                        <td className="px-2 py-2 text-end whitespace-nowrap">
                          {post.publishedAt ? (
                            <bdi>
                              {formatRelativeDate(post.publishedAt, now, locale as "en" | "ar")}
                            </bdi>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                            {post.permalink ? (
                              <a
                                href={post.permalink}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary focus-visible:ring-focus-ring rounded font-semibold whitespace-nowrap focus:outline-none focus-visible:ring-2"
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
                              className="text-primary focus-visible:ring-focus-ring rounded font-semibold whitespace-nowrap focus:outline-none focus-visible:ring-2"
                            >
                              {labels.createBriefFromPost}
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
            id="command-center-length"
            title={labels.bestVideoLength}
            description={labels.bestVideoLengthDescription}
            data-testid="command-center-length"
          >
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

/**
 * MetricCard — the reference KPI tile: tinted icon + label, dominant
 * value, then a green/red delta and a sparkline.
 *
 * The delta uses success/danger colour but is always paired with a
 * leading arrow glyph, so direction never depends on colour alone
 * (design-system.md "status always uses text and an icon").
 */
function MetricCard({
  icon,
  label,
  value,
  note,
  delta,
  deltaIsPositive,
  sparkline,
  testId,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note?: string;
  delta?: string;
  deltaIsPositive?: boolean;
  sparkline?: Array<number | null>;
  testId?: string;
}) {
  return (
    <Card padding="md" className="min-w-0" data-testid={testId}>
      <div className="text-primary flex items-center gap-2">
        {icon}
        <span className="text-label text-fg-secondary truncate">{label}</span>
      </div>
      <p className="text-title-page text-fg-primary mt-2 font-semibold">
        <bdi>{value}</bdi>
      </p>
      {delta ? (
        <p
          className={cn(
            "text-label mt-1 flex items-center gap-1 font-semibold",
            deltaIsPositive === false ? "text-danger" : "text-success",
          )}
        >
          <TrendingUp
            className={cn("h-3.5 w-3.5", deltaIsPositive === false && "rotate-180")}
            aria-hidden="true"
          />
          <bdi>{delta}</bdi>
        </p>
      ) : note ? (
        <p className="text-label text-fg-muted mt-1 truncate">
          <bdi>{note}</bdi>
        </p>
      ) : null}
      {sparkline && sparkline.length > 1 ? (
        <Sparkline values={sparkline} className="text-primary mt-2 h-8 w-full" />
      ) : null}
    </Card>
  );
}

/** Engagement rate for one observed post, as a percentage string. */
function engagementRateLabel(
  post: CommandCenterPost & { outlierScore: number | null },
  locale: string,
): string {
  const interactions = post.interactions ?? (post.likes ?? 0) + (post.comments ?? 0);
  if (post.reach === null || post.reach <= 0) return "—";
  const rate = (interactions / post.reach) * 100;
  return `${new Intl.NumberFormat(locale, {
    numberingSystem: "latn",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(rate)}%`;
}

/**
 * DataHealthCard — the reference "Data health" card: one row per connected
 * account with its platform tile, freshness, and a status pill, plus a
 * "Manage accounts" action.
 *
 * Status colour is always accompanied by the status word, so the pill is
 * not the only signal.
 */
function DataHealthCard({
  health,
  accounts,
  labels,
  now,
}: {
  health: CommandCenterSummary["health"];
  accounts: CommandCenterSummary["accountHealth"];
  labels: {
    title: string;
    description: string;
    manageAccounts: string;
    channelsHref: string;
    freshness: string;
    lastSynced: string;
    healthy: string;
    degraded: string;
    stalled: string;
    noSync: string;
    reviewData: string;
    analyticsHref: string;
    locale: string;
  };
  now: Date;
}) {
  return (
    <DashboardPanel
      id="command-center-health"
      title={labels.title}
      description={labels.description}
      data-testid="command-center-health"
      headerAction={
        <Button variant="outline" size="sm" asChild>
          <Link href={labels.channelsHref}>{labels.manageAccounts}</Link>
        </Button>
      }
    >
      <ul className="divide-border divide-y" data-testid="command-center-account-health">
        {accounts.map((account) => {
          const statusLabel =
            account.status === "healthy"
              ? labels.healthy
              : account.status === "degraded"
                ? labels.degraded
                : labels.stalled;
          const variant =
            account.status === "healthy"
              ? "success"
              : account.status === "degraded"
                ? "warning"
                : "danger";
          return (
            <li key={account.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <PlatformIcon platform={account.platform} tile />
              <div className="min-w-0 flex-1">
                <p className="text-label text-fg-primary truncate font-semibold">
                  <bdi>{account.accountName}</bdi>
                </p>
                <p className="text-label text-fg-muted">
                  {account.lastSyncedAt
                    ? `${labels.lastSynced} ${formatRelativeDate(account.lastSyncedAt, now, labels.locale as "en" | "ar")}`
                    : labels.noSync}
                </p>
              </div>
              <Badge variant={variant}>{statusLabel}</Badge>
            </li>
          );
        })}
      </ul>
      <div className="border-border mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        <span className="text-label text-fg-muted font-semibold">{labels.freshness}</span>
        {/* Status counts always carry their word, never a bare coloured
            number — a colour alone must never be the only signal. */}
        <Badge variant="success">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          {health.healthy} {labels.healthy}
        </Badge>
        <Badge variant="warning">
          <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
          {health.degraded} {labels.degraded}
        </Badge>
        <Badge variant="danger">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          {health.stalled} {labels.stalled}
        </Badge>
        {health.degraded + health.stalled > 0 ? (
          <Link
            href={labels.analyticsHref}
            className="text-label text-primary focus-visible:ring-focus-ring ms-auto rounded font-semibold focus:outline-none focus-visible:ring-2"
          >
            {labels.reviewData}
          </Link>
        ) : null}
      </div>
    </DashboardPanel>
  );
}

/**
 * FollowerTrendCard — the reference trend panel: a window select in the
 * header, a graded area chart with visible y-axis ticks, and a footer
 * carrying the absolute gain plus the period comparison.
 */
function FollowerTrendCard({
  summary,
  labels,
}: {
  summary: CommandCenterSummary;
  labels: {
    title: string;
    description: string;
    windowLabel: string;
    last30Days: string;
    last90Days: string;
    table: string;
    date: string;
    followers: string;
    views: string;
    comparedToPrevious: string;
    noData: string;
    windowDays: 30 | 90;
    window30Href: string;
    window90Href: string;
    timezone: string;
    locale: string;
  };
}) {
  const geometry = trendGeometry(summary);
  const growth = summary.followerGrowth;
  return (
    <DashboardPanel
      id="command-center-trend"
      title={labels.title}
      description={`${labels.description} · ${labels.timezone}`}
      data-testid="command-center-trend"
      headerAction={
        <div
          className="border-border bg-surface-subtle flex items-center gap-1 rounded-[var(--radius-control)] border p-0.5"
          role="group"
          aria-label={labels.windowLabel}
        >
          <Link
            href={labels.window30Href}
            aria-current={labels.windowDays === 30 ? "true" : undefined}
            className={cn(
              "text-label rounded-[calc(var(--radius-control)-2px)] px-2 py-1 font-semibold",
              labels.windowDays === 30 ? "bg-surface text-fg-primary" : "text-fg-secondary",
            )}
          >
            {labels.last30Days}
          </Link>
          <Link
            href={labels.window90Href}
            aria-current={labels.windowDays === 90 ? "true" : undefined}
            className={cn(
              "text-label rounded-[calc(var(--radius-control)-2px)] px-2 py-1 font-semibold",
              labels.windowDays === 90 ? "bg-surface text-fg-primary" : "text-fg-secondary",
            )}
          >
            {labels.last90Days}
          </Link>
        </div>
      }
      footer={
        growth.absolute !== null ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cn(
                "text-label flex items-center gap-1 font-semibold",
                growth.absolute >= 0 ? "text-success" : "text-danger",
              )}
            >
              <TrendingUp
                className={cn("h-3.5 w-3.5", growth.absolute < 0 && "rotate-180")}
                aria-hidden="true"
              />
              <bdi>
                {growth.absolute > 0 ? "+" : ""}
                {formatNumber(growth.absolute, labels.locale)}
              </bdi>
            </span>
            <span className="text-label text-fg-secondary">{labels.followers}</span>
            {growth.percent !== null ? (
              <>
                <span aria-hidden="true" className="text-fg-muted">
                  ·
                </span>
                <span className="text-label text-fg-secondary">
                  <bdi>{formatPercent(growth.percent)}</bdi>{" "}
                  {labels.comparedToPrevious.replace("{days}", String(labels.windowDays))}
                </span>
              </>
            ) : null}
          </div>
        ) : null
      }
    >
      {geometry ? (
        <figure>
          <svg
            viewBox="0 0 100 100"
            className="h-40 w-full"
            role="img"
            aria-label={`${labels.followers}: ${formatNumber(summary.currentFollowers, labels.locale)}`}
            preserveAspectRatio="none"
          >
            <title>{labels.title}</title>
            <defs>
              <linearGradient id="command-center-trend-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <line x1="0" x2="100" y1="92" y2="92" className="stroke-border" strokeWidth="0.5" />
            <line
              x1="0"
              x2="100"
              y1="53"
              y2="53"
              className="stroke-border"
              strokeWidth="0.5"
              strokeDasharray="1.5 2.5"
            />
            <line
              x1="0"
              x2="100"
              y1="14"
              y2="14"
              className="stroke-border"
              strokeWidth="0.5"
              strokeDasharray="1.5 2.5"
            />
            <path d={geometry.areaPath} fill="url(#command-center-trend-fill)" aria-hidden="true" />
            <path
              d={geometry.linePath}
              className="stroke-primary fill-none"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
            {geometry.points.map((point, index) => (
              <circle
                key={`${point.x}-${index}`}
                cx={point.x}
                cy={point.y}
                r="1.6"
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
        <p className="text-body text-fg-muted">{labels.noData}</p>
      )}
      <details className="mt-2">
        <summary className="text-label text-primary focus-visible:ring-focus-ring cursor-pointer rounded font-semibold focus:outline-none focus-visible:ring-2">
          {labels.table}
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
                <tr key={point.metricDate} className="border-border border-b last:border-0">
                  <td className="px-2 py-2">
                    <bdi>{point.metricDate}</bdi>
                  </td>
                  <td className="px-2 py-2 text-end">
                    {formatNumber(point.followerCount, labels.locale)}
                  </td>
                  <td className="px-2 py-2 text-end">{formatNumber(point.views, labels.locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </DashboardPanel>
  );
}

/** StrongestAccountsCard — the reference ranked account list. */
function StrongestAccountsCard({
  leaders,
  locale,
  title,
  description,
  viewsAllHref,
  viewAllLabel,
  interactionsLabel,
  noData,
}: {
  leaders: CommandCenterSummary["leaders"];
  locale: string;
  timezone: string;
  title: string;
  description: string;
  viewsAllHref: string;
  viewAllLabel: string;
  interactionsLabel: string;
  noData: string;
}) {
  return (
    <DashboardPanel
      id="command-center-leaders"
      title={title}
      description={description}
      data-testid="command-center-leaders"
      footer={
        <Link
          href={viewsAllHref}
          className="text-label text-primary inline-flex items-center gap-1 rounded font-semibold"
        >
          {viewAllLabel}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      }
    >
      {leaders.length > 0 ? (
        <ol className="divide-border divide-y">
          {leaders.map((leader) => (
            <li key={leader.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <PlatformIcon platform={leader.platform} tile />
              <div className="min-w-0 flex-1">
                <p className="text-label text-fg-primary truncate font-semibold">
                  <bdi>{leader.accountName}</bdi>
                </p>
                <p className="text-label text-fg-muted capitalize">{leader.platform}</p>
              </div>
              <span className="text-body text-fg-primary tabular-nums">
                {formatNumber(leader.interactions ?? leader.views, locale)}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-body text-fg-muted">{noData}</p>
      )}
      <span className="sr-only">{interactionsLabel}</span>
    </DashboardPanel>
  );
}

/**
 * BestTimeCard — the reference "Best time to post" panel: a best-slot
 * pill, the sample caveat, and the day×hour heatmap.
 *
 * The heatmap is always rendered when any slot exists, so a workspace
 * with sparse history still sees where its posts landed instead of an
 * empty grid.
 */
function BestTimeCard({
  slots,
  bestTime,
  averageViews,
  locale,
  timezone,
  labels,
  bestTimeDay,
  bestTimeHour,
}: {
  slots: CommandCenterTimeSlot[];
  bestTime: CommandCenterTimeSlot | null;
  averageViews: number | null;
  locale: string;
  timezone: string;
  labels: {
    title: string;
    description: string;
    basedOn: string;
    averageViews: string;
    sampleSize: string;
    noData: string;
    legend: string;
    less: string;
    more: string;
    bestSlot: string;
    notEnoughData: string;
  };
  bestTimeDay: string | null;
  bestTimeHour: string | null;
}) {
  const dayLabels = Array.from({ length: 7 }, (_, day) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 0, 7 + day)),
    ),
  );
  return (
    <DashboardPanel
      id="command-center-recommendations"
      title={labels.title}
      description={labels.basedOn}
      data-testid="command-center-recommendations"
      headerAction={
        bestTime && bestTimeDay && bestTimeHour ? (
          <span className="border-border bg-surface-subtle text-label text-fg-primary inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-semibold whitespace-nowrap">
            <CalendarClock className="text-primary h-3.5 w-3.5" aria-hidden="true" />
            <bdi>
              {bestTimeDay} · {bestTimeHour}
            </bdi>
          </span>
        ) : null
      }
    >
      {averageViews !== null ? (
        <p className="text-label text-fg-secondary">
          <bdi>{formatNumber(averageViews, locale)}</bdi> {labels.averageViews}
        </p>
      ) : null}
      {bestTime && bestTimeDay && bestTimeHour ? (
        <p className="text-label text-fg-muted mt-1">
          {labels.bestSlot}: <bdi>{formatNumber(bestTime.averageViews, locale)}</bdi>{" "}
          {labels.averageViews} · {bestTime.sampleSize} {labels.sampleSize}
        </p>
      ) : null}
      <div className="mt-3">
        {slots.length > 0 ? (
          <BestTimeHeatmap
            slots={slots}
            locale={locale}
            timezone={timezone}
            labels={{
              days: dayLabels,
              averageViews: labels.averageViews,
              sampleSize: labels.sampleSize,
              noData: labels.noData,
              legend: labels.legend,
              less: labels.less,
              more: labels.more,
              bestSlot: labels.bestSlot,
              notEnoughData: labels.notEnoughData,
            }}
          />
        ) : (
          <p className="text-body text-fg-muted">{labels.noData}</p>
        )}
      </div>
    </DashboardPanel>
  );
}
