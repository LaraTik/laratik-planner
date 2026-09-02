import { CheckCircle2 } from "lucide-react";

/**
 * M5 — "All channels healthy" status line.
 *
 * The `SocialHealthBanner` speaks only when something needs
 * attention — when every channel is fine, it returns `null` and the
 * page renders no signal at all. That silence is a UX miss: a
 * positive signal ("we checked, all green") turns the analytics
 * page from "silent until something breaks" into "actively
 * monitored."
 *
 * This component is rendered by `page.tsx` when the banner is
 * empty. The two are siblings, not nested — the page decides which
 * one to render based on the same `signals.length === 0` check
 * the banner uses internally.
 *
 * The "as of" timestamp is the most-recent `lastSyncedAt` across
 * the workspace's channels (the operator wants to know how fresh
 * "healthy" is). It is the same value the page already loads, so
 * no extra query.
 */
export function SocialHealthyStatus({
  channelCount,
  asOf,
  now,
}: {
  channelCount: number;
  asOf: Date | null;
  now?: Date;
}) {
  const at = now ?? new Date();
  const asOfText = asOf ? formatRelative(asOf, at) : null;

  return (
    <div
      data-testid="social-healthy-status"
      className="border-success/30 bg-success/5 text-success flex flex-wrap items-center gap-2 rounded-md border px-3 py-2"
    >
      <CheckCircle2 className="h-4 w-4" aria-hidden={true} />
      <p className="text-body font-medium">
        All {channelCount} channel{channelCount === 1 ? "" : "s"} healthy
      </p>
      {asOfText ? <p className="text-label text-fg-muted">· last sync {asOfText}</p> : null}
    </div>
  );
}

function formatRelative(date: Date, now: Date): string {
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "just now";
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return "just now";
  if (diffMs < hour) return `${Math.round(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.round(diffMs / hour)}h ago`;
  return `${Math.round(diffMs / day)}d ago`;
}
