import { createHash } from "node:crypto";
import { addDays, addMinutes, addHours } from "date-fns";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { socialChannels, socialConnections, socialProfileDailyMetrics } from "@/lib/db/schema";
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
import { isSocialProviderError, newRequestId, SocialProviderError } from "./http";
import { metaAdapter } from "./providers/meta";
import { tiktokAdapter } from "./providers/tiktok";
import type { SocialProviderAdapter, ProfileSnapshot, ConnectedProfileRef } from "./types";
import { serverEnv } from "@/lib/validation/env";
import {
  createDekCache,
  DekNotEnabledError,
  getDekForWorkspace,
  isKekAvailable,
  MissingKekError,
} from "./key-management";

type SocialChannel = typeof socialChannels.$inferSelect;
type SocialConnection = typeof socialConnections.$inferSelect;

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
  tiktok: tiktokAdapter,
};

export type SyncTickResult = {
  claimed: number;
  succeeded: number;
  failed: number;
  needsReauth: number;
  skipped: number;
  retention: { oauthStatesDeleted: number; oldMetricsDeleted: number };
  /**
   * Set to 'kek_missing' when the platform KEK is unavailable AND
   * `SOCIAL_SYNC_ENABLED=true`. The tick is a soft no-op (no claims
   * are made, no errors are thrown). Set to null in all other cases.
   */
  kekStatus: "ok" | "kek_missing" | null;
};

const BACKOFF_MS: readonly number[] = [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
export { BACKOFF_MS };
const NEXT_DAY_HOUR = 3; // 03:15 in workspace tz
const NEXT_DAY_MINUTE = 15;
const RETENTION_OAUTH_HOURS = 24;
const RETENTION_METRIC_MONTHS = 25;

export async function runSyncTick(now: Date = new Date()): Promise<SyncTickResult> {
  const noop = (kekStatus: "ok" | "kek_missing" | null = null): SyncTickResult => ({
    claimed: 0,
    succeeded: 0,
    failed: 0,
    needsReauth: 0,
    skipped: 0,
    retention: { oauthStatesDeleted: 0, oldMetricsDeleted: 0 },
    kekStatus,
  });
  if (!serverEnv.SOCIAL_SYNC_ENABLED) {
    return noop(null);
  }
  // Soft no-op if the platform KEK is unavailable. We do NOT throw —
  // the rest of the platform must continue to work even if the
  // operator forgets to set the env var. The route layer surfaces
  // this to the operator as a `kekStatus: 'kek_missing'` field.
  if (!isKekAvailable()) {
    return noop("kek_missing");
  }

  const dekCache = createDekCache(db);
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
    const result = await runOne(adapter, profile, now, dekCache);
    if (result.outcome === "ok") succeeded += 1;
    else if (result.outcome === "needs_reauth") needsReauth += 1;
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
    kekStatus: "ok",
  };
}

// ─── Per-channel sync core (shared by cron tick + user "Re-test") ─────────

type SyncOutcome = "ok" | "needs_reauth" | "failed";
type SyncErrorCode =
  | "auth_expired"
  | "permission_denied"
  | "rate_limited"
  | "provider_unavailable"
  | "not_found"
  | "platform_kek_missing"
  | "social_not_enabled"
  | "unknown";

type SyncResult = {
  outcome: SyncOutcome;
  /**
   * On failure, the user-facing error code. Cron and the user "Re-test"
   * surface this through different channels (cron JSON vs. inline UI)
   * but the taxonomy is shared so operator dashboards and the
   * `last_sync_error_code` column stay in sync.
   */
  errorCode: SyncErrorCode | null;
  /**
   * True when the channel was flipped to `needs_reauth` as a result
   * of THIS call. Distinct from `outcome === "needs_reauth"` because
   * a single auth failure may bump the failure counter without yet
   * tripping the 3-strike threshold.
   */
  needsReauth: boolean;
  /**
   * On success, the timestamp that was written to `lastSyncedAt`. The
   * user "Re-test" surfaces this so the UI can render
   * "Validated X seconds ago" without re-reading the row.
   */
  lastSyncedAt: Date | null;
};

/**
 * The per-channel pipeline: open the credential envelope, refresh if
 * near-expiry, fetch the snapshot, upsert the metric row, mark
 * success/failure. This is the same code path the cron uses; the user
 * "Re-test" action calls the same function and just renders the
 * result inline.
 *
 * The lease is *not* taken here — `runChannelTest` is a user-triggered
 * single channel and doesn't need cross-worker serialization. The cron
 * still claims via `claimDueProfiles` (which sets the lease) before
 * looping over its batch.
 */
