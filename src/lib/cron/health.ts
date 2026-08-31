import "server-only";
import { desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { cronTickHistory, type CronTickOutcome } from "@/lib/db/schema";
import { serverEnv } from "@/lib/validation/env";

/**
 * Phase 2 of the social-cron-admin plan.
 *
 * Aggregates the `cron_tick_history` rows the route layer writes
 * into the data shape the `/app/platform/operations/cron` page
 * renders. The helpers below are read-only and pure-DB; no env
 * mutation, no Sentry fan-out, no auth gating (the page does the
 * gating via `requirePlatformPermission`).
 *
 * Why a separate file from `src/lib/cron/history.ts`: the history
 * module is the writer + single-row reader (low-level, used by the
 * route + the audit hook in Phase 3). This module is the
 * page-level aggregator (higher-level, used only by the page).
 * Splitting the read paths by their caller keeps the surface
 * narrow.
 */

/**
 * Cadence per cron name. The page renders "last tick <ago>" with a
 * green/amber/red dot whose threshold is derived from this. The
 * list is intentionally small — the existing crons are the
 * `social-metrics` (15-min), `outbox` (1-min), `email-dispatch`
 * (1-min), `audit-retention` (daily 04:00 UTC), and the
 * `backup` + `cert` crons which run shell-only and never write to
 * this table. New cron names default to the 15-min cadence.
 *
 * If a cron ticks at an unexpected cadence, the tone still works —
 * it just uses the closest bucket. The cadence is the *expected*
 * maximum gap, not the actual interval.
 */
export const EXPECTED_CADENCE_MS: Record<string, number> = {
  "social-metrics": 15 * 60_000,
  outbox: 60_000,
  "email-dispatch": 60_000,
  "audit-retention": 24 * 60 * 60_000,
};

const DEFAULT_CADENCE_MS = 15 * 60_000;

/** "green" ≤ 2× cadence, "amber" ≤ 4× cadence, "red" > 4× cadence. */
export function ageTone(ageMs: number, cronName: string): "green" | "amber" | "red" {
  const cadence = EXPECTED_CADENCE_MS[cronName] ?? DEFAULT_CADENCE_MS;
  if (ageMs <= 2 * cadence) return "green";
  if (ageMs <= 4 * cadence) return "amber";
  return "red";
}

export type CronHealth = {
  cronName: string;
  /** Most recent tick, or null if no tick in the window. */
  latest: {
    startedAt: Date;
    finishedAt: Date | null;
    outcome: CronTickOutcome;
    claimed: number;
    succeeded: number;
    failed: number;
    needsReauth: number;
    skipped: number;
    kekStatus: "ok" | "kek_missing" | null;
    errorText: string | null;
    triggeredBy: string;
  } | null;
  /** Last 24h aggregate. */
  rollup24h: {
    ticks: number;
    claimed: number;
    succeeded: number;
    failed: number;
    needsReauth: number;
    successCount: number;
    softDeadlineCount: number;
    errorCount: number;
    lastErrorText: string | null;
  };
  /** Last 24 ticks for the sparkline. */
  recent24: Array<{
    startedAt: Date;
    outcome: CronTickOutcome;
    claimed: number;
  }>;
};

/**
 * The full page-level read. Returns one `CronHealth` per active
 * cron name, sorted by name. The page is `force-dynamic` so
 * `revalidatePath` after a "Run now" (Phase 3) is the only cache
 * invalidation we need.
 */
export async function getCronHealth(now: Date = new Date()): Promise<{
  crons: CronHealth[];
  socialSyncEnabled: boolean;
  platformKekAvailable: boolean;
  cronSecretConfigured: boolean;
}> {
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
  const since24h = new Date(now.getTime() - 24 * 60 * 60_000);

  // One pass: fetch the latest row per cron + the 24h window
  // for the rollup + 24 latest rows for the sparkline. Drizzle
  // gives us the raw rows; we aggregate in JS. The single-pass
  // approach bounds the round trips at 3 regardless of cron count.
  const latestRows = await db
    .select()
    .from(cronTickHistory)
    .where(gte(cronTickHistory.startedAt, since30d))
    .orderBy(desc(cronTickHistory.startedAt))
    .limit(500);

  const rollupRows = await db
    .select({
      cronName: cronTickHistory.cronName,
      outcome: cronTickHistory.outcome,
      claimed: cronTickHistory.claimed,
      succeeded: cronTickHistory.succeeded,
      failed: cronTickHistory.failed,
      needsReauth: cronTickHistory.needsReauth,
      errorText: cronTickHistory.errorText,
      startedAt: cronTickHistory.startedAt,
    })
    .from(cronTickHistory)
    .where(gte(cronTickHistory.startedAt, since24h))
    .orderBy(desc(cronTickHistory.startedAt))
    .limit(2000);

  // Group by cron name. For each name: latest (first row in
  // `latestRows` ordered DESC), rollup (sum across `rollupRows`),
  // and the 24 most recent rows for the sparkline.
  const byCron = new Map<string, CronHealth>();

  for (const row of latestRows) {
    if (byCron.has(row.cronName)) continue; // first (newest) row wins
    byCron.set(row.cronName, {
      cronName: row.cronName,
      latest: {
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        outcome: row.outcome as CronTickOutcome,
        claimed: row.claimed,
        succeeded: row.succeeded,
        failed: row.failed,
        needsReauth: row.needsReauth,
        skipped: row.skipped,
        kekStatus: (row.kekStatus ?? null) as "ok" | "kek_missing" | null,
        errorText: row.errorText,
        triggeredBy: row.triggeredBy,
      },
      rollup24h: {
        ticks: 0,
        claimed: 0,
        succeeded: 0,
        failed: 0,
        needsReauth: 0,
        successCount: 0,
        softDeadlineCount: 0,
        errorCount: 0,
        lastErrorText: null,
      },
      recent24: [],
    });
  }

  for (const row of rollupRows) {
    const entry = byCron.get(row.cronName);
    if (!entry) continue;
    entry.rollup24h.ticks += 1;
    entry.rollup24h.claimed += row.claimed;
    entry.rollup24h.succeeded += row.succeeded;
    entry.rollup24h.failed += row.failed;
    entry.rollup24h.needsReauth += row.needsReauth;
    if (row.outcome === "success") entry.rollup24h.successCount += 1;
    else if (row.outcome === "soft_deadline") entry.rollup24h.softDeadlineCount += 1;
    else if (row.outcome === "error") {
      entry.rollup24h.errorCount += 1;
      if (entry.rollup24h.lastErrorText === null) {
        entry.rollup24h.lastErrorText = row.errorText;
      }
    }
    if (entry.recent24.length < 24) {
      entry.recent24.push({
        startedAt: row.startedAt,
        outcome: row.outcome as CronTickOutcome,
        claimed: row.claimed,
      });
    }
  }

  // Stable sort: social-metrics first, then alphabetical. The
  // social-metrics cron is the one the page is designed around,
  // and the operator cares most about that card being on top.
  const crons = Array.from(byCron.values()).sort((a, b) => {
    if (a.cronName === "social-metrics") return -1;
    if (b.cronName === "social-metrics") return 1;
    return a.cronName.localeCompare(b.cronName);
  });

  return {
    crons,
    socialSyncEnabled: serverEnv.SOCIAL_SYNC_ENABLED,
    platformKekAvailable: !!serverEnv.SOCIAL_TOKEN_ENCRYPTION_KEY,
    cronSecretConfigured: !!serverEnv.CRON_SECRET,
  };
}

/**
 * Log tail for one cron. Used by the `<details>` block on the page.
 * Bounded at 50 rows; the helper is the same as the history read
 * but the page re-queries on user click via a separate route in
 * Phase 3's "Run now" form. For Phase 2 we just inline the
 * 50-row cap.
 */
export async function getCronLogTail(
  cronName: string,
  limit = 50,
): Promise<
  Array<{
    id: number;
    startedAt: Date;
    outcome: CronTickOutcome;
    claimed: number;
    succeeded: number;
    failed: number;
    errorText: string | null;
    triggeredBy: string;
  }>
> {
  const rows = await db
    .select({
      id: cronTickHistory.id,
      startedAt: cronTickHistory.startedAt,
      outcome: cronTickHistory.outcome,
      claimed: cronTickHistory.claimed,
      succeeded: cronTickHistory.succeeded,
      failed: cronTickHistory.failed,
      errorText: cronTickHistory.errorText,
      triggeredBy: cronTickHistory.triggeredBy,
    })
    .from(cronTickHistory)
    .where(eq(cronTickHistory.cronName, cronName))
    .orderBy(desc(cronTickHistory.startedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, outcome: r.outcome as CronTickOutcome }));
}

/**
 * Multi-cron log tail (used when the page wants to show all
 * recent ticks in one section). The page calls this with the
 * list of active cron names so the user can see "the last 30
 * ticks across all crons" in a single feed.
 */
export async function getMultiCronLogTail(
  cronNames: string[],
  limit = 30,
): Promise<
  Array<{
    id: number;
    cronName: string;
    startedAt: Date;
    outcome: CronTickOutcome;
    claimed: number;
    succeeded: number;
    failed: number;
    errorText: string | null;
    triggeredBy: string;
  }>
> {
  if (cronNames.length === 0) return [];
  const rows = await db
    .select({
      id: cronTickHistory.id,
      cronName: cronTickHistory.cronName,
      startedAt: cronTickHistory.startedAt,
      outcome: cronTickHistory.outcome,
      claimed: cronTickHistory.claimed,
      succeeded: cronTickHistory.succeeded,
      failed: cronTickHistory.failed,
      errorText: cronTickHistory.errorText,
      triggeredBy: cronTickHistory.triggeredBy,
    })
    .from(cronTickHistory)
    .where(inArray(cronTickHistory.cronName, cronNames))
    .orderBy(desc(cronTickHistory.startedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, outcome: r.outcome as CronTickOutcome }));
}
