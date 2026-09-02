import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { Activity, BarChart3, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { socialChannels, socialProfileDailyMetrics } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole, INTERNAL_WORKSPACE_ROLES } from "@/lib/auth/policy";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/workspace/page-header";
import { PlatformIcon, platformLabel } from "@/components/workspace/platform-icon";
import {
  buildProfileSummary,
  calculateEngagementRate,
  calculateGrowth,
  chartSeries,
  parseSocialMetric,
  parseSocialWindow,
  priorSeriesInWindow,
  seriesInWindow,
  SOCIAL_METRICS,
  type MetricSeriesPoint,
  type SocialMetric,
  type SocialWindow,
} from "@/lib/social/analytics";
import { SocialGrowthChart } from "./social-growth-chart";
import { SocialMetricsTable, type SocialMetricsRow } from "./social-metrics-table";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import { SocialHealthBanner } from "./social-health-banner";
import { SocialSyncDiagnostics } from "./social-sync-diagnostics";
import { SocialAggregateStrip, type AggregateChannel } from "./social-aggregate-strip";
import { SocialHealthyStatus } from "./social-healthy-status";
import { SegmentedControl, type SegmentedOption } from "./social-segmented-control";
import { SocialSparkline, socialSparklineTestId } from "./social-sparkline";
import { SocialEngagementRateCard } from "./social-engagement-rate";
import { tForActive } from "@/lib/i18n/t-for-active";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await tForActive();
  return { title: t("sidebar.analytics") };
}
import { SocialCsvExport, type CsvRow } from "./social-csv-export";

/**
 * M4 — social analytics dashboard.
 * M5 — KPI dashboard (metric switcher, vs-prior deltas, partial
 *      pill, healthy status, as-of freshness, CSV export).
 *
 * The page reads:
 *
 *   - the workspace's connected social channels
 *   - the last 90 days of `social_profile_daily_metric` rows
 *   - the workspace timezone (for date boundaries)
 *
 * For each connected profile it builds a summary card and a chart +
 * table pair. Two URL parameters control the view:
 *
 *   - `?window=7|30|90` — the time window for the chart + tiles
 *   - `?metric=followerCount|reach|views|engagedAccounts|interactions`
 *                       — which of the five daily metrics the chart
 *                         plots (tiles + table always show all five)
 *
 * Both are Server Component props, not client state, so the URL is
 * shareable and the page is fully rendered on the server.
 *
 * Client reviewers (workspace role `client_reviewer`) are denied.
 * They see 404, not a redirect, so the analytics surface does not
 * leak existence.
 */

const MAX_LOOKBACK_DAYS = 90;
const CRON_HOUR_LOCAL = 3; // 03:15 workspace-tz (sync.ts convention)
const CRON_MINUTE_LOCAL = 15;
const METRIC_LABEL_KEYS: Record<SocialMetric, string> = {
  followerCount: "analytics.metricFollowers",
  reach: "analytics.metricReach",
  views: "analytics.metricViews",
  engagedAccounts: "analytics.metricEngagedAccounts",
  interactions: "analytics.metricInteractions",
};

