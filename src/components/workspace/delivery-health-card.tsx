import * as React from "react";
import { CheckCircle2, CircleSlash, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Donut chart for the Delivery Health card. Pure CSS conic-gradient
 * (no SVG/canvas) so it renders identically across browsers and
 * doesn't add a charting dependency. The visible arc is the
 * `healthPercent` slice; the remainder is the muted track.
 */
function DeliveryHealthDonut({ percent, onTrack }: { percent: number; onTrack: boolean }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const ringColor = onTrack ? "var(--success)" : "var(--warning)";
  return (
    <div
      className="bg-surface-container-low relative h-32 w-32 rounded-full"
      style={{
        background: `conic-gradient(${ringColor} 0deg ${clamped * 3.6}deg, var(--surface-container-low) ${clamped * 3.6}deg 360deg)`,
      }}
      role="img"
      aria-label={`Delivery health ${percent} percent, ${onTrack ? "on track" : "needs attention"}`}
    >
      <div className="bg-surface absolute inset-2 flex flex-col items-center justify-center rounded-full">
        <span className="text-title-page text-fg-primary text-2xl leading-none font-bold">
          {percent}%
        </span>
        <span className="text-label text-fg-muted mt-1 font-semibold tracking-wide uppercase">
          {onTrack ? "Healthy" : "At risk"}
        </span>
      </div>
    </div>
  );
}

export interface DeliveryHealthCardProps {
  healthPercent: number;
  onTrack: boolean;
  onTrackCount: number;
  atRiskCount: number;
  blockedCount: number;
}

/**
 * Delivery Health — second card in the Stitch overview's "Health &
 * Coverage" row. Donut + status counts (On Track / At Risk /
 * Blocked) at the bottom.
 */
export function DeliveryHealthCard({
  healthPercent,
  onTrack,
  onTrackCount,
  atRiskCount,
  blockedCount,
}: DeliveryHealthCardProps) {
  return (
    <section
      aria-label="Delivery health"
      className="border-border bg-surface flex flex-col rounded-[var(--radius-card)] border p-6"
    >
      <div className="mb-4 flex items-start justify-between">
        <h2 className="text-title-card text-fg-primary font-semibold">Delivery Health</h2>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            onTrack ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning",
          )}
        >
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          {onTrack ? "On Track" : "Needs attention"}
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center py-4">
        <DeliveryHealthDonut percent={healthPercent} onTrack={onTrack} />
      </div>

      <div className="mt-auto grid grid-cols-3 gap-2">
        <div className="border-success-subtle bg-success-subtle/50 rounded border p-3 text-center">
          <span className="text-title-card text-success block text-xl font-bold">
            {onTrackCount}
          </span>
          <span className="text-label text-fg-secondary">On Track</span>
        </div>
        <div className="border-warning-subtle bg-warning-subtle rounded border p-3 text-center">
          <span className="text-title-card text-warning flex items-center justify-center gap-1 text-xl font-bold">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            {atRiskCount}
          </span>
          <span className="text-label text-fg-secondary">At Risk</span>
        </div>
        <div className="border-danger-subtle bg-danger-subtle rounded border p-3 text-center">
          <span className="text-title-card text-danger flex items-center justify-center gap-1 text-xl font-bold">
            <CircleSlash className="h-4 w-4" aria-hidden="true" />
            {blockedCount}
          </span>
          <span className="text-label text-fg-secondary">Blocked</span>
        </div>
      </div>
    </section>
  );
}
