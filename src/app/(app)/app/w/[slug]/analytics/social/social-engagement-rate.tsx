import type { EngagementRate } from "@/lib/social/analytics";

/**
 * M4 — social-analytics "feel" improvement.
 *
 * A summary card for the per-channel grid that displays the
 * engagement rate: `(accounts engaged) / followers * 100` for the
 * most recent observed day. The derivation lives in
 * `calculateEngagementRate` in `src/lib/social/analytics.ts`.
 *
 * Renders "—" when the rate is null. The "data is incomplete" pill
 * is shown when the underlying series is partial (e.g. the IG API
 * returns no engagement insights below 100 followers).
 *
 * This component is a Server Component. The page computes the
 * rate once and passes the result plus the channel id.
 *
 * Data-testid:
 *   - `social-engagement-rate` — the card
 *   - `social-engagement-rate-<channelId>` — per-channel
 *   - `social-engagement-rate-partial` — present when partial
 */

export function SocialEngagementRateCard({
  channelId,
  rate,
}: {
  channelId: string;
  rate: EngagementRate;
}) {
  const hasValue = typeof rate.percent === "number";
  return (
    <div
      className="border-border bg-surface-subtle rounded-md border p-3"
      data-testid="social-engagement-rate"
      data-testid-id={channelId}
    >
      <p className="text-label text-fg-muted">Engagement rate</p>
      <p
        className="text-title-card text-fg-primary mt-1 font-semibold"
        data-testid={`social-engagement-rate-${channelId}`}
      >
        {hasValue ? `${rate.percent!.toFixed(1)}%` : "—"}
      </p>
      <p className="text-label text-fg-muted">
        engaged / followers
        {rate.partial ? (
          <>
            {" · "}
            <span
              data-testid="social-engagement-rate-partial"
              className="border-warning/40 bg-warning/5 text-warning rounded-full border px-1.5"
            >
              partial
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
}
