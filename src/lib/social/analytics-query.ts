import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { db as appDb } from "@/lib/db";
import { socialChannels, socialPostObservations, socialProfileDailyMetrics } from "@/lib/db/schema";
import { metricDateInTimeZone } from "./timezone";

type Db = typeof appDb;

export const SOCIAL_ANALYTICS_LOOKBACK_DAYS = 90;

export type SocialAnalyticsQueryChannel = {
  channel: typeof socialChannels.$inferSelect;
  metrics: (typeof socialProfileDailyMetrics.$inferSelect)[];
};

export type SocialPostObservationQueryRow = {
  observation: typeof socialPostObservations.$inferSelect;
  channel: typeof socialChannels.$inferSelect;
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
  lookbackDays = SOCIAL_ANALYTICS_LOOKBACK_DAYS,
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

  const cutoff = new Date(now.getTime() - lookbackDays * 86_400_000);
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

/**
 * Workspace-scoped post observations for the Command Center. The provider
 * sync owns collection; this query owns authorization scope and lookback.
 */
export async function querySocialPostObservations(
  database: Db,
  workspaceId: string,
  workspaceTimezone: string,
  now: Date = new Date(),
  lookbackDays = SOCIAL_ANALYTICS_LOOKBACK_DAYS,
): Promise<SocialPostObservationQueryRow[]> {
  const cutoff = new Date(now.getTime() - lookbackDays * 86_400_000);
  return database
    .select({ observation: socialPostObservations, channel: socialChannels })
    .from(socialPostObservations)
    .innerJoin(socialChannels, eq(socialChannels.id, socialPostObservations.socialChannelId))
    .where(
      and(
        eq(socialChannels.workspaceId, workspaceId),
        eq(socialChannels.connectionStatus, "connected"),
        isNull(socialChannels.archivedAt),
        gte(
          socialPostObservations.observationDate,
          metricDateInTimeZone(cutoff, workspaceTimezone),
        ),
      ),
    )
    .orderBy(desc(socialPostObservations.publishedAt), desc(socialPostObservations.observedAt))
    .limit(200);
}

/** Resolve one post observation for a workspace-scoped research handoff. */
export async function querySocialPostObservation(
  database: Db,
  workspaceId: string,
  observationId: string,
): Promise<SocialPostObservationQueryRow | null> {
  const row = await database
    .select({ observation: socialPostObservations, channel: socialChannels })
    .from(socialPostObservations)
    .innerJoin(socialChannels, eq(socialChannels.id, socialPostObservations.socialChannelId))
    .where(
      and(
        eq(socialPostObservations.id, observationId),
        eq(socialChannels.workspaceId, workspaceId),
        eq(socialChannels.connectionStatus, "connected"),
        isNull(socialChannels.archivedAt),
      ),
    )
    .limit(1);
  return row[0] ?? null;
}
