import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole, INTERNAL_WORKSPACE_ROLES, isAgencyAdmin } from "@/lib/auth/policy";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/workspace/page-header";
import {
  parseSocialMetric,
  parseSocialWindow,
  type MetricSeriesPoint,
  type SocialMetric,
  type SocialWindow,
} from "@/lib/social/analytics";
import { querySocialAnalytics } from "@/lib/social/analytics-query";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { tForActive } from "@/lib/i18n/t-for-active";
import type { SocialSourceMetadata } from "@/lib/social/metrics";
import { SocialHealthBanner } from "./social-health-banner";
import { SocialSyncDiagnostics } from "./social-sync-diagnostics";
import { SocialHealthyStatus } from "./social-healthy-status";
import { SocialAnalyticsDashboard, type DashboardLabels } from "./social-analytics-dashboard";

const METRIC_LABEL_KEYS: Record<SocialMetric, string> = {
  followerCount: "analytics.metricFollowers",
  reach: "analytics.metricReach",
  views: "analytics.metricViews",
  engagedAccounts: "analytics.metricEngagedAccounts",
  interactions: "analytics.metricInteractions",
};

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("sidebar.analytics") };
}

export default async function SocialAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    window?: string | string[];
    metric?: string | string[];
    platforms?: string | string[];
    channels?: string | string[];
  }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { t, code } = await tForActive();
  const { slug } = await params;
  const sp = await searchParams;
  const rawWindow = Array.isArray(sp.window) ? sp.window[0] : sp.window;
  const rawMetric = Array.isArray(sp.metric) ? sp.metric[0] : sp.metric;
  const rawPlatforms = Array.isArray(sp.platforms) ? sp.platforms[0] : sp.platforms;
  const rawChannels = Array.isArray(sp.channels) ? sp.channels[0] : sp.channels;
  const window: SocialWindow = parseSocialWindow(rawWindow);
  const metric: SocialMetric = parseSocialMetric(rawMetric);

  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();
  const hasInternalAccess = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    ...INTERNAL_WORKSPACE_ROLES,
  ]);
  if (!hasInternalAccess) notFound();
  const canManageProvider = await isAgencyAdmin({ id: session.user.id }, workspace.agencyId);

  const queriedChannels = await querySocialAnalytics(db, workspace.id, workspace.timezone);
  const channels = queriedChannels.map(({ channel }) => channel);
  const byChannel = new Map(queriedChannels.map(({ channel, metrics }) => [channel.id, metrics]));
  const now = new Date();
  const latestFor = (channelId: string) => {
    const rows = byChannel.get(channelId) ?? [];
    return rows[rows.length - 1];
  };
  const healthChannels = channels.map((channel) => ({
    id: channel.id,
    accountName: channel.accountName,
    platform: channel.platform as "instagram" | "facebook" | "tiktok",
    connectionStatus: channel.connectionStatus as
      "manual" | "connected" | "needs_reauth" | "sync_error" | "disconnected",
    lastSyncedAt: channel.lastSyncedAt,
    lastSyncErrorCode: channel.lastSyncErrorCode,
    latestProviderErrorCode:
      (latestFor(channel.id)?.sourceMetadata as SocialSourceMetadata | null)?.providerErrorCode ??
      null,
  }));
  const hasAnySignals = healthChannels.some(
    (channel) =>
      channel.connectionStatus === "needs_reauth" ||
      channel.lastSyncErrorCode !== null ||
      channel.latestProviderErrorCode !== null ||
      (channel.lastSyncedAt !== null &&
        now.getTime() - channel.lastSyncedAt.getTime() > 25 * 60 * 60_000),
  );
  const mostRecentSync = channels.reduce<Date | null>((latest, channel) => {
    if (!channel.lastSyncedAt) return latest;
    return !latest || channel.lastSyncedAt > latest ? channel.lastSyncedAt : latest;
  }, null);

  const dashboardChannels = queriedChannels.map(({ channel, metrics }) => ({
    id: channel.id,
    platform: channel.platform as "facebook" | "instagram" | "tiktok",
    accountName: channel.accountName,
    handle: channel.handle,
    lastSyncedAt: channel.lastSyncedAt?.toISOString() ?? null,
    lastSyncErrorCode: channel.lastSyncErrorCode,
    latestProviderErrorCode:
      (metrics[metrics.length - 1]?.sourceMetadata as SocialSourceMetadata | null)
        ?.providerErrorCode ?? null,
    series: metrics.map((row): MetricSeriesPoint => {
      const metadata = row.sourceMetadata as SocialSourceMetadata | null;
      return {
        metricDate: row.metricDate,
        followerCount: row.followerCount,
        reach: row.reach,
        views: row.views,
        engagedAccounts: row.engagedAccounts,
        interactions: row.interactions,
        ...(metadata?.partial === true ? { partial: true } : {}),
        ...(metadata?.metricStatuses ? { metricStatuses: metadata.metricStatuses } : {}),
      };
    }),
  }));

  const labels: DashboardLabels = {
    platformFilter: t("analytics.platformFilter"),
    accountFilter: t("analytics.accountFilter"),
    allPlatforms: t("analytics.allPlatforms"),
    clear: t("analytics.clear"),
    selectAll: t("analytics.selectAll"),
    selectedCount: t("analytics.selectedCount"),
    comparisonTitle: t("analytics.comparisonTitle"),
    comparisonDescription: t("analytics.comparisonDescription"),
    noComparableMetrics: t("analytics.noComparableMetrics"),
    noData: t("analytics.noData"),
    refresh: t("analytics.refresh"),
    export: t("analytics.export"),
    channels: t("analytics.channels"),
    currentFollowers: t("analytics.currentFollowers"),
    selectedMetric: t("analytics.selectedMetric"),
    window: t("analytics.windowSelector"),
    days: t("analytics.days"),
    details: t("analytics.details"),
    followerTrend: t("analytics.followerTrend"),
    date: t("analytics.tableDate"),
    partial: t("analytics.partial"),
    metricLabels: {
      followerCount: t(METRIC_LABEL_KEYS.followerCount),
      reach: t(METRIC_LABEL_KEYS.reach),
      views: t(METRIC_LABEL_KEYS.views),
      engagedAccounts: t(METRIC_LABEL_KEYS.engagedAccounts),
      interactions: t(METRIC_LABEL_KEYS.interactions),
    },
    platformLabels: {
      facebook: t("analytics.facebook"),
      instagram: t("analytics.instagram"),
      tiktok: t("analytics.tiktok"),
    },
  };
  const initialQuery = new URLSearchParams({
    window: String(window),
    metric,
    ...(rawPlatforms ? { platforms: rawPlatforms } : {}),
    ...(rawChannels ? { channels: rawChannels } : {}),
  }).toString();

  return (
    <div className="space-y-6" data-testid="social-analytics-page">
      <PageHeader
        eyebrow={workspace.name}
        title={t("analytics.title")}
        description={
          <>
            {t("analytics.description")}
            <span className="text-label text-fg-muted border-border bg-surface-subtle ms-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              {workspace.timezone}
            </span>
          </>
        }
      />
      <SocialSyncDiagnostics channels={healthChannels} slug={slug} t={t} />
      {mostRecentSync ? (
        <p className="text-label text-fg-muted -mt-3" data-testid="social-analytics-as-of">
          {t("analytics.asOf", { date: formatRelativeDate(mostRecentSync, now, code) })}
        </p>
      ) : null}
      <SocialHealthBanner
        channels={healthChannels}
        slug={slug}
        t={t}
        canManageProvider={canManageProvider}
      />
      {!hasAnySignals && channels.length > 0 ? (
        <SocialHealthyStatus channelCount={channels.length} asOf={mostRecentSync} now={now} />
      ) : null}
      {channels.length === 0 ? (
        <Card variant="dashed" padding="lg" data-testid="social-analytics-empty">
          <EmptyState
            icon={<BarChart3 className="h-8 w-8" aria-hidden={true} />}
            title={t("analytics.emptyNoChannelsTitle")}
            description={t("analytics.emptyNoChannelsDescription")}
            action={
              <a
                href={`/app/w/${slug}/channels`}
                className="border-border bg-surface text-fg-primary text-body rounded-md border px-4 py-2"
              >
                {t("analytics.goToChannels")}
              </a>
            }
          />
        </Card>
      ) : (
        <SocialAnalyticsDashboard
          channels={dashboardChannels}
          initialQuery={initialQuery}
          labels={labels}
        />
      )}
    </div>
  );
}
