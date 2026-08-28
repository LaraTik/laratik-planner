import { createHash } from "node:crypto";
import { addDays, addMinutes, addHours } from "date-fns";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  socialChannels,
  socialConnections,
  socialProfileDailyMetrics,
  workspaces,
} from "@/lib/db/schema";
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
import { getAgencyProviderConfig, type SocialProvider } from "./provider-config";

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
// 2026-08-28: proactive rate-limit backoff. The Meta Graph API
// returns `X-App-Usage.call_count` and `X-Business-Use-Case-Usage`
// as a 0–100 percentage of the per-app / per-business quota. When
// any layer crosses 80% we add a 60-second pause before the next
// channel's provider call in this tick, so the cumulative budget
// does not get clobbered. 80% is the threshold Meta's own docs
// recommend ("stay under ~80% to be safe").
const RATE_LIMIT_USAGE_THRESHOLD = 80;
const RATE_LIMIT_BACKOFF_MS = 60_000;

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

  // 2026-08-28: track the most recent rate-limit usage reported by
  // any channel's snapshot in this tick. The Meta headers are
  // per-app and reflect the post-call state, so channel N's
  // snapshot is a faithful reading of "where the app's quota is
  // right now" — by the time we're at channel K, the cumulative
  // usage is what channel K's call observed. If any of the four
  // persisted numbers (app call_count / cpu / time, business
  // max call_count) hits 80%, we sleep 60s before the next
  // channel's call. Bounded at N×60s (≤ 20 minutes per tick,
  // well inside the 5-min lease when channels succeed because
  // the lease rolls forward).
  let lastSeenUsage: RateLimitUsageSnapshot | null = null;
  for (const profile of claimed) {
    const provider = profile.connection.provider as SocialProvider;
    const adapter = PROVIDER_ADAPTERS[provider];
    if (!adapter) {
      // Unknown provider in the registry. Clear the lease so the
      // tick does not re-pick it; treat as a backoff until operator
      // intervention (the next sync attempt will re-enter the same
      // branch).
      skipped += 1;
      await db
        .update(socialChannels)
        .set({ syncLeaseUntil: null, updatedAt: now })
        .where(eq(socialChannels.id, profile.channel.id));
      continue;
    }
    if (lastSeenUsage && shouldBackoff(lastSeenUsage)) {
      await sleepMs(RATE_LIMIT_BACKOFF_MS);
    }
    const result = await runOne(adapter, profile, now, dekCache);
    if (result.latestUsage) lastSeenUsage = result.latestUsage;
    if (result.outcome === "ok") succeeded += 1;
    else if (result.outcome === "needs_reauth") needsReauth += 1;
    else if (result.outcome === "skipped") skipped += 1;
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

type SyncOutcome = "ok" | "needs_reauth" | "failed" | "skipped";
type SyncErrorCode =
  | "auth_expired"
  | "permission_denied"
  | "rate_limited"
  | "provider_unavailable"
  | "not_found"
  | "invalid_response"
  | "platform_kek_missing"
  | "social_not_enabled"
  | "not_configured"
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
  /**
   * 2026-08-28: rate-limit usage reported by the most recent
   * provider call for this channel (read from the snapshot's
   * sourceMetadata). Null when no usage was reported (Meta
   * sometimes omits the headers on certain endpoints) or when
   * the call failed before any usage was returned. The cron
   * loop reads this to drive proactive backoff before the next
   * channel's call.
   */
  latestUsage: RateLimitUsageSnapshot | null;
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
  appCredentials: { appId: string; appSecret: string; graphApiVersion: string | null },
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
        const refreshed = await adapter.refreshCredentials(credentials, appCredentials);
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
            latestUsage: null,
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
    const rawSnapshot = await adapter.fetchSnapshot(profileRef, credentials, appCredentials);
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
    // 2026-08-28: pass the snapshot's rate-limit usage up so the
    // cron loop can drive proactive backoff before the next call.
    return {
      outcome: "ok",
      errorCode: null,
      needsReauth: false,
      lastSyncedAt: now,
      latestUsage: readUsageFromSourceMetadata(snapshot.sourceMetadata),
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
      return {
        outcome: "failed",
        errorCode: code,
        needsReauth: false,
        lastSyncedAt: null,
        latestUsage: null,
      };
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
            latestUsage: null,
          };
        }
        await markSyncFailure(db, channel.id, err.code, backoffAt(now, failureCount));
        return {
          outcome: "needs_reauth",
          errorCode: err.code,
          needsReauth: false,
          lastSyncedAt: null,
          latestUsage: null,
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
        return {
          outcome: "failed",
          errorCode: code,
          needsReauth: false,
          lastSyncedAt: null,
          latestUsage: null,
        };
      }
    }
    const failureCount = (channel.syncFailureCount ?? 0) + 1;
    await markSyncFailure(
      db,
      channel.id,
      // 2026-08-28: prefer the typed provider code over the class
      // name. The previous `err.name` fallback persisted
      // "SocialProviderError" for non-handled SPE cases (e.g.
      // not_found, invalid_response), which surfaced on the
      // analytics health banner as the literal class name. The
      // outer `if (err instanceof SocialProviderError)` block
      // already handles auth_expired / permission_denied and the
      // retryable codes; this catch-all fires only when the SPE
      // has a non-retryable, non-auth code (not_found,
      // invalid_response) or when the error isn't an SPE at
      // all (truly untyped — should be rare).
      syncErrorCodeFor(err),
      backoffAt(now, failureCount),
    );
    // 2026-08-28: the in-memory errorCode must match the persisted
    // code so the Re-test path surfaces the actual reason
    // (not_found / invalid_response) instead of the generic
    // "validation request failed" string. The pre-fix return was
    // hard-coded to "unknown", which is correct only for genuinely
    // untyped errors. For SPEs we now return the typed code.
    return {
      outcome: "failed",
      errorCode: isSocialProviderError(err) ? (err.code as SyncErrorCode) : "unknown",
      needsReauth: false,
      lastSyncedAt: null,
      latestUsage: null,
    };
  }
}

