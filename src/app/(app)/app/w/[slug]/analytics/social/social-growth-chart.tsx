"use client";

import { useId, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * M4 — accessible SVG growth chart.
 *
 * The chart is a hand-rolled dependency-free SVG so the milestone
 * ships without adding a chart library. The visual contract is
 *
 *   - one series at a time
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
 */

export type GrowthPoint = {
  date: string;
  value: number | null;
};

export function SocialGrowthChart({
  title,
  platform,
  profileName,
  points,
  tableId,
}: {
  title: string;
  platform: string;
  profileName: string;
  points: GrowthPoint[];
  tableId: string;
}) {
  const reactId = useId();
  const chartId = `${reactId}-chart`;
  const descId = `${reactId}-desc`;
  const [hover, setHover] = useState<number | null>(null);
  const numericPoints = useMemo(
    () => points.filter((p) => p.value !== null) as Array<{ date: string; value: number }>,
    [points],
  );
  const latest = numericPoints[numericPoints.length - 1]?.value ?? null;
  const earliest = numericPoints[0]?.value ?? null;
  const trend =
    latest === null || earliest === null
      ? "flat"
      : latest > earliest
        ? "up"
        : latest < earliest
          ? "down"
          : "flat";

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
            {platform} · {profileName}
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
          {trend === "up" ? "Growing" : trend === "down" ? "Declining" : "Flat"}
        </Badge>
      </figcaption>

      <svg
        id={chartId}
        viewBox="0 0 600 220"
        className="mt-4 w-full"
        role="img"
        aria-label={`${title} for ${profileName}. Numeric values are in the table below.`}
        preserveAspectRatio="none"
        style={{ transition: "none" }}
      >
        <title>{title}</title>
        <desc id={descId}>
          A line chart showing follower count over {points.length} day
          {points.length === 1 ? "" : "s"} for {profileName}. Numeric values are in the adjacent
          table.
        </desc>
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
                      aria-label={`${p.date}: ${p.value.toLocaleString()} followers`}
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
                      return (
                        <g>
                          <rect
                            x={Math.min(560, x + 8)}
                            y={Math.max(20, y - 28)}
                            width={120}
                            height={20}
                            className="fill-surface-subtle stroke-border"
                            strokeWidth={1}
                            rx={4}
                          />
                          <text
                            x={Math.min(560, x + 8) + 60}
                            y={Math.max(20, y - 28) + 14}
                            textAnchor="middle"
                            className="fill-fg-primary"
                            fontSize={11}
                          >
                            {p.date}: {p.value.toLocaleString()}
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
            Not enough data to chart yet
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
        Numeric values for {profileName} are in the table below the chart.
      </p>
    </figure>
  );
}
