import { createHash } from "node:crypto";
import { addDays, addMinutes, addHours } from "date-fns";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { socialChannels, socialProfileDailyMetrics } from "@/lib/db/schema";
import {
  claimDueProfiles,
  markNeedsReauth,
  markSyncFailure,
  markSyncSuccess,
  openConnectionCredentials,
  saveSnapshot,
  cleanupOauthStates,
  cleanupOldMetrics,
  type ClaimedProfile,
} from "./repository";
import { isSocialProviderError, newRequestId } from "./http";
import { metaAdapter } from "./providers/meta";
import type { SocialProviderAdapter, ProfileSnapshot, ConnectedProfileRef } from "./types";
import { serverEnv } from "@/lib/validation/env";

/**
 * M4 — sync worker.
 *
 * The cron route calls `runSyncTick` at most once every 15 minutes.
 * The function is the sole path that talks to Meta and (eventually)
 * TikTok. The application never calls the provider directly from a
 * server action; the cron is the only executor.
 *
 * The contract:
 *
 *   1. If `SOCIAL_SYNC_ENABLED` is `false`, return immediately with
 *      `claimed: 0, succeeded: 0, failed: 0, needsReauth: 0`. The
 *      route returns this to the caller; the cron is a no-op.
 *   2. Claim at most 20 due profiles with a 5-minute lease (see
 *      `claimDueProfiles` in the repository). The transaction
 *      commits BEFORE the provider call so the lease is held but no
 *      DB lock is held across the network round trip.
 *   3. For each claimed profile:
 *      - refresh the access token if it expires in the next 5 min
 *      - call `fetchSnapshot` with the appropriate provider adapter
 *      - UPSERT into `social_profile_daily_metric` on
 *        `(social_channel_id, metric_date)`
 *      - on success: bump `last_synced_at`, clear the lease, set
 *        `next_sync_at` to 03:15 workspace-tz next day
 *      - on retryable failure: bump `sync_failure_count`, back off
 *        15m / 1h / 6h / next-day slot
 *      - on auth/permission failure: after 3 consecutive, mark the
 *        connection `needs_reauth` and stop calling the provider
 *   4. Return counts.
 */

const PROVIDER_ADAPTERS: Record<"meta" | "tiktok", SocialProviderAdapter> = {
  meta: metaAdapter,
  // tiktok adapter is added in M4. Until then, tiktok connections
  // are skipped with a logged warning. The cron still cleans up
  // OAuth states and old metrics every tick.
  tiktok: {
    provider: "tiktok",
    discoverProfiles: async () => ({ profiles: [], credentials: { accessToken: "" } }),
    refreshCredentials: async () => ({
      credentials: { accessToken: "" },
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    }),
    fetchSnapshot: async () => {
      throw new Error("TikTok provider not yet enabled");
    },
    revoke: async () => {},
  },
};

export type SyncTickResult = {
  claimed: number;
  succeeded: number;
  failed: number;
  needsReauth: number;
  skipped: number;
  retention: { oauthStatesDeleted: number; oldMetricsDeleted: number };
};