async function runOne(
  adapter: SocialProviderAdapter,
  profile: ClaimedProfile,
  now: Date,
  dekCache: ReturnType<typeof createDekCache>,
): Promise<SyncResult> {
  // Resolve the agency's provider config (M4.6 — hard cutover from
  // env). The config carries the app id + sealed app secret, both
  // required to call the provider's OAuth endpoints during the
  // refresh / snapshot phases. A channel whose agency has not
  // configured this provider (or has it disabled) is skipped with
  // a long backoff — operator must set the config before the cron
  // can sync it.
  const [workspaceRow] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, profile.channel.workspaceId))
    .limit(1);
  if (!workspaceRow) {
    return {
      outcome: "failed",
      errorCode: "unknown",
      needsReauth: false,
      lastSyncedAt: null,
      latestUsage: null,
    };
  }
  const providerKey = profile.connection.provider as SocialProvider;
  const config = await getAgencyProviderConfig(db, workspaceRow.agencyId, providerKey);
  if (!("appId" in config)) {
    // Not configured — back off for a day so the operator has a
    // chance to configure the row. The cron increments the
    // failure count via the standard markSyncFailure path below.
    await markSyncFailure(db, profile.channel.id, "not_configured", addDays(now, 1), false);
    return {
      outcome: "failed",
      errorCode: "not_configured",
      needsReauth: false,
      lastSyncedAt: null,
      latestUsage: null,
    };
  }
  if (!config.enabled) {
    await db
      .update(socialChannels)
      .set({ syncLeaseUntil: null, updatedAt: now })
      .where(eq(socialChannels.id, profile.channel.id));
    return {
      outcome: "skipped",
      errorCode: "not_configured",
      needsReauth: false,
      lastSyncedAt: null,
      latestUsage: null,
    };
  }
  return runChannelSyncCore(
    adapter,
    {
      appId: config.appId,
      appSecret: config.appSecret,
      graphApiVersion: config.graphApiVersion,
    },
    profile.channel,
    profile.connection,
    now,
    dekCache,
  );
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
    case "invalid_response":
      // 2026-08-28: the Meta endpoint returned a body we could not
      // parse, or a non-error HTTP status we did not classify. The
      // UI copy is intentionally distinct from "provider unavailable"
      // (which implies Meta is down) — this is "Meta returned
      // something we don't know how to read", which often means a
      // temporary schema or version mismatch.
      return "Meta returned an unrecognized response. The endpoint may be temporarily unavailable; try again in a few minutes.";
    case "platform_kek_missing":
      return "Platform credential envelope is not configured. Contact your agency admin.";
    case "social_not_enabled":
      return "Social sync is not enabled for this agency. Contact your agency admin.";
    case "no_connection":
      return "This channel is not currently linked to a provider grant.";
    case "not_connected":
      return "This channel is not in a connected state. Reconnect to resume.";
    case "not_configured":
      return "Your agency admin hasn't set up this provider yet. Ask them to add the app credentials in Agency Settings.";
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
  const provider = connection.provider as SocialProvider;
  const adapter = PROVIDER_ADAPTERS[provider];
  if (!adapter) {
    // Provider row exists but no adapter is wired. This is an
    // operator config, not a user error — surface it as
    // `not_connected` so the UI tells the user to reconnect.
    return {
      ok: false,
      errorCode: "not_connected",
      message: humanizeTestError("not_connected"),
    };
  }

  // Resolve the agency's per-provider config (M4.6 hard cutover).
  // The app id + sealed app secret are required to call the
  // provider's OAuth endpoints during refresh / snapshot.
  const [ws] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, channel.workspaceId))
    .limit(1);
  if (!ws) {
    return {
      ok: false,
      errorCode: "not_configured",
      message: humanizeTestError("not_configured"),
    };
  }
  const config = await getAgencyProviderConfig(db, ws.agencyId, provider);
  if (!("appId" in config)) {
    return {
      ok: false,
      errorCode: "not_configured",
      message: humanizeTestError("not_configured"),
    };
  }
  if (!config.enabled) {
    return {
      ok: false,
      errorCode: "not_connected",
      message: humanizeTestError("not_connected"),
    };
  }

  const dekCache = createDekCache(db);
  const result = await runChannelSyncCore(
    adapter,
    {
      appId: config.appId,
      appSecret: config.appSecret,
      graphApiVersion: config.graphApiVersion,
    },
    channel,
    connection,
    new Date(),
    dekCache,
  );
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