export default async function SocialAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ window?: string | string[]; metric?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { t, code } = await tForActive();
  const { slug } = await params;
  const sp = await searchParams;
  const rawWindow = Array.isArray(sp.window) ? sp.window[0] : sp.window;
  const rawMetric = Array.isArray(sp.metric) ? sp.metric[0] : sp.metric;
  const window: SocialWindow = parseSocialWindow(rawWindow);
  const metric: SocialMetric = parseSocialMetric(rawMetric);

  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();

  // Deny client reviewers. They can browse /app/w/[slug]/client/* but
  // not the analytics surface. Agency admins and other internal users
  // (any non-client role) may view.
  const hasInternalAccess = await hasWorkspaceRole({ id: session.user.id }, workspace.id, [
    ...INTERNAL_WORKSPACE_ROLES,
  ]);
  if (!hasInternalAccess) notFound();

  // Fetch connected channels (not manual) and the last 90 days of metrics.
  const channels = await db
    .select()
    .from(socialChannels)
    .where(
      and(
        eq(socialChannels.workspaceId, workspace.id),
        eq(socialChannels.connectionStatus, "connected"),
        isNull(socialChannels.archivedAt),
      ),
    )
    .orderBy(desc(socialChannels.lastSyncedAt));

  const lookbackIso = new Date();
  lookbackIso.setDate(lookbackIso.getDate() - MAX_LOOKBACK_DAYS);
  const channelIds = channels.map((c) => c.id);
  const metricRows =
    channelIds.length === 0
      ? []
      : await db
          .select()
          .from(socialProfileDailyMetrics)
          .where(
            and(
              inArray(socialProfileDailyMetrics.socialChannelId, channelIds),
              gte(socialProfileDailyMetrics.metricDate, lookbackIso.toISOString().slice(0, 10)),
            ),
          )
          .orderBy(socialProfileDailyMetrics.metricDate);

  // Group metrics by channel.
  const byChannel = new Map<string, typeof metricRows>();
  for (const row of metricRows) {
    const arr = byChannel.get(row.socialChannelId) ?? [];
    arr.push(row);
    byChannel.set(row.socialChannelId, arr);
  }

  // Pre-compute the page-level "any health signals?" decision so we
  // can render the right sibling of the banner (the banner is
  // intentionally quiet; the healthy status is its positive twin).
  const now = new Date();
  const hasAnySignals = channels.some((c) => {
    if (c.connectionStatus === "needs_reauth") return true;
    if (c.lastSyncErrorCode) return true;
    const latest = (byChannel.get(c.id) ?? [])
      .slice()
      .sort((a, b) => (a.metricDate < b.metricDate ? 1 : -1))[0];
    if (latest) {
      const sm = latest.sourceMetadata as { providerErrorCode?: string } | null;
      if (sm?.providerErrorCode) return true;
    }
    if (c.lastSyncedAt) {
      const ageMs = now.getTime() - c.lastSyncedAt.getTime();
      if (ageMs > 25 * 60 * 60 * 1000) return true;
    }
    return false;
  });

  // The most-recent sync across all channels — used by both the
  // page-level "as of" line and the healthy-status line.
  const mostRecentSync = channels.reduce<Date | null>((acc, c) => {
    if (!c.lastSyncedAt) return acc;
    if (!acc) return c.lastSyncedAt;
    return c.lastSyncedAt > acc ? c.lastSyncedAt : acc;
  }, null);

  // Pre-compute the next-sync ETA. The cron is intentionally
  // simplified: 03:15 workspace-tz, daily. We display a coarse
  // "in Xh Ym" only when the most recent sync is fresh enough
  // that the next tick is meaningful. Operators trust the cron
  // to fire; the ETA is a convenience, not a contract.
  const nextSyncEtaText = mostRecentSync ? nextSyncEta(now, workspace.timezone) : null;
  const metricText = t(METRIC_LABEL_KEYS[metric]);

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

      <SocialSyncDiagnostics
        channels={channels.map((c) => {
          // Same data slice the banner uses. The diagnostics only
          // needs the connection-state fields, so we keep the mapping
          // explicit (and narrow) rather than passing the full row.
          const latestMetric = (byChannel.get(c.id) ?? [])
            .slice()
            .sort((a, b) => (a.metricDate < b.metricDate ? 1 : -1))[0];
          const latestProviderError = latestMetric
            ? ((
                latestMetric.sourceMetadata as {
                  providerErrorCode?: string;
                } | null
              )?.providerErrorCode ?? null)
            : null;
          return {
            id: c.id,
            accountName: c.accountName,
            platform: c.platform as "instagram" | "facebook" | "tiktok",
            connectionStatus: c.connectionStatus as
              "manual" | "connected" | "needs_reauth" | "sync_error" | "disconnected",
            lastSyncedAt: c.lastSyncedAt,
            lastSyncErrorCode: c.lastSyncErrorCode,
            latestProviderErrorCode: latestProviderError,
          };
        })}
        slug={slug}
        t={t}
      />
      {/* M5 — page-level freshness line. Sits below the page
          description so it doesn't fight the title. Sits above
          the banner/strip so an operator scanning the page
          answers "how fresh is this?" before they read any
          numbers. */}
      {mostRecentSync ? (
        <p
          className="text-label text-fg-muted -mt-3"
          data-testid="social-analytics-as-of"
          aria-label={t("analytics.asOf", {
            date: formatRelativeDate(mostRecentSync, now, code),
          })}
        >
          {t("analytics.asOf", { date: formatRelativeDate(mostRecentSync, now, code) })}
          {nextSyncEtaText ? <> · {t("analytics.nextRefresh", { eta: nextSyncEtaText })}</> : null}
        </p>
      ) : null}

      <SocialHealthBanner
        channels={channels.map((c) => {
          const latestMetric = (byChannel.get(c.id) ?? [])
            .slice()
            .sort((a, b) => (a.metricDate < b.metricDate ? 1 : -1))[0];
          const latestProviderError = latestMetric
            ? ((
                latestMetric.sourceMetadata as {
                  providerErrorCode?: string;
                } | null
              )?.providerErrorCode ?? null)
            : null;
          return {
            id: c.id,
            accountName: c.accountName,
            platform: c.platform as "instagram" | "facebook" | "tiktok",
            connectionStatus: c.connectionStatus as
              "manual" | "connected" | "needs_reauth" | "sync_error" | "disconnected",
            lastSyncedAt: c.lastSyncedAt,
            lastSyncErrorCode: c.lastSyncErrorCode,
            latestProviderErrorCode: latestProviderError,
          };
        })}
        slug={slug}
      />

      {/* M5 — the banner's positive twin. Rendered only when the
          banner is empty. Same "we noticed" tone, opposite
          signal. */}
      {!hasAnySignals && channels.length > 0 ? (
        <SocialHealthyStatus channelCount={channels.length} asOf={mostRecentSync} now={now} />
      ) : null}

      {channels.length > 0 ? (
        <SocialAggregateStrip
          channels={channels.map<AggregateChannel>((c) => {
            const fullSeries: MetricSeriesPoint[] = (byChannel.get(c.id) ?? []).map((m) => ({
              metricDate: m.metricDate,
              followerCount: m.followerCount,
              reach: m.reach,
              views: m.views,
              engagedAccounts: m.engagedAccounts,
              interactions: m.interactions,
              partial: (m.sourceMetadata as { partial?: boolean } | null)?.partial === true,
            }));
            const summary = buildProfileSummary({
              fullSeries,
              lastSyncedAt: c.lastSyncedAt,
              connectionStatus: c.connectionStatus as
                "manual" | "connected" | "needs_reauth" | "sync_error" | "disconnected",
            });
            return {
              id: c.id,
              accountName: c.accountName,
              platform: c.platform as "instagram" | "facebook" | "tiktok",
              fullSeries,
              growth7Absolute: summary.growth7.absolute,
              growth7Percent: summary.growth7.percent,
            };
          })}
          windowDays={window}
        />
      ) : null}

      {/* M5 — two segmented controls side-by-side. The window
          selector is unchanged in behavior from M4. The metric
          selector is new and defaults to `followerCount` (the
          M4 chart metric). Both are URL-driven, both preserve
          the other's selection when one is changed. */}
      <div className="flex flex-wrap items-center gap-3" data-testid="social-analytics-controls">
        <SegmentedControl<SocialWindow>
          label={t("analytics.windowSelector")}
          current={window}
          options={([7, 30, 90] as const).map<SegmentedOption<SocialWindow>>((w) => ({
            value: w,
            label: t("analytics.days", { count: w }),
            href: `/app/w/${slug}/analytics/social?window=${w}&metric=${metric}`,
            testId: `window-${w}`,
          }))}
        />
        <SegmentedControl<SocialMetric>
          label={t("analytics.metricSelector")}
          current={metric}
          options={SOCIAL_METRICS.map<SegmentedOption<SocialMetric>>((m) => ({
            value: m,
            label: t(METRIC_LABEL_KEYS[m]),
            href: `/app/w/${slug}/analytics/social?window=${window}&metric=${m}`,
            testId: `metric-${m}`,
          }))}
        />
      </div>

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
        <div className="space-y-8">
          {channels.map((channel) => {
            const fullSeries: MetricSeriesPoint[] = (byChannel.get(channel.id) ?? []).map((m) => ({
              metricDate: m.metricDate,
              followerCount: m.followerCount,
              reach: m.reach,
              views: m.views,
              engagedAccounts: m.engagedAccounts,
              interactions: m.interactions,
              partial: (m.sourceMetadata as { partial?: boolean } | null)?.partial === true,
            }));
            const summary = buildProfileSummary({
              fullSeries,
              lastSyncedAt: channel.lastSyncedAt,
              connectionStatus: channel.connectionStatus as
                "manual" | "connected" | "needs_reauth" | "sync_error" | "disconnected",
            });
            const windowed = seriesInWindow(fullSeries, window);
            // M5 — the chart plots the user-selected metric, not
            // just followers. The summary tile + vs-prior + trend
            // badge use the SAME field so the three numbers tell
            // the same story.
            const growth = calculateGrowth(windowed, metric);
            const priorWindowed = priorSeriesInWindow(fullSeries, window);
            const priorGrowth = calculateGrowth(priorWindowed, metric);
            const chartPts = chartSeries(windowed, metric);
            const tableId = `social-table-${channel.id}`;
            return (
              <Card key={channel.id} padding="lg" data-testid={`social-card-${channel.id}`}>
                <div className="space-y-4">
                  <header className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <PlatformIcon platform={channel.platform} tile />
                      <div>
                        <h2 className="text-title-section text-fg-primary font-semibold">
                          {channel.accountName}
                        </h2>
                        <p className="text-label text-fg-muted">
                          {platformLabel(channel.platform)}
                          {channel.handle ? ` · @${channel.handle}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <SocialSparkline
                        channelId={channel.id}
                        series={fullSeries}
                        ariaLabel={`${channel.accountName} follower trend, last 7 days`}
                      />
                      <div
                        className="text-label text-fg-muted inline-flex items-center gap-2"
                        data-testid={socialSparklineTestId(channel.id)}
                      >
                        <Activity className="h-3 w-3" aria-hidden={true} />
                        {t("analytics.lastSynced", {
                          date: channel.lastSyncedAt
                            ? formatRelativeDate(channel.lastSyncedAt, new Date(), code)
                            : "—",
                        })}
                      </div>
                    </div>
                  </header>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <SummaryCard
                      label={t("analytics.currentFollowers")}
                      value={
                        summary.currentFollowers === null
                          ? "—"
                          : summary.currentFollowers.toLocaleString()
                      }
                    />
                    <SummaryCard
                      label={t("analytics.windowChange", {
                        count: window,
                        metric: metricText.toLowerCase(),
                      })}
                      value={
                        growth.absolute === null
                          ? "—"
                          : `${growth.absolute > 0 ? "+" : ""}${growth.absolute.toLocaleString()}`
                      }
                      sub={
                        growth.percent === null
                          ? null
                          : `${growth.percent > 0 ? "+" : ""}${growth.percent.toFixed(1)}%`
                      }
                      testId="summary-card-growth"
                      // M5 — vs prior N days. A positive prior delta
                      // means the channel is decelerating (smaller
                      // growth than the previous window); a negative
                      // prior delta means accelerating. We render it
                      // as a small sub-line with a directional icon
                      // to make the trend scannable.
                      priorSub={
                        growth.absolute === null || priorGrowth.absolute === null
                          ? null
                          : {
                              absolute: priorGrowth.absolute,
                              percent: priorGrowth.percent,
                              window,
                            }
                      }
                      partial={growth.partial}
                      partialLabel={t("analytics.partial")}
                      priorLabel={
                        growth.absolute === null || priorGrowth.absolute === null
                          ? null
                          : t("analytics.vsPrior", {
                              count: window,
                              value: `${priorGrowth.absolute > 0 ? "+" : ""}${priorGrowth.absolute.toLocaleString()}`,
                              percent:
                                typeof priorGrowth.percent === "number"
                                  ? ` (${priorGrowth.percent > 0 ? "+" : ""}${priorGrowth.percent.toFixed(1)}%)`
                                  : "",
                            })
                      }
                    />
                    <SocialEngagementRateCard
                      channelId={channel.id}
                      rate={calculateEngagementRate(fullSeries)}
                    />
                  </div>

                  {windowed.length === 0 ? (
                    <p className="text-body text-fg-muted" data-testid="no-windowed-data">
                      {t("analytics.noWindowedData", { count: window })}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <SocialGrowthChart
                        title={`${platformLabel(channel.platform)} · last ${window} days`}
                        platform={platformLabel(channel.platform)}
                        profileName={channel.accountName}
                        metricLabel={metricText}
                        points={chartPts}
                        tableId={tableId}
                        growthPercent={growth.percent}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-title-card text-fg-primary font-semibold">
                      {t("analytics.dailyValues")}
                    </h3>
                    <SocialCsvExport
                      channelName={channel.accountName}
                      rows={windowed.map<CsvRow>((p) => ({
                        metricDate: p.metricDate,
                        followerCount: p.followerCount,
                        reach: p.reach,
                        views: p.views,
                        engagedAccounts: p.engagedAccounts,
                        interactions: p.interactions,
                        partial: p.partial,
                      }))}
                    />
                  </div>

                  <SocialMetricsTable
                    tableId={tableId}
                    rows={windowed.map((p): SocialMetricsRow => ({
                      metricDate: p.metricDate,
                      followerCount: p.followerCount,
                      reach: p.reach,
                      views: p.views,
                      engagedAccounts: p.engagedAccounts,
                      interactions: p.interactions,
                      partial: p.partial,
                    }))}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

type PriorSub = {
  absolute: number;
  percent: number | null;
  window: number;
};

function SummaryCard({
  label,
  value,
  sub,
  priorSub,
  partial,
  partialLabel,
  priorLabel,
  testId,
}: {
  label: string;
  value: string;
  sub?: string | null;
  priorSub?: PriorSub | null;
  partial?: boolean;
  partialLabel?: string;
  priorLabel?: string | null;
  testId?: string;
}) {
  return (
    <div
      className="border-border bg-surface-subtle rounded-md border p-3"
      data-testid={testId ?? "summary-card"}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-label text-fg-muted">{label}</p>
        {partial ? (
          <span
            data-testid="summary-card-partial"
            className="border-warning/40 bg-warning/5 text-warning rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
          >
            {partialLabel ?? "partial"}
          </span>
        ) : null}
      </div>
      <p className="text-title-card text-fg-primary mt-1 font-semibold">{value}</p>
      {sub ? <p className="text-label text-fg-secondary">{sub}</p> : null}
      {priorSub ? (
        <p
          className="text-label text-fg-muted mt-1 inline-flex items-center gap-1"
          data-testid="summary-card-prior"
        >
          {priorSub.absolute > 0 ? (
            <TrendingUp className="h-3 w-3" aria-hidden={true} />
          ) : priorSub.absolute < 0 ? (
            <TrendingDown className="h-3 w-3" aria-hidden={true} />
          ) : (
            <Minus className="h-3 w-3" aria-hidden={true} />
          )}
          {priorLabel ??
            `vs prior ${priorSub.window}d: ${priorSub.absolute > 0 ? "+" : ""}${priorSub.absolute.toLocaleString()}`}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Compute "next refresh in Xh Ym" given the current time and the
 * workspace timezone. The cron convention is 03:15 daily. If we're
 * already past 03:15 today, the next tick is tomorrow at 03:15.
 *
 * This is a coarse approximation: workspace-tz-to-UTC is computed
 * via `Intl.DateTimeFormat`, which doesn't honour DST transitions
 * perfectly for the "tomorrow at 03:15" branch, but the worst
 * case is a 1-hour drift, which is fine for a human-facing
 * countdown.
 */
function nextSyncEta(now: Date, timezone: string): string | null {
  try {
    // Build today's 03:15 in the workspace timezone by formatting
    // the current time and reading back. Simpler: just compute the
    // next 03:15 in the workspace's local clock and convert to
    // ms-epoch.
    const localFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = localFormatter.formatToParts(now);
    const lookup: Record<string, string> = {};
    for (const p of parts) lookup[p.type] = p.value;
    const localYear = Number(parts.find((p) => p.type === "year")?.value);
    const localMonth = Number(parts.find((p) => p.type === "month")?.value);
    const localDay = Number(parts.find((p) => p.type === "day")?.value);
    const localHour = Number(parts.find((p) => p.type === "hour")?.value);
    const localMin = Number(parts.find((p) => p.type === "minute")?.value);
    if ([localYear, localMonth, localDay, localHour, localMin].some((n) => !Number.isFinite(n))) {
      return null;
    }
    // Compute ms-of-day for the cron target in the local zone.
    const localNowMs = localHour * 3600_000 + localMin * 60_000;
    const targetMs = CRON_HOUR_LOCAL * 3600_000 + CRON_MINUTE_LOCAL * 60_000;
    // The next target is `targetMs` from the start of the local
    // day. If we've already passed it, the next one is tomorrow.
    let deltaMs = targetMs - localNowMs;
    if (deltaMs <= 0) deltaMs += 24 * 3600_000;
    // Convert from local-zone ms to UTC ms by anchoring on the
    // current UTC offset of the workspace timezone.
    const localAsUtc = Date.UTC(localYear, localMonth - 1, localDay, localHour, localMin);
    const utcOffsetMs = localAsUtc - now.getTime();
    const targetUtcMs = Date.UTC(
      localYear,
      localMonth - 1,
      localDay,
      CRON_HOUR_LOCAL,
      CRON_MINUTE_LOCAL,
    );
    const nextUtc = now.getTime() + deltaMs + utcOffsetMs - targetUtcMs;
    return formatHms(nextUtc - now.getTime());
  } catch {
    return null;
  }
}

function formatHms(deltaMs: number): string | null {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return null;
  const totalMin = Math.round(deltaMs / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
