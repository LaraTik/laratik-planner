import { AlertTriangle, Clock, PlugZap } from "lucide-react";
import Link from "next/link";
import { type socialChannels } from "@/lib/db/schema/channels";

type ChannelLike = Pick<
  typeof socialChannels.$inferSelect,
  "id" | "accountName" | "platform" | "connectionStatus" | "lastSyncedAt" | "lastSyncErrorCode"
> & {
  lastSyncedAt: Date | null;
  /**
   * Provider error code (e.g. `permission_denied`) from the
   * most-recent daily-metric's `sourceMetadata.providerErrorCode`.
   * The worker writes this when the insights call fails silently.
   * 2026-08-28 — this is the Sentry-free diagnostic path: the
   * operator sees the error in the analytics UI itself without
   * needing Sentry access.
   */
  latestProviderErrorCode: string | null;
};

/**
 * M4 — social-analytics "feel" improvement.
 *
 * A read-only banner that surfaces operational issues for the
 * workspace's connected social channels. The banner is intentionally
 * quiet when everything is healthy: if no channel needs reauth, has
 * stale data, or has a recent error, the component returns `<></>`
 * and the page renders nothing extra.
 *
 * Three signal types, each independent. A channel can match
 * multiple; the banner renders one row per channel, with a single
 * representative signal (reauth > stale > error).
 *
 *   - reauth: `connectionStatus === 'needs_reauth'`. The provider
 *     token is broken. The fix is the existing Reconnect button on
 *     the channels page.
 *   - stale: `lastSyncedAt` is older than 25 hours (the cron runs
 *     daily at 03:15 workspace-tz; a missing or failed daily tick
 *     shows up as a 25h+ gap). This is often transient and the next
 *     tick will recover; the banner is a "we noticed" signal, not
 *     an alarm.
 *   - error: `lastSyncErrorCode` is set. We surface the provider
 *     code (auth_expired, rate_limited, provider_error,
 *     invalid_response, permission_denied, network) without the
 *     underlying URL or body — see `src/lib/social/http.ts` for the
 *     code-to-message mapping.
 *
 * The component is a Server Component. The data it consumes
 * (`channels`) is already fetched by `page.tsx`; we receive a
 * serializable slice and render. No state.
 *
 * Data-testid:
 *   - `social-health-banner` — the banner container (present when
 *     any signal exists)
 *   - `social-health-banner-reauth` — the reauth row
 *   - `social-health-banner-stale` — the stale row
 *   - `social-health-banner-error` — the error row
 *   - `social-health-banner-channel-<id>` — the per-channel entry
 */

const STALE_THRESHOLD_MS = 25 * 60 * 60 * 1000;

type BannerSignal = {
  channel: ChannelLike;
  kind: "reauth" | "stale" | "error";
  message: string;
  detail?: string;
};

function signalForChannel(channel: ChannelLike, now: Date): BannerSignal | null {
  if (channel.connectionStatus === "needs_reauth") {
    return {
      channel,
      kind: "reauth",
      message: `${channel.accountName} needs to reconnect.`,
      detail: "The provider rejected the stored token. Reconnect to restore the daily sync.",
    };
  }
  if (channel.lastSyncErrorCode) {
    return {
      channel,
      kind: "error",
      message: `${channel.accountName} last sync failed: ${channel.lastSyncErrorCode}.`,
      detail: "The next sync tick will retry. If this persists, check the connection.",
    };
  }
  // 2026-08-28: surface the silent provider error (the case the
  // worker writes to `sourceMetadata.providerErrorCode` instead of
  // throwing — see `src/lib/social/providers/meta.ts`). Without
  // this row, the operator has no UI signal that the insights
  // are missing because of a permission issue, only the "partial"
  // pill on the cell. With this row, the channel card shows the
  // exact provider error code (e.g. `permission_denied`) so the
  // operator knows whether to re-authorize, file an App Review,
  // or wait for Meta to lift a rate limit.
  if (channel.latestProviderErrorCode) {
    return {
      channel,
      kind: "error",
      message: `${channel.accountName} last sync captured a provider error: ${channel.latestProviderErrorCode}.`,
      detail:
        "Some daily metrics (Reach / Views / Interactions) are missing because the provider call returned this error. Common causes: app needs advanced-access review for the requested scope, the access token has expired, or Meta is throttling. The next sync tick will retry.",
    };
  }
  if (channel.lastSyncedAt) {
    const ageMs = now.getTime() - channel.lastSyncedAt.getTime();
    if (ageMs > STALE_THRESHOLD_MS) {
      const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      const age =
        days >= 1
          ? `${days} day${days === 1 ? "" : "s"} ago`
          : `${Math.max(1, Math.floor(ageMs / (60 * 60 * 1000)))} hours ago`;
      return {
        channel,
        kind: "stale",
        message: `${channel.accountName} hasn't synced in ${age}.`,
        detail: "The next cron tick will recover. No action required.",
      };
    }
  }
  return null;
}

function signalIcon(kind: BannerSignal["kind"]) {
  switch (kind) {
    case "reauth":
      return <PlugZap className="h-4 w-4" aria-hidden={true} />;
    case "stale":
      return <Clock className="h-4 w-4" aria-hidden={true} />;
    case "error":
      return <AlertTriangle className="h-4 w-4" aria-hidden={true} />;
  }
}

function signalTone(kind: BannerSignal["kind"]) {
  switch (kind) {
    case "reauth":
      return "border-danger/40 bg-danger/5 text-danger";
    case "stale":
      return "border-warning/40 bg-warning/5 text-warning";
    case "error":
      return "border-danger/40 bg-danger/5 text-danger";
  }
}

export function SocialHealthBanner({
  channels,
  slug,
  now,
}: {
  channels: ChannelLike[];
  slug: string;
  now?: Date;
}) {
  const at = now ?? new Date();
  const signals = channels
    .map((c) => signalForChannel(c, at))
    .filter((s): s is BannerSignal => s !== null);
  if (signals.length === 0) return null;

  return (
    <div data-testid="social-health-banner" role="status" aria-live="polite" className="space-y-2">
      {signals.map((s) => (
        <div
          key={`${s.channel.id}-${s.kind}`}
          data-testid={`social-health-banner-channel-${s.channel.id}`}
          data-testid-kind={s.kind}
          className={`flex items-start gap-3 rounded-md border px-3 py-2 ${signalTone(s.kind)}`}
        >
          <span className="mt-0.5 shrink-0" aria-hidden={true}>
            {signalIcon(s.kind)}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="text-body font-medium"
              data-testid={`social-health-banner-${
                s.kind === "reauth" ? "reauth" : s.kind === "stale" ? "stale" : "error"
              }`}
            >
              {s.message}
            </p>
            {s.detail ? <p className="text-label text-fg-muted mt-0.5">{s.detail}</p> : null}
          </div>
          {s.kind === "reauth" ? (
            <Link
              href={`/app/w/${slug}/channels`}
              className="text-body rounded-[var(--radius-control)] border border-current px-2.5 py-1 font-semibold hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
              data-testid="social-health-banner-reconnect"
            >
              Go to channels
            </Link>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// Allow the page to import the symbols without leaking the
// implementation types into the consumer.
export type { BannerSignal };
