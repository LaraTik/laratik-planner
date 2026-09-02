"use client";

import { useId, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";

/**
 * M4 — accessible SVG growth chart.
 * M5 — multi-metric support.
 *
 * The chart is a hand-rolled dependency-free SVG so the milestone
 * ships without adding a chart library. The visual contract is
 *
 *   - one series at a time (any of the 5 supported metrics)
 *   - responsive viewBox
 *   - visible focusable data points
 *   - platform / name text labels in the legend
 *   - `aria-describedby` linking the chart to the adjacent table
 *   - `prefers-reduced-motion` respected
 *
 * The values are clamped to the chart's drawing area; null / missing
 * data points render as gaps. The chart is intentionally
 * minimal — the visible value table below it is the source of
 * truth.
 *
 * Trend badge:
 *   The chart's endpoint-delta ("latest vs earliest in the visible
 *   window") is a bad signal for the operator — a channel that
 *   dipped 20% then recovered 20% reads "Flat" even though the
 *   underlying 7d growth is 0%. M5 takes the growth percent from
 *   the page (which is computed from the SAME first/last pair, but
 *   also surfaces the `partial` flag) and uses it to drive the
 *   badge. The chart endpoint is still used as a fallback when no
 *   growth percent is provided (e.g. legacy callers).
 */

export type GrowthPoint = {
  date: string;
  value: number | null;
};

export function SocialGrowthChart({
  title,
  platform,
  profileName,
  metricLabel,
  points,
  tableId,
  growthPercent,
}: {
  title: string;
  platform: string;
  profileName: string;
  /** Human-readable label for the plotted metric (e.g. "Followers"). */
  metricLabel: string;
  points: GrowthPoint[];
  tableId: string;
  /**
   * Optional growth percent for the same window (e.g. summary
   * tile's `growth.percent`). When provided, the trend badge
   * uses this instead of the chart's endpoint delta. `null`
   * falls back to endpoint delta (the M4 behavior).
   */
  growthPercent?: number | null;
}) {
  const t = useLocaleT();
  const locale = useLocaleCode();
  const formatValue = (value: number) =>
    new Intl.NumberFormat(locale, { numberingSystem: "latn", maximumFractionDigits: 0 }).format(
      value,
    );
  const reactId = useId();
  const chartId = `${reactId}-chart`;
  const descId = `${reactId}-desc`;
  const [hover, setHover] = useState<number | null>(null);
  const numericPoints = useMemo(
    () => points.filter((p) => p.value !== null) as Array<{ date: string; value: number }>,
    [points],
  );

  // Trend source: prefer the page-computed growth percent (M5),
  // fall back to chart endpoint delta (M4 legacy).
  const trend =
    typeof growthPercent === "number"
      ? growthPercent > 0
        ? "up"
        : growthPercent < 0
          ? "down"
          : "flat"
      : (() => {
          const latest = numericPoints[numericPoints.length - 1]?.value ?? null;
          const earliest = numericPoints[0]?.value ?? null;
          if (latest === null || earliest === null) return "flat" as const;
          if (latest > earliest) return "up" as const;
          if (latest < earliest) return "down" as const;
          return "flat" as const;
        })();
  const trendLabel =
    trend === "up"
      ? t("analytics.chartTrendGrowing")
      : trend === "down"
        ? t("analytics.chartTrendDeclining")
        : t("analytics.chartTrendFlat");
  const chartDescription = t(
    points.length === 1 ? "analytics.chartDescriptionOne" : "analytics.chartDescriptionMany",
    {
      metric: metricLabel.toLocaleLowerCase(locale),
      count: points.length,
      profileName,
    },
  );

  return (
    <figure
      className="border-border bg-surface rounded-lg border p-4"
      data-testid="social-growth-chart"
      aria-describedby={descId}
    >
      <figcaption className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-body text-fg-primary font-semibold">{title}</h3>
          <p className="text-label text-fg-muted">
            {platform} · {profileName} · {metricLabel}
          </p>
        </div>
        <Badge variant={trend === "up" ? "success" : trend === "down" ? "danger" : "outline"}>
          {trend === "up" ? (
            <TrendingUp className="h-3 w-3" aria-hidden={true} />
          ) : trend === "down" ? (
            <TrendingDown className="h-3 w-3" aria-hidden={true} />
          ) : (
            <Minus className="h-3 w-3" aria-hidden={true} />
          )}
          {typeof growthPercent === "number"
            ? `${growthPercent > 0 ? "+" : ""}${growthPercent.toFixed(1)}%`
            : trendLabel}
        </Badge>
      </figcaption>

      <svg
        id={chartId}
        viewBox="0 0 600 220"
        className="mt-4 w-full"
        role="img"
        aria-label={t("analytics.chartAria", {
          title,
          profileName,
          metric: metricLabel,
        })}
        preserveAspectRatio="none"
        style={{ transition: "none" }}
      >
        <title>{title}</title>
        <desc id={descId}>{chartDescription}</desc>
        {/* Gridlines + y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((g) => {
          const y = 20 + g * 160;
          return (
            <line
              key={g}
              x1={40}
              x2={580}
              y1={y}
              y2={y}
              className="stroke-border"
              strokeWidth={1}
              strokeDasharray={g === 0 || g === 1 ? "0" : "2 4"}
            />
          );
        })}

        {/* Polyline (skip null points; draw gaps) */}
        {numericPoints.length > 1 ? (
          (() => {
            const min = Math.min(...numericPoints.map((p) => p.value));
            const max = Math.max(...numericPoints.map((p) => p.value));
            const range = Math.max(1, max - min);
            const stepX = (580 - 40) / Math.max(1, points.length - 1);
            const yOf = (v: number) => 180 - ((v - min) / range) * 160;
            const d = numericPoints
              .map((p, i) => {
                const idx = points.findIndex((q) => q.date === p.date);
                const x = 40 + (idx >= 0 ? idx : i) * stepX;
                return `${i === 0 ? "M" : "L"}${x},${yOf(p.value)}`;
              })
              .join(" ");
            return (
              <>
                <path d={d} className="stroke-primary fill-none" strokeWidth={2} />
                {numericPoints.map((p, i) => {
                  const idx = points.findIndex((q) => q.date === p.date);
                  const x = 40 + (idx >= 0 ? idx : i) * stepX;
                  const y = yOf(p.value);
                  return (
                    <circle
                      key={p.date}
                      cx={x}
                      cy={y}
                      r={hover === i ? 6 : 4}
                      className="fill-primary"
                      onMouseEnter={() => setHover(i)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(i)}
                      onBlur={() => setHover(null)}
                      tabIndex={0}
                      role="button"
                      aria-label={t("analytics.chartPointAria", {
                        date: p.date,
                        value: formatValue(p.value),
                        metric: metricLabel.toLocaleLowerCase(locale),
                      })}
                    />
                  );
                })}
                {hover !== null
                  ? (() => {
                      const p = numericPoints[hover];
                      if (!p) return null;
                      const idx = points.findIndex((q) => q.date === p.date);
                      const x = 40 + idx * stepX;
                      const y = yOf(p.value);
                      // Flip the tooltip to the LEFT of the point when
                      // we're close to the right edge, so the box
                      // never spills off the chart. M4 had a one-sided
                      // clamp that let the box overflow.
                      const TIP_WIDTH = 120;
                      const flipLeft = x + 8 + TIP_WIDTH > 580;
                      const tipX = flipLeft ? x - 8 - TIP_WIDTH : Math.min(560, x + 8);
                      const tipY = Math.max(20, Math.min(180, y - 28));
                      return (
                        <g>
                          <rect
                            x={tipX}
                            y={tipY}
                            width={TIP_WIDTH}
                            height={20}
                            className="fill-surface-subtle stroke-border"
                            strokeWidth={1}
                            rx={4}
                          />
                          <text
                            x={tipX + TIP_WIDTH / 2}
                            y={tipY + 14}
                            textAnchor="middle"
                            className="fill-fg-primary"
                            fontSize={11}
                          >
                            {p.date}: {formatValue(p.value)}
                          </text>
                        </g>
                      );
                    })()
                  : null}
              </>
            );
          })()
        ) : (
          <text x={300} y={110} textAnchor="middle" className="fill-fg-muted" fontSize={14}>
            {t("analytics.chartNotEnoughData")}
          </text>
        )}

        {/* X-axis labels (first, last, and hover) */}
        {points.length > 0 ? (
          <>
            <text x={40} y={200} className="fill-fg-muted" fontSize={10}>
              {points[0]!.date}
            </text>
            {points.length > 1 ? (
              <text x={580} y={200} textAnchor="end" className="fill-fg-muted" fontSize={10}>
                {points[points.length - 1]!.date}
              </text>
            ) : null}
          </>
        ) : null}
      </svg>

      <p className="text-label text-fg-muted sr-only" id={tableId}>
        {t("analytics.chartNumericValues", { profileName })}
      </p>
    </figure>
  );
}
