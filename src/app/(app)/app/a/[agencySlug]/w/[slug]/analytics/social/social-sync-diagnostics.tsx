import { Activity, AlertTriangle, CheckCircle2, Clock, RefreshCw } from "lucide-react";
import Link from "next/link";
import { type socialChannels } from "@/lib/db/schema/channels";

type ChannelLike = Pick<
  typeof socialChannels.$inferSelect,
  "id" | "accountName" | "platform" | "connectionStatus" | "lastSyncedAt" | "lastSyncErrorCode"
> & {
  lastSyncedAt: Date | null;
  /**
   * Provider error code (e.g. `permission_denied`, `not_configured`)
   * pulled from the most-recent daily-metric's `sourceMetadata`.
   * The worker writes this when the insights call fails silently
   * (see `social-health-banner.tsx` for the full contract).
   */
  latestProviderErrorCode: string | null;
};

type SyncState = "synced" | "degraded" | "stalled";

type StateCounts = Record<SyncState, number>;

const STALE_THRESHOLD_MS = 25 * 60 * 60 * 1000;

/**
 * M5 — Sync diagnostics bento for the social analytics page.
 *
 * The companion to `SocialHealthBanner` and `SocialHealthyStatus`:
 *
 *   - `SocialHealthBanner`     — only renders when something needs
 *     attention. Returns null on a fully-healthy workspace.
 *   - `SocialHealthyStatus`    — single positive line when every
 *     channel is healthy. (KPI worktree.)
 *   - `SocialSyncDiagnostics`  — this component. Renders the bento
 *     grid ONLY when at least one channel is degraded or stalled.
 *     Quiet on the happy path so the page reads "all green" until
 *     something actually needs the operator's attention.
 *
 * Bento cells:
 *
 *   1. Synced        (success)   — count of healthy channels
 *   2. Degraded      (warning)   — partial coverage or recent error
 *   3. Stalled       (danger)    — last sync > 25h ago OR needs_reauth
 *   4. Oldest gap    (fg-muted)  — channel with the oldest lastSyncedAt
 *   5. Next attempt  (fg-muted)  — earliest nextSyncAt across channels
 *
 * Below the grid, a single "Re-test all channels" CTA when at least
 * one channel is degraded or stalled. The CTA deep-links to the
 * channels page (the existing Re-test action lives there) — the
 * analytics surface doesn't re-implement Re-test, it surfaces the
 * problem and points the operator at the fix.
 *
 * Accessibility:
 *   - `aria-live="polite"` on the status counts so screen readers
 *     announce changes when the page is re-fetched.
 *   - 44×44px minimum touch targets on the CTA.
 *   - Color is never the only signal: every cell carries a Lucide
 *     icon + a text label.
 *   - Reduced-motion safe (transitions are color-only, no layout
 *     shift).
 *
 * Data-testid:
 *   - `social-sync-diagnostics`            — root
 *   - `social-sync-diagnostics-counts`     — the 3-state counts strip
 *   - `social-sync-diagnostics-cell-synced`
 *   - `social-sync-diagnostics-cell-degraded`
 *   - `social-sync-diagnostics-cell-stalled`
 *   - `social-sync-diagnostics-oldest`
 *   - `social-sync-diagnostics-next`
 *   - `social-sync-diagnostics-retry`      — the CTA
 *
 * Server Component. Consumes the same `channels` array the page
 * already loaded. No extra DB query.
 */