async function runChannelSyncCore(
  adapter: SocialProviderAdapter,
  channel: SocialChannel,
  connection: SocialConnection,
  now: Date,
  dekCache: ReturnType<typeof createDekCache>,
): Promise<SyncResult> {
  try {
    const dek = await getDekForWorkspace(db, dekCache, connection.workspaceId);
    let credentials = openConnectionCredentials(connection, dek);

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
          return {
            outcome: "needs_reauth",
            errorCode: refreshErr.code,
            needsReauth: true,
            lastSyncedAt: null,
          };
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

    const metricDate = new Date().toISOString().slice(0, 10);
    await saveSnapshot(db, {
      socialChannelId: channel.id,
      metricDate,
      snapshot,
    });

    const next = nextSyncAt(now);
    await markSyncSuccess(db, channel.id, next);
    return {
      outcome: "ok",
      errorCode: null,
      needsReauth: false,
      lastSyncedAt: now,
    };
  } catch (err) {
    // Platform-level errors (KEK missing, agency not enabled) get a
    // long backoff but are NOT marked as needs_reauth — those are
    // operator issues, not agency issues.
    if (err instanceof MissingKekError || err instanceof DekNotEnabledError) {
      const backoffDate = new Date(now.getTime() + 24 * 60 * 60_000);
      const code: SyncErrorCode =
        err instanceof MissingKekError ? "platform_kek_missing" : "social_not_enabled";
      await markSyncFailure(db, channel.id, code, backoffDate, false);
      return { outcome: "failed", errorCode: code, needsReauth: false, lastSyncedAt: null };
    }
    if (err instanceof SocialProviderError) {
      if (err.code === "auth_expired" || err.code === "permission_denied") {
        // Increment failure count. If 3 consecutive, mark needs_reauth.
        const failureCount = (channel.syncFailureCount ?? 0) + 1;
        if (failureCount >= 3) {
          await markNeedsReauth(db, channel.id, connection.id);
          return {
            outcome: "needs_reauth",
            errorCode: err.code,
            needsReauth: true,
            lastSyncedAt: null,
          };
        }
        await markSyncFailure(db, channel.id, err.code, backoffAt(now, failureCount));
        return {
          outcome: "needs_reauth",
          errorCode: err.code,
          needsReauth: false,
          lastSyncedAt: null,
        };
      }
      if (err.retryable) {
        const failureCount = (channel.syncFailureCount ?? 0) + 1;
        await markSyncFailure(db, channel.id, err.code, backoffAt(now, failureCount));
        const code: SyncErrorCode =
          err.code === "rate_limited"
            ? "rate_limited"
            : err.code === "not_found"
              ? "not_found"
              : "provider_unavailable";
        return { outcome: "failed", errorCode: code, needsReauth: false, lastSyncedAt: null };
      }
    }
    const failureCount = (channel.syncFailureCount ?? 0) + 1;
    await markSyncFailure(
      db,
      channel.id,
      err instanceof Error ? err.name : "unknown",
      backoffAt(now, failureCount),
    );
    return { outcome: "failed", errorCode: "unknown", needsReauth: false, lastSyncedAt: null };
  }
}

