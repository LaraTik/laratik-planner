import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { db as appDb } from "@/lib/db";
import { socialChannels, socialProfileDailyMetrics } from "@/lib/db/schema";
import { metricDateInTimeZone } from "./timezone";

type Db = typeof appDb;

export const SOCIAL_ANALYTICS_LOOKBACK_DAYS = 90;

export type SocialAnalyticsQueryChannel = {
  channel: typeof socialChannels.$inferSelect;
  metrics: (typeof socialProfileDailyMetrics.$inferSelect)[];
};

/**
 * Canonical authorized analytics read model. The query owns the connected,
 * non-archived scope and the workspace-local 90-day cutoff so pages and API
 * surfaces cannot drift into different definitions of the dashboard data.
 */
export async function querySocialAnalytics(
  database: Db,
  workspaceId: string,
  workspaceTimezone: string,
  now: Date = new Date(),
): Promise<SocialAnalyticsQueryChannel[]> {
  const channels = await database
    .select()
    .from(socialChannels)
    .where(
      and(
        eq(socialChannels.workspaceId, workspaceId),
        eq(socialChannels.connectionStatus, "connected"),
        isNull(socialChannels.archivedAt),
      ),
    )
    .orderBy(desc(socialChannels.lastSyncedAt), asc(socialChannels.accountName));
  if (channels.length === 0) return [];

  const cutoff = new Date(now.getTime() - SOCIAL_ANALYTICS_LOOKBACK_DAYS * 86_400_000);
  const metricRows = await database
    .select()
    .from(socialProfileDailyMetrics)
    .where(
      and(
        inArray(
          socialProfileDailyMetrics.socialChannelId,
          channels.map((channel) => channel.id),
        ),
        gte(socialProfileDailyMetrics.metricDate, metricDateInTimeZone(cutoff, workspaceTimezone)),
      ),
    )
    .orderBy(asc(socialProfileDailyMetrics.metricDate));
  const byChannel = new Map<string, (typeof metricRows)[number][]>();
  for (const row of metricRows) {
    const existing = byChannel.get(row.socialChannelId) ?? [];
    existing.push(row);
    byChannel.set(row.socialChannelId, existing);
  }
  return channels.map((channel) => ({ channel, metrics: byChannel.get(channel.id) ?? [] }));
}
