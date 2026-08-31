import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * KpiTile — a non-clickable, surface-level KPI display: an icon + label
 * stacked above a large value. Used on the User Management page where
 * the tiles are read-only summaries (not drill-downs).
 *
 * Tone drives a left-border accent and the icon colour. Use sparingly:
 * if a tile is supposed to be a drill-down, prefer {@link KpiCard} or
 * {@link PlanningKpiBar} instead.
 *
 * Visual:
 *   ┌──────────────────┐
 *   │  ✉  ACTIVE USERS │  ← icon + label (uppercase, muted)
 *   │  12              │  ← large value
 *   └──────────────────┘
 *   (left-border accent when tone is success / warning / danger)
 */
export interface KpiTileProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  /** Optional left-border accent + icon colour. */
  tone?: "default" | "success" | "warning" | "danger";
  /** Optional data-testid for E2E hooks. */
  "data-testid"?: string;
  /** Optional className for layout overrides (grid placement, etc.). */
  className?: string;
}

const TONE_BORDER: Record<NonNullable<KpiTileProps["tone"]>, string> = {
  default: "",
  success: "border-s-4 border-s-success",
  warning: "border-s-4 border-s-warning",
  danger: "border-s-4 border-s-danger",
};

const TONE_ICON: Record<NonNullable<KpiTileProps["tone"]>, string> = {
  default: "text-fg-muted",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export function KpiTile({
  icon,
  label,
  value,
  tone = "default",
  className,
  "data-testid": dataTestId,
}: KpiTileProps) {
  return (
    <div
      className={cn(
        "border-border bg-surface rounded-[var(--radius-card)] border p-4",
        TONE_BORDER[tone],
        className,
      )}
      data-testid={dataTestId}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className={TONE_ICON[tone]} aria-hidden="true">
          {icon}
        </span>
        <span className="text-label text-fg-muted font-medium tracking-wider uppercase">
          {label}
        </span>
      </div>
      <p className="text-title-page text-fg-primary font-semibold">{value}</p>
    </div>
  );
}
