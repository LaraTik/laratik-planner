import { redirect, notFound } from "next/navigation";
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { Activity, BarChart3 } from "lucide-react";
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
  chartSeries,
  parseSocialWindow,
  seriesInWindow,
  type MetricSeriesPoint,
  type SocialWindow,
} from "@/lib/social/analytics";
import { SocialGrowthChart } from "./social-growth-chart";
import { SocialMetricsTable, type SocialMetricsRow } from "./social-metrics-table";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";

/**
 * M4 — social analytics dashboard.
 *
 * The page reads:
 *
 *   - the workspace's connected social channels
 *   - the last 90 days of `social_profile_daily_metric` rows
 *   - the workspace timezone (for date boundaries)
 *
 * For each connected profile it builds a summary card and a chart +
 * table pair. The window selector is a Server Component prop
 * (`?window=7|30|90`), not client-side state, so the URL is
 * shareable.
 *
 * Client reviewers (workspace role `client_reviewer`) are denied.
 * They see 404, not a redirect, so the analytics surface does not
 * leak existence.
 */

const MAX_LOOKBACK_DAYS = 90;

export default async function SocialAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ window?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const { slug } = await params;
  const sp = await searchParams;
  const rawWindow = Array.isArray(sp.window) ? sp.window[0] : sp.window;
  const window: SocialWindow = parseSocialWindow(rawWindow);

  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) notFound();

  // Deny client reviewers. They can browse /app/w/[slug]/client/* but
  // not the analytics surface. Agency admins and other internal users
  // (any non-client role) may view.
  //
  // The previous form of this check was `hasWorkspaceRole(actor, ws,
  // ["client_reviewer"])` and was wrong: `hasWorkspaceRole` has an
  // agency-admin shortcut that returns `true` for any admin regardless
  // of the role list, so the page 404'd every agency admin (the admin
  // shortcut short-circuited them into the deny set). Flip to a
  // positive "requires internal access" predicate — admins pass via
  // the same shortcut on the internal-roles list, pure `client_reviewer`
  // users return `false`, and users with mixed memberships pass because
  // they hold at least one internal role.
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
  // Scope the metric pull to THIS workspace's connected channels. The
  // previous form filtered by date only and loaded every metric row
  // for every workspace in the database into memory before grouping in
  // JS — both a cross-tenant data leak and a hot-path performance bug.
  // The empty-channel short-circuit avoids a needless query when the
  // workspace has nothing connected yet (the page renders an empty
  // state in that case).
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

  return (
    <div className="space-y-6" data-testid="social-analytics-page">
      <PageHeader
        eyebrow={workspace.name}
        title="Social analytics"
        description={
          <>
            Daily follower totals, growth windows, and connection health for the channels in this
            workspace.
            <span className="text-label text-fg-muted border-border bg-surface-subtle ml-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold">
              {workspace.timezone}
            </span>
          </>
        }
      />

      <nav
        aria-label="Window selector"
        className="flex items-center gap-2"
        data-testid="window-selector"
      >
        {([7, 30, 90] as const).map((w) => (
          <a
            key={w}
            href={`/app/w/${slug}/analytics/social?window=${w}`}
            className={`border-border text-body rounded-md border px-3 py-1 ${
              w === window ? "bg-primary text-primary-fg" : "bg-surface text-fg-secondary"
            }`}
            aria-current={w === window ? "page" : undefined}
            data-testid={`window-${w}`}
          >
            {w} days
          </a>
        ))}
      </nav>

      {channels.length === 0 ? (
        <Card variant="dashed" padding="lg" data-testid="social-analytics-empty">
          <EmptyState
            icon={<BarChart3 className="h-8 w-8" aria-hidden={true} />}
            title="No connected channels yet"
            description="Connect a Meta account on the Social Channels page to start collecting daily metrics."
            action={
              <a
                href={`/app/w/${slug}/channels`}
                className="border-border bg-surface text-fg-primary text-body rounded-md border px-4 py-2"
              >
                Go to Social Channels
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
            const chartPts = chartSeries(windowed, "followerCount");
            const tableId = `social-table-${channel.id}`;
            return (
              <Card key={channel.id} padding="lg" data-testid={`social-card-${channel.id}`}>
                <div className="space-y-4">
                  <header className="flex items-center justify-between gap-3">
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
                    <div className="text-label text-fg-muted inline-flex items-center gap-2">
                      <Activity className="h-3 w-3" aria-hidden={true} />
                      Last synced{" "}
                      {channel.lastSyncedAt ? formatRelativeDate(channel.lastSyncedAt) : "—"}
                    </div>
                  </header>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <SummaryCard
                      label="Current followers"
                      value={
                        summary.currentFollowers === null
                          ? "—"
                          : summary.currentFollowers.toLocaleString()
                      }
                    />
                    <SummaryCard
                      label={`${window}-day change`}
                      value={
                        summary[`growth${window}` as const].absolute === null
                          ? "—"
                          : summary[`growth${window}` as const].absolute!.toLocaleString()
                      }
                      sub={
                        summary[`growth${window}` as const].percent === null
                          ? null
                          : `${summary[`growth${window}` as const].percent!.toFixed(1)}%`
                      }
                    />
                    <SummaryCard
                      label="Connection"
                      value={summary.connectionStatus.replace("_", " ")}
                    />
                  </div>

                  {windowed.length === 0 ? (
                    <p className="text-body text-fg-muted" data-testid="no-windowed-data">
                      No data in the {window}-day window yet. The first snapshot lands within 24
                      hours of connecting; check back tomorrow.
                    </p>
                  ) : (
                    <SocialGrowthChart
                      title={`${platformLabel(channel.platform)} · last ${window} days`}
                      platform={platformLabel(channel.platform)}
                      profileName={channel.accountName}
                      points={chartPts}
                      tableId={tableId}
                    />
                  )}

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

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div
      className="border-border bg-surface-subtle rounded-md border p-3"
      data-testid="summary-card"
    >
      <p className="text-label text-fg-muted">{label}</p>
      <p className="text-title-card text-fg-primary mt-1 font-semibold">{value}</p>
      {sub ? <p className="text-label text-fg-secondary">{sub}</p> : null}
    </div>
  );
}
