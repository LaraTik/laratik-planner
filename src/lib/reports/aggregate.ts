import "server-only";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { socialChannels, socialProfileDailyMetrics, workspaces } from "@/lib/db/schema";
import { Period } from "./templates/types";

/**
 * Reports data layer — computes the per-channel + per-template
 * aggregates that every report template renders from.
 *
 * The output shape is *stable*: it is the contract every template
 * consumes. Adding a new metric means adding a new field here AND a
 * column in `report_template_metric`. Templates never query the DB
 * directly.
 */

export interface ChannelRollup {
  channelId: string;
  channelName: string;
  channelType: string;
  workspaceId: string;
  workspaceName: string;
  /** Reach over the period (sum of daily `reach` rows). */
  reach: number;
  /** Views over the period. */
  views: number;
  /** Engaged accounts (deduped per-day unique). */
  engagedAccounts: number;
  /** Interactions (likes / comments / shares — provider-aggregated). */
  interactions: number;
  /** Follower growth: end-of-period followers minus start-of-period. */
  followerGrowth: number;
  /** Distinct days with observations (useful when filling gaps). */
  observedDays: number;
}

export interface AgencyReachAggregate {
  /** One row per (workspace × channel) — the per-source totals. */
  perChannel: ChannelRollup[];
  /** Agency-wide totals summed across all matched rows. */
  totals: {
    reach: number;
    views: number;
    engagedAccounts: number;
    interactions: number;
    followerGrowth: number;
  };
  /** Number of (workspace × channel) cells in the report. */
  cells: number;
  /** Number of days covered; `period.to - period.from + 1`. */
  days: number;
}

export interface ReportAggregateOptions {
  workspaceIds: string[];
  channelIds: string[];
  /** Inclusive lower bound (UTC). */
  from: Date;
  /** Inclusive upper bound (UTC). */
  to: Date;
}

/**
 * Sum a BigInt-mode drizzle column safely. BigInt conversion in
 * TypeScript can throw if the input is a string that overflows
 * `Number.MAX_SAFE_INTEGER`. We cap to 0 on null because `SUM` of a
 * nullable column returns NULL.
 */