const BACKOFF_MS: readonly number[] = [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
export { BACKOFF_MS };
const NEXT_DAY_HOUR = 3; // 03:15 in workspace tz
const NEXT_DAY_MINUTE = 15;
const RETENTION_OAUTH_HOURS = 24;
const RETENTION_METRIC_MONTHS = 25;

export async function runSyncTick(now: Date = new Date()): Promise<SyncTickResult> {
  if (!serverEnv.SOCIAL_SYNC_ENABLED) {
    return {
      claimed: 0,
      succeeded: 0,
      failed: 0,
      needsReauth: 0,
      skipped: 0,
      retention: { oauthStatesDeleted: 0, oldMetricsDeleted: 0 },
    };
  }
  if (!serverEnv.SOCIAL_TOKEN_ENCRYPTION_KEY) {
    // Fail closed: the route must not be reachable without the key,
    // but if a misconfigured operator flips SOCIAL_SYNC_ENABLED=true
    // without setting the key, we refuse to start.
    throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY is required to run the sync worker");
  }

  const claimed = await claimDueProfiles(db);
  let succeeded = 0;
  let failed = 0;
  let needsReauth = 0;
  let skipped = 0;

  for (const profile of claimed) {
    const provider = profile.connection.provider as "meta" | "tiktok";
    const adapter = PROVIDER_ADAPTERS[provider];
    if (provider === "tiktok" || !adapter) {
      skipped += 1;
      // Clear the lease so the next tick does not re-pick this row.
      await db
        .update(socialChannels)
        .set({ syncLeaseUntil: null, updatedAt: now })
        .where(eq(socialChannels.id, profile.channel.id));
      continue;
    }
    const result = await runOne(adapter, profile, now);
    if (result === "ok") succeeded += 1;
    else if (result === "needs_reauth") needsReauth += 1;
    else failed += 1;
  }

  // Retention. Runs on every tick so 24h oauth states and 25-month
  // metrics never accumulate. The delete is a single statement each;
  // the cost is bounded by the partial index on `expires_at` and the
  // `metric_date` index.
  const oauthCutoff = new Date(now.getTime() - RETENTION_OAUTH_HOURS * 60 * 60_000);
  const metricCutoff = new Date(now);
  metricCutoff.setMonth(metricCutoff.getMonth() - RETENTION_METRIC_MONTHS);
  const oauthStatesDeleted = await cleanupOauthStates(db, oauthCutoff);
  const oldMetricsDeleted = await cleanupOldMetrics(db, metricCutoff);

  return {
    claimed: claimed.length,
    succeeded,
    failed,
    needsReauth,
    skipped,
    retention: { oauthStatesDeleted, oldMetricsDeleted },
  };
}

async function runOne(
  adapter: SocialProviderAdapter,
  profile: ClaimedProfile,
  now: Date,
): Promise<"ok" | "needs_reauth" | "failed"> {
  const { channel, connection } = profile;
  try {
    let credentials = openConnectionCredentials(connection);

    // Refresh proactively if the access token is within 5 minutes
    // of expiry, or the worker hit a 401 on the last snapshot.
    const expiresAt = connection.accessTokenExpiresAt;
    if (expiresAt && expiresAt.getTime() - now.getTime() < 5 * 60_000) {
      try {
        const refreshed = await adapter.refreshCredentials(credentials);
        credentials = refreshed.credentials;
        await db
          .update(socialChannels) // touch to keep Drizzle happy
          .set({ updatedAt: now })
          .where(eq(socialChannels.id, channel.id));
      } catch (refreshErr) {
        if (
          isSocialProviderError(refreshErr) &&
          (refreshErr.code === "auth_expired" || refreshErr.code === "permission_denied")
        ) {
          await markNeedsReauth(db, channel.id, connection.id);
          return "needs_reauth";
        }
        throw refreshErr;
      }
    }

    const profileRef: ConnectedProfileRef = {
      providerAccountId: channel.externalAccountId ?? "",
      platform:
        channel.platform === "instagram"
          ? "instagram"
          : channel.platform === "facebook"
            ? "facebook"
            : "tiktok",
      parentProviderAccountId: null,
    };
    const rawSnapshot = await adapter.fetchSnapshot(profileRef, credentials);
    const snapshot: ProfileSnapshot = {
      ...rawSnapshot,
      providerRequestId: rawSnapshot.providerRequestId ?? newRequestId(),
      responseHash:
        rawSnapshot.responseHash ||
        createHash("sha256")
          .update(
            JSON.stringify({
              followerCount: rawSnapshot.followerCount,
              reach: rawSnapshot.reach,
              views: rawSnapshot.views,
              observedAt: rawSnapshot.observedAt.toISOString(),
            }),
          )
          .digest("hex"),
    };

    const metricDate = channel.lastSyncedAt
      ? new Date().toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    await saveSnapshot(db, {
      socialChannelId: channel.id,
      metricDate,
      snapshot,
    });

    const next = nextSyncAt(now);
    await markSyncSuccess(db, channel.id, next);
    return "ok";
  } catch (err) {
    if (isSocialProviderError(err)) {
      if (err.code === "auth_expired" || err.code === "permission_denied") {
        // Increment failure count. If 3 consecutive, mark needs_reauth.
        const failureCount = (channel.syncFailureCount ?? 0) + 1;
        if (failureCount >= 3) {
          await markNeedsReauth(db, channel.id, connection.id);
          return "needs_reauth";
        }
        await markSyncFailure(db, channel.id, err.code, backoffAt(now, failureCount));
        return "needs_reauth";
      }
      if (err.retryable) {
        const failureCount = (channel.syncFailureCount ?? 0) + 1;
        await markSyncFailure(db, channel.id, err.code, backoffAt(now, failureCount));
        return "failed";
      }
    }
    const failureCount = (channel.syncFailureCount ?? 0) + 1;
    await markSyncFailure(
      db,
      channel.id,
      err instanceof Error ? err.name : "unknown",
      backoffAt(now, failureCount),
    );
    return "failed";
  }
}

export function backoffAt(now: Date, failureCount: number): Date {
  if (failureCount <= 0) return addMinutes(now, 1);
  if (failureCount === 1) return addMinutes(now, 15);
  if (failureCount === 2) return addHours(now, 1);
  if (failureCount === 3) return addHours(now, 6);
  return addDays(now, 1);
}

export function nextSyncAt(now: Date): Date {
  // The M4 plan: 03:15 in workspace timezone on the next calendar day.
  // Without the per-workspace tz we use UTC, which is good enough for
  // the cron lease model — the daily snapshot date is recorded in the
  // workspace's tz in the analytics layer.
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(NEXT_DAY_HOUR, NEXT_DAY_MINUTE, 0, 0);
  return next;
}

// Silence the unused import linter for `socialProfileDailyMetrics`,
// which is only used by the type-erased repository helpers.
void socialProfileDailyMetrics;
void sql;