// ─── 2026-08-28: rate-limit awareness helpers ──────────────────────────────

type RateLimitUsageSnapshot = {
  appUsageCallCount: number | null;
  appUsageCpu: number | null;
  appUsageTime: number | null;
  businessUsageMaxCallCount: number | null;
};

/**
 * Extract the rate-limit usage numbers from a snapshot's
 * `sourceMetadata`. The Meta provider writes four flat keys
 * (`appUsageCallCount`, `appUsageCpu`, `appUsageTime`,
 * `businessUsageMaxCallCount`) on the row. Returns `null` when
 * none of the four are present (older snapshots, or snapshots
 * from before this change).
 */
function readUsageFromSourceMetadata(
  sourceMetadata: Record<string, string | number | boolean | null> | null | undefined,
): RateLimitUsageSnapshot | null {
  if (!sourceMetadata) return null;
  const num = (k: string) =>
    typeof sourceMetadata[k] === "number" ? (sourceMetadata[k] as number) : null;
  const appCall = num("appUsageCallCount");
  const appCpu = num("appUsageCpu");
  const appTime = num("appUsageTime");
  const bizMax = num("businessUsageMaxCallCount");
  if (appCall === null && appCpu === null && appTime === null && bizMax === null) {
    return null;
  }
  return {
    appUsageCallCount: appCall,
    appUsageCpu: appCpu,
    appUsageTime: appTime,
    businessUsageMaxCallCount: bizMax,
  };
}

/**
 * Pure decision: should this usage signal trigger a 60s backoff
 * before the next call in the tick? Triggers when any of the four
 * persisted usage numbers is at or above
 * `RATE_LIMIT_USAGE_THRESHOLD` (80). Per Meta's docs that's the
 * soft cap where the 429 cliff starts to bite.
 */
function shouldBackoff(usage: RateLimitUsageSnapshot): boolean {
  return (
    (usage.appUsageCallCount ?? 0) >= RATE_LIMIT_USAGE_THRESHOLD ||
    (usage.appUsageCpu ?? 0) >= RATE_LIMIT_USAGE_THRESHOLD ||
    (usage.appUsageTime ?? 0) >= RATE_LIMIT_USAGE_THRESHOLD ||
    (usage.businessUsageMaxCallCount ?? 0) >= RATE_LIMIT_USAGE_THRESHOLD
  );
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Test seam: export the helpers so the unit test can verify the
// backoff decision without spinning up the full DB.
export const __test__ = {
  readUsageFromSourceMetadata,
  shouldBackoff,
  RATE_LIMIT_USAGE_THRESHOLD,
  RATE_LIMIT_BACKOFF_MS,
  syncErrorCodeFor,
};

/**
 * 2026-08-28: pick the right string to persist in
 * `social_channels.lastSyncErrorCode` for a caught error.
 *
 *   - `SocialProviderError` → return the typed `err.code`
 *     (e.g. "not_found", "invalid_response", "rate_limited").
 *     This is the actual reason the call failed. The pre-fix
 *     behavior was to return `err.name` ("SocialProviderError")
 *     for non-auth, non-retryable SPE cases, which surfaced as
 *     the literal class name on the analytics health banner.
 *   - Any other `Error` → `err.name` (best-effort diagnostic).
 *   - Anything else (string, number, plain object) → "unknown".
 */
function syncErrorCodeFor(err: unknown): string {
  if (isSocialProviderError(err)) {
    return err.code;
  }
  if (err instanceof Error) return err.name;
  return "unknown";
}