function safeNumber(n: number | string | null | undefined): number {
  if (n === null || n === undefined) return 0;
  if (typeof n === "string") {
    const parsed = Number(n);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return Number.isFinite(n) ? n : 0;
}

export async function aggregateAgencyReach(
  args: ReportAggregateOptions,
): Promise<AgencyReachAggregate> {
  if (args.workspaceIds.length === 0) {
    return emptyAggregate(args);
  }
  if (args.channelIds.length === 0) {
    return emptyAggregate(args);
  }

  // ── source 1: channels + workspaces for the join shape ────────────
  const channels = await db
    .select({
      channelId: socialChannels.id,
      channelName: socialChannels.accountName,
      channelType: socialChannels.platform,
      workspaceId: socialChannels.workspaceId,
      workspaceName: workspaces.name,
    })
    .from(socialChannels)
    .innerJoin(workspaces, eq(workspaces.id, socialChannels.workspaceId))
    .where(
      and(
        inArray(socialChannels.workspaceId, args.workspaceIds),
        inArray(socialChannels.id, args.channelIds),
        eq(socialChannels.isActive, true),
      ),
    );

  if (channels.length === 0) {
    return emptyAggregate(args);
  }

  // ── source 2: metrics aggregate ────────────────────────────────────
  const metrics = await db
    .select({
      channelId: socialProfileDailyMetrics.socialChannelId,
      metricDate: socialProfileDailyMetrics.metricDate,
      reach: sql<number>`coalesce(sum(${socialProfileDailyMetrics.reach}), 0)`,
      views: sql<number>`coalesce(sum(${socialProfileDailyMetrics.views}), 0)`,
      engagedAccounts: sql<number>`coalesce(sum(${socialProfileDailyMetrics.engagedAccounts}), 0)`,
      interactions: sql<number>`coalesce(sum(${socialProfileDailyMetrics.interactions}), 0)`,
      observedDays: sql<number>`count(distinct ${socialProfileDailyMetrics.metricDate})`,
    })
    .from(socialProfileDailyMetrics)
    .where(
      and(
        inArray(socialProfileDailyMetrics.socialChannelId, args.channelIds),
        gte(socialProfileDailyMetrics.metricDate, toDateOnly(args.from)),
        lte(socialProfileDailyMetrics.metricDate, toDateOnly(args.to)),
      ),
    )
    .groupBy(socialProfileDailyMetrics.socialChannelId, socialProfileDailyMetrics.metricDate);

  // ── source 3: follower growth (period endpoint snapshots) ──────────
  // We need the FIRST and LAST observed follower_count per channel.
  // A single window query avoids needing a per-channel sub-select.
  const followerSnapshots = await db
    .select({
      channelId: socialProfileDailyMetrics.socialChannelId,
      firstFollowers: sql<number | null>`(
        SELECT follower_count FROM social_profile_daily_metric m2
        WHERE m2.social_channel_id = ${socialProfileDailyMetrics.socialChannelId}
          AND m2.metric_date BETWEEN ${toDateOnly(args.from)} AND ${toDateOnly(args.to)}
          AND m2.follower_count IS NOT NULL
        ORDER BY m2.metric_date ASC LIMIT 1
      )`,
      lastFollowers: sql<number | null>`(
        SELECT follower_count FROM social_profile_daily_metric m3
        WHERE m3.social_channel_id = ${socialProfileDailyMetrics.socialChannelId}
          AND m3.metric_date BETWEEN ${toDateOnly(args.from)} AND ${toDateOnly(args.to)}
          AND m3.follower_count IS NOT NULL
        ORDER BY m3.metric_date DESC LIMIT 1
      )`,
    })
    .from(socialProfileDailyMetrics)
    .where(
      and(
        inArray(socialProfileDailyMetrics.socialChannelId, args.channelIds),
        gte(socialProfileDailyMetrics.metricDate, toDateOnly(args.from)),
        lte(socialProfileDailyMetrics.metricDate, toDateOnly(args.to)),
      ),
    )
    .groupBy(socialProfileDailyMetrics.socialChannelId);

  // ── aggregate ─────────────────────────────────────────────────────
  const perChannelMap = new Map<string, ChannelRollup>();
  for (const ch of channels) {
    perChannelMap.set(ch.channelId, {
      channelId: ch.channelId,
      channelName: ch.channelName,
      channelType: ch.channelType,
      workspaceId: ch.workspaceId,
      workspaceName: ch.workspaceName,
      reach: 0,
      views: 0,
      engagedAccounts: 0,
      interactions: 0,
      followerGrowth: 0,
      observedDays: 0,
    });
  }
  for (const m of metrics) {
    const r = perChannelMap.get(m.channelId);
    if (!r) continue;
    r.reach += safeNumber(m.reach);
    r.views += safeNumber(m.views);
    r.engagedAccounts += safeNumber(m.engagedAccounts);
    r.interactions += safeNumber(m.interactions);
    r.observedDays += 1;
  }
  for (const s of followerSnapshots) {
    const r = perChannelMap.get(s.channelId);
    if (!r) continue;
    const first = safeNumber(s.firstFollowers);
    const last = safeNumber(s.lastFollowers);
    r.followerGrowth = last - first;
  }

  const perChannel = Array.from(perChannelMap.values());
  const totals = perChannel.reduce(
    (acc, row) => ({
      reach: acc.reach + row.reach,
      views: acc.views + row.views,
      engagedAccounts: acc.engagedAccounts + row.engagedAccounts,
      interactions: acc.interactions + row.interactions,
      followerGrowth: acc.followerGrowth + row.followerGrowth,
    }),
    {
      reach: 0,
      views: 0,
      engagedAccounts: 0,
      interactions: 0,
      followerGrowth: 0,
    },
  );

  return {
    perChannel,
    totals,
    cells: perChannel.length,
    days: daysBetween(args.from, args.to) + 1,
  };
}

function emptyAggregate(args: ReportAggregateOptions): AgencyReachAggregate {
  return {
    perChannel: [],
    totals: {
      reach: 0,
      views: 0,
      engagedAccounts: 0,
      interactions: 0,
      followerGrowth: 0,
    },
    cells: 0,
    days: daysBetween(args.from, args.to) + 1,
  };
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: Date, to: Date): number {
  const ms = Math.abs(to.getTime() - from.getTime());
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function daysBetweenAsNumber(period: Period): number {
  return daysBetween(period.from, period.to) + 1;
}

export function resolvePeriodPreset(preset: "7d" | "30d" | "90d", now: Date = new Date()): Period {
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const to = new Date(now);
  to.setUTCHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  from.setUTCHours(0, 0, 0, 0);
  return { from, to, preset, label: preset };
}

export function resolveCustomPeriod(from: Date, to: Date): Period {
  if (from.getTime() > to.getTime()) {
    throw new Error("Period start must be before period end.");
  }
  return { from, to, preset: "custom", label: "custom" };
}