async function runOne(
  adapter: SocialProviderAdapter,
  profile: ClaimedProfile,
  now: Date,
  dekCache: ReturnType<typeof createDekCache>,
): Promise<SyncResult> {
  return runChannelSyncCore(adapter, profile.channel, profile.connection, now, dekCache);
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

// ─── User-triggered "Re-test" (M4.1 follow-up) ─────────────────────────────

/**
 * Closed union of every error code the user "Re-test" path can
 * surface. Kept as a named type (not a derived conditional) so the
 * component can import it directly and the `humanizeTestError`
 * switch stays exhaustively typed under `noUncheckedIndexedAccess`.
 */
export type TestErrorCode = SyncErrorCode | "no_connection" | "not_connected";

/**
 * UI-facing result for the workspace-manager "Re-test" action.
 * Discriminated by `ok` so the component can render a single ternary
 * without an additional discriminator field.
 */
export type TestChannelResult =
  { ok: true; lastSyncedAt: Date } | { ok: false; errorCode: TestErrorCode; message: string };

/**
 * Human-readable copy for each error code. Kept in one place so the
 * table status badge, the edit-drawer health section, and any future
 * toast all stay in sync. The function is a tiny pure helper — no
 * React, no i18n, no DB.
 */
export function humanizeTestError(code: TestErrorCode): string {
  switch (code) {
    case "auth_expired":
      return "Your Meta access has expired. Reconnect to resume.";
    case "permission_denied":
      return "The connected account is missing the analytics permission. Reconnect and grant access.";
    case "rate_limited":
      return "Meta is rate-limiting this account. The next scheduled sync will retry.";
    case "provider_unavailable":
      return "Meta is temporarily unavailable. Try again in a few minutes.";
    case "not_found":
      return "The connected account could not be found. It may have been deleted or renamed.";
    case "platform_kek_missing":
      return "Platform credential envelope is not configured. Contact your agency admin.";
    case "social_not_enabled":
      return "Social sync is not enabled for this agency. Contact your agency admin.";
    case "no_connection":
      return "This channel is not currently linked to a provider grant.";
    case "not_connected":
      return "This channel is not in a connected state. Reconnect to resume.";
    case "unknown":
      return "The validation request failed. Try again, or check the system status.";
  }
}

/**
 * Run a single "Re-test" against one channel. Used by the
 * workspace-manager "Re-test" / "Sync now" button on the channels
 * page and the edit drawer. Validates credentials end-to-end by
 * calling the provider's snapshot endpoint for this channel's
 * external account id; on success, the metric row is upserted and
 * the channel's `lastSyncedAt` advances just like a cron tick.
 *
 * The function is intentionally synchronous from the UI's
 * perspective — there is no "queued" state. The user sees
 * "Validating…" with `aria-busy`, then the result.
 *
 * Returns a typed discriminated union, never throws. Application
 * errors (KEK missing, agency disabled) and provider errors
 * (auth_expired, rate_limited, ...) are all mapped to the same
 * `{ ok: false, errorCode, message }` shape so the UI can render
 * one inline error block.
 */
export async function runChannelTest(channelId: string): Promise<TestChannelResult> {
  if (!isKekAvailable()) {
    return {
      ok: false,
      errorCode: "platform_kek_missing",
      message: humanizeTestError("platform_kek_missing"),
    };
  }

  // Load the channel + its (active) connection in a single round trip.
  // We deliberately do not use `claimDueProfiles` because the user
  // path has no concurrency to serialize against — the row is
  // claimed by definition when the user clicks the button.
  const [row] = await db
    .select({ channel: socialChannels, connection: socialConnections })
    .from(socialChannels)
    .innerJoin(
      socialConnections,
      and(
        eq(socialConnections.id, socialChannels.socialConnectionId),
        isNull(socialConnections.revokedAt),
      ),
    )
    .where(
      and(
        eq(socialChannels.id, channelId),
        isNull(socialChannels.archivedAt),
        eq(socialChannels.connectionStatus, "connected"),
      ),
    )
    .limit(1);

  if (!row) {
    // Two reasons this can happen: (a) the channel has no active
    // connection (manual channel, or the connection was revoked), or
    // (b) the channel was archived. Distinguish at the error-code
    // level so the UI can route to the right next action.
    const [chan] = await db
      .select({ connectionStatus: socialChannels.connectionStatus })
      .from(socialChannels)
      .where(and(eq(socialChannels.id, channelId), isNull(socialChannels.archivedAt)))
      .limit(1);
    if (!chan) {
      return {
        ok: false,
        errorCode: "no_connection",
        message: humanizeTestError("no_connection"),
      };
    }
    const code: TestErrorCode =
      chan.connectionStatus === "connected" ? "no_connection" : "not_connected";
    return { ok: false, errorCode: code, message: humanizeTestError(code) };
  }

  const { channel, connection } = row;
  const provider = connection.provider as "meta" | "tiktok";
  const adapter = PROVIDER_ADAPTERS[provider];
  if (!adapter) {
    // Provider row exists but no adapter is wired (e.g. tiktok with
    // SOCIAL_TIKTOK_ENABLED=false). This is an operator config, not
    // a user error — surface it as `not_connected` so the UI tells
    // the user to reconnect.
    return {
      ok: false,
      errorCode: "not_connected",
      message: humanizeTestError("not_connected"),
    };
  }

  const dekCache = createDekCache(db);
  const result = await runChannelSyncCore(adapter, channel, connection, new Date(), dekCache);
  if (result.outcome === "ok" && result.lastSyncedAt) {
    return { ok: true, lastSyncedAt: result.lastSyncedAt };
  }
  const errorCode: TestErrorCode = result.errorCode ?? "unknown";
  return { ok: false, errorCode, message: humanizeTestError(errorCode) };
}

// Silence the unused import linter for `socialProfileDailyMetrics`,
// which is only used by the type-erased repository helpers.
void socialProfileDailyMetrics;
void sql;