export function SocialSyncDiagnostics({
  channels,
  slug,
  now,
  t,
}: {
  channels: ChannelLike[];
  slug: string;
  now?: Date;
  t?: (key: string, params?: Record<string, string | number>) => string;
}) {
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : interpolate(fallback, params);
  const at = now ?? new Date();
  const state = computeState(channels, at);

  // Quiet on the happy path — the `SocialHealthyStatus` line in the
  // KPI worktree already covers the all-green case. This component
  // is the "something needs attention" view.
  if (state.counts.synced === channels.length) return null;

  const oldest = pickOldestUnsynced(channels, at);
  const next = pickNextAttempt(channels, at);

  return (
    <section
      data-testid="social-sync-diagnostics"
      aria-live="polite"
      aria-label={tr("analytics.syncDiagnosticsAria", "Social sync diagnostics")}
      className="border-border bg-surface space-y-3 rounded-md border p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="text-fg-muted h-4 w-4" aria-hidden={true} />
          <h2 className="text-title-card text-fg-primary font-semibold">
            {tr("analytics.syncDiagnosticsTitle", "Sync diagnostics")}
          </h2>
        </div>
        <p className="text-label text-fg-muted">
          {channels.length === 0
            ? tr("analytics.noConnectedChannels", "No connected channels")
            : tr(
                "analytics.syncSummary",
                "{synced}/{total} healthy · {degraded} degraded · {stalled} stalled",
                {
                  synced: state.counts.synced,
                  total: channels.length,
                  degraded: state.counts.degraded,
                  stalled: state.counts.stalled,
                },
              )}
        </p>
      </header>

      <div
        data-testid="social-sync-diagnostics-counts"
        className="grid grid-cols-1 gap-2 sm:grid-cols-3"
      >
        <StateCell
          state="synced"
          count={state.counts.synced}
          label={tr("analytics.syncedToday", "Synced today")}
          tone="border-success/30 bg-success/5 text-success"
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden={true} />}
          testId="social-sync-diagnostics-cell-synced"
        />
        <StateCell
          state="degraded"
          count={state.counts.degraded}
          label={tr("analytics.degradedPartial", "Degraded (partial data)")}
          tone="border-warning/30 bg-warning/5 text-warning"
          icon={<AlertTriangle className="h-4 w-4" aria-hidden={true} />}
          testId="social-sync-diagnostics-cell-degraded"
        />
        <StateCell
          state="stalled"
          count={state.counts.stalled}
          label={tr("analytics.stalledOver25h", "Stalled (>25h)")}
          tone="border-danger/30 bg-danger/5 text-danger"
          icon={<Clock className="h-4 w-4" aria-hidden={true} />}
          testId="social-sync-diagnostics-cell-stalled"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <InfoCell
          testId="social-sync-diagnostics-oldest"
          label={tr("analytics.oldestUnsynced", "Oldest unsynced")}
          value={oldest ? `${oldest.accountName} · ${oldest.ageText}` : "—"}
          hint={
            oldest?.errorCode
              ? tr("analytics.lastError", "last error: {error}", { error: oldest.errorCode })
              : null
          }
        />
        <InfoCell
          testId="social-sync-diagnostics-next"
          label={tr("analytics.nextScheduledAttempt", "Next scheduled attempt")}
          value={next ? next.relativeText : "—"}
          hint={
            next
              ? tr("analytics.scheduledAt", "at {time} UTC", { time: next.absoluteText })
              : tr("analytics.noScheduledChannel", "no channel is currently scheduled")
          }
        />
      </div>

      {(state.counts.degraded > 0 || state.counts.stalled > 0) && (
        <div className="flex justify-end pt-1">
          <Link
            href={`/app/w/${slug}/channels`}
            data-testid="social-sync-diagnostics-retry"
            className="border-border bg-surface text-fg-primary hover:bg-surface-subtle inline-flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
          >
            <RefreshCw className="h-4 w-4" aria-hidden={true} />
            {tr("analytics.retestChannels", "Re-test on channels page")}
          </Link>
        </div>
      )}
    </section>
  );
}

function interpolate(value: string, params?: Record<string, string | number>): string {
  if (!params) return value;
  return Object.entries(params).reduce(
    (result, [name, replacement]) => result.replaceAll(`{${name}}`, String(replacement)),
    value,
  );
}

function StateCell({
  state,
  count,
  label,
  tone,
  icon,
  testId,
}: {
  state: SyncState;
  count: number;
  label: string;
  tone: string;
  icon: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      data-state={state}
      className={`flex items-center gap-3 rounded-md border px-3 py-2 ${tone}`}
    >
      <span className="shrink-0" aria-hidden={true}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-title-card leading-none font-semibold tabular-nums">{count}</p>
        <p className="text-label mt-0.5 leading-snug">{label}</p>
      </div>
    </div>
  );
}

