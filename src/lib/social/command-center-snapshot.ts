import "server-only";

import { querySocialAnalytics, querySocialPostObservations } from "@/lib/social/analytics-query";
import { buildCommandCenterSummary } from "@/lib/social/command-center";
import { db as appDb } from "@/lib/db";

type Db = typeof appDb;
import type { SocialSourceMetadata } from "@/lib/social/metrics";

/**
 * One read path for the Command Center, shared by the Overview page and the
 * `laratik_planner_get_command_center` MCP tool.
 *
 * Both consumers previously mapped the same rows independently, which is
 * exactly the setup where a bug like duplicate observations can appear in the
 * page while the tool reports healthy numbers. Sharing the mapper means what
 * an operator sees in the browser is what a debugging agent reads over MCP.
 */
export interface CommandCenterSnapshot {
  summary: ReturnType<typeof buildCommandCenterSummary>;
  /** Counts the UI never renders, included so a debugger can see the gap. */
  observationStats: {
    rows: number;
    distinctPosts: number;
    rowsMissingThumbnail: number;
    rowsMissingCaption: number;
  };
}

export async function getCommandCenterSnapshot(
  database: Db,
  workspaceId: string,
  timezone: string,
  now: Date = new Date(),
  windowDays: 30 | 90 = 30,
): Promise<CommandCenterSnapshot> {
  const [analytics, observations] = await Promise.all([
    querySocialAnalytics(database, workspaceId, timezone, now),
    querySocialPostObservations(database, workspaceId, timezone, now),
  ]);

  const summary = buildCommandCenterSummary(
    analytics.map(({ channel, metrics }) => ({
      id: channel.id,
      platform: channel.platform as "facebook" | "instagram" | "tiktok",
      accountName: channel.accountName,
      lastSyncedAt: channel.lastSyncedAt,
      lastSyncErrorCode: channel.lastSyncErrorCode,
      latestProviderErrorCode:
        (metrics[metrics.length - 1]?.sourceMetadata as SocialSourceMetadata | null)
          ?.providerErrorCode ?? null,
      series: metrics.map((row) => {
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
    })),
    now,
    observations.map(({ observation, channel }) => ({
      id: observation.id,
      channelId: channel.id,
      platform: channel.platform as "facebook" | "instagram" | "tiktok",
      accountName: channel.accountName,
      permalink: observation.permalink,
      thumbnailUrl: observation.thumbnailUrl,
      caption: observation.caption,
      publishedAt: observation.publishedAt,
      mediaType: observation.mediaType as
        "image" | "video" | "carousel" | "reel" | "story" | "unknown",
      views: observation.views,
      reach: observation.reach,
      likes: observation.likes,
      comments: observation.comments,
      saved: observation.saved,
      shares: observation.shares,
      interactions: observation.interactions,
      durationSeconds: observation.durationSeconds,
    })),
    timezone,
    windowDays,
  );

  return {
    summary,
    observationStats: {
      rows: observations.length,
      distinctPosts: summary.content.topPosts.length,
      rowsMissingThumbnail: observations.filter(
        ({ observation }) => observation.thumbnailUrl === null,
      ).length,
      rowsMissingCaption: observations.filter(({ observation }) => observation.caption === null)
        .length,
    },
  };
}