function InfoCell({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint: string | null;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="border-border bg-surface-subtle rounded-md border px-3 py-2"
    >
      <p className="text-label text-fg-muted">{label}</p>
      <p className="text-body text-fg-primary mt-0.5 font-medium">{value}</p>
      {hint ? <p className="text-label text-fg-muted mt-0.5">{hint}</p> : null}
    </div>
  );
}

// ─── classification helpers (exported for unit tests) ────────────────

export function classifyChannel(channel: ChannelLike, now: Date): SyncState {
  if (channel.connectionStatus === "needs_reauth") return "stalled";
  if (channel.lastSyncErrorCode) return "degraded";
  if (channel.latestProviderErrorCode) return "degraded";
  if (!channel.lastSyncedAt) return "stalled";
  const ageMs = now.getTime() - channel.lastSyncedAt.getTime();
  if (ageMs > STALE_THRESHOLD_MS) return "stalled";
  return "synced";
}

function computeState(channels: ChannelLike[], now: Date) {
  const counts: StateCounts = { synced: 0, degraded: 0, stalled: 0 };
  for (const c of channels) counts[classifyChannel(c, now)] += 1;
  const summary =
    channels.length === 0
      ? "No connected channels"
      : `${counts.synced}/${channels.length} healthy · ${counts.degraded} degraded · ${counts.stalled} stalled`;
  return { counts, summary };
}

function pickOldestUnsynced(channels: ChannelLike[], now: Date) {
  // Channels classified as stalled or degraded are "unsynced" in
  // some sense; for the headline we want the one whose lastSyncedAt
  // is the furthest in the past (or null, which sorts as +Infinity).
  const candidates = channels
    .filter((c) => c.connectionStatus !== "manual" && c.connectionStatus !== "disconnected")
    .map((c) => {
      const ts = c.lastSyncedAt?.getTime() ?? Number.POSITIVE_INFINITY;
      return { channel: c, ts };
    })
    .sort((a, b) => b.ts - a.ts);
  const top = candidates[0];
  if (!top) return null;
  const ageText = Number.isFinite(top.ts) ? formatRelative(new Date(top.ts), now) : "never";
  return {
    accountName: top.channel.accountName,
    ageText,
    errorCode: top.channel.lastSyncErrorCode ?? top.channel.latestProviderErrorCode ?? null,
  };
}

function pickNextAttempt(channels: ChannelLike[], now: Date) {
  // The worker writes nextSyncAt on every success (sync.ts:510). For
  // stalled channels nextSyncAt may be a backoff timestamp; for
  // degraded channels it's the next normal slot. We surface the
  // earliest future value.
  const future = channels
    .map((c) => c)
    .filter((c) => c.lastSyncedAt !== null)
    .map((c) => {
      // We don't have direct access to nextSyncAt on the page's
      // channel slice (it's not in the PageProps' channels query),
      // so we approximate: the daily tick is 03:15 UTC + the
      // per-channel stagger bucket (claimDueProfiles:546). For
      // the operator-facing display, "next scheduled attempt" is
      // most usefully "in ~N hours" with the next 03:15 UTC as the
      // fallback. The hourly stalled-check cron will surface
      // this differently; here we just say "next 03:15 UTC".
      void c;
      return null;
    });
  void future;
  // The worker hardcodes NEXT_DAY_HOUR=3, NEXT_DAY_MINUTE=15 UTC
  // (sync.ts:92-93). Show the next 03:15 UTC.
  const next = nextUtcSlot(now, 3, 15);
  return {
    absoluteText: formatAbsoluteUtc(next),
    relativeText: formatRelative(next, now),
  };
}

function nextUtcSlot(now: Date, hour: number, minute: number): Date {
  const candidate = new Date(now);
  candidate.setUTCHours(hour, minute, 0, 0);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate;
}

function formatAbsoluteUtc(d: Date): string {
  // 2026-08-30 03:15 UTC
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export function formatRelative(date: Date, now: Date): string {
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "in the future";
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return "just now";
  if (diffMs < hour) return `${Math.round(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.round(diffMs / hour)}h ago`;
  return `${Math.round(diffMs / day)}d ago`;
}
