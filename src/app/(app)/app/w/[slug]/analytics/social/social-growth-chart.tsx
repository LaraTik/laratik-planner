"use client";

import { useId, useMemo, useState } from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";

/** A single dated value in a channel's selected analytics window. */
export type GrowthPoint = {
  date: string;
  value: number | null;
};

const CHART_WIDTH = 680;
const CHART_HEIGHT = 292;
const PLOT_LEFT = 78;
const PLOT_RIGHT = 654;
const PLOT_TOP = 34;
const PLOT_BOTTOM = 236;
const TICK_COUNT = 4;

function formatSigned(value: number, formatValue: (value: number) => string): string {
  return `${value > 0 ? "+" : ""}${formatValue(value)}`;
}

function lineSegments(
  points: Array<{ index: number; value: number }>,
): Array<Array<{ index: number; value: number }>> {
  const segments: Array<Array<{ index: number; value: number }>> = [];
  let current: Array<{ index: number; value: number }> = [];
  let previousIndex = -2;
  for (const point of points) {
    if (point.index !== previousIndex + 1 && current.length > 0) {
      segments.push(current);
      current = [];
    }
    current.push(point);
    previousIndex = point.index;
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

export function SocialGrowthChart({
  title,
  platform,
  profileName,
  metricLabel,
  points,
  tableId,
  growthPercent,
  testId,
}: {
  title: string;
  platform: string;
  profileName: string;
  metricLabel: string;
  points: GrowthPoint[];
  /** ID of the visually-hidden note that connects the chart to its table. */
  tableId: string;
  growthPercent?: number | null;
  testId?: string;
}) {
  const t = useLocaleT();
  const locale = useLocaleCode();
  const formatValue = (value: number) =>
    new Intl.NumberFormat(locale, { numberingSystem: "latn", maximumFractionDigits: 0 }).format(
      value,
    );
  const reactId = useId();
  const descId = `${reactId}-desc`;
  const [hover, setHover] = useState<number | null>(null);
  const numericPoints = useMemo(
    () =>
      points.flatMap((point, index) =>
        typeof point.value === "number" ? [{ index, date: point.date, value: point.value }] : [],
      ),
    [points],
  );
  const first = numericPoints[0] ?? null;
  const latest = numericPoints[numericPoints.length - 1] ?? null;
  const absoluteChange =
    numericPoints.length > 1 && first && latest ? latest.value - first.value : null;
  const trend =
    typeof growthPercent === "number"
      ? growthPercent > 0
        ? "up"
        : growthPercent < 0
          ? "down"
          : "flat"
      : absoluteChange === null
        ? "flat"
        : absoluteChange > 0
          ? "up"
          : absoluteChange < 0
            ? "down"
            : "flat";
  const trendLabel =
    trend === "up"
      ? t("analytics.chartTrendGrowing")
      : trend === "down"
        ? t("analytics.chartTrendDeclining")
        : t("analytics.chartTrendFlat");
  const chartDescription = t(
    numericPoints.length === 1 ? "analytics.chartDescriptionOne" : "analytics.chartDescriptionMany",
    {
      metric: metricLabel.toLocaleLowerCase(locale),
      count: numericPoints.length,
      profileName,
    },
  );
  const changeSummary =
    first && latest
      ? t("analytics.chartChangeSummary", {
          metric: metricLabel,
          start: formatValue(first.value),
          latest: formatValue(latest.value),
          change: formatSigned(absoluteChange ?? 0, formatValue),
          percent:
            typeof growthPercent === "number"
              ? `${growthPercent > 0 ? "+" : ""}${growthPercent.toFixed(1)}%`
              : "—",
          count: numericPoints.length,
        })
      : t("analytics.chartNotEnoughData");

  const rawMin =
    numericPoints.length > 0 ? Math.min(...numericPoints.map((point) => point.value)) : 0;
  const rawMax =
    numericPoints.length > 0 ? Math.max(...numericPoints.map((point) => point.value)) : 1;
  const rawRange = rawMax - rawMin;
  const padding = rawRange > 0 ? rawRange * 0.1 : Math.max(1, rawMax * 0.05);
  const domainMin = Math.max(0, rawMin - padding);
  const domainMax = Math.max(domainMin + 1, rawMax + padding);
  const domainRange = domainMax - domainMin;
  const x = (index: number) =>
    PLOT_LEFT + (index * (PLOT_RIGHT - PLOT_LEFT)) / Math.max(1, points.length - 1);
  const y = (value: number) =>
    PLOT_BOTTOM - ((value - domainMin) / domainRange) * (PLOT_BOTTOM - PLOT_TOP);
  const segments = lineSegments(numericPoints);

  return (
    <figure
      className="border-border bg-surface rounded-lg border p-4"
      data-testid={testId ?? "social-growth-chart"}
      aria-describedby={`${descId} ${tableId}`}
    >
      <figcaption className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-body text-fg-primary font-semibold">{title}</h3>
          <p className="text-label text-fg-muted">
            {platform} · {profileName} · {metricLabel}
          </p>
          <p className="text-body text-fg-secondary mt-2 font-medium" id={descId}>
            {changeSummary}
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
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="mt-4 w-full overflow-visible"
        role="img"
        aria-label={t("analytics.chartAria", { title, profileName, metric: metricLabel })}
        preserveAspectRatio="none"
      >
        <title>{title}</title>
        <desc>{chartDescription}</desc>

        {[0, 1, 2, 3, 4].map((tick) => {
          const ratio = tick / TICK_COUNT;
          const tickValue = domainMax - ratio * domainRange;
          const tickY = PLOT_TOP + ratio * (PLOT_BOTTOM - PLOT_TOP);
          return (
            <g key={tick} aria-hidden="true">
              <line
                x1={PLOT_LEFT}
                x2={PLOT_RIGHT}
                y1={tickY}
                y2={tickY}
                className="stroke-border"
                strokeWidth={tick === TICK_COUNT ? 1.5 : 1}
                strokeDasharray={tick === TICK_COUNT ? undefined : "3 5"}
              />
              <text
                x={PLOT_LEFT - 10}
                y={tickY + 4}
                textAnchor="end"
                className="fill-fg-muted"
                fontSize={11}
              >
                {formatValue(tickValue)}
              </text>
            </g>
          );
        })}

        {numericPoints.length > 1 ? (
          <>
            {segments.map((segment, segmentIndex) => {
              const path = segment
                .map(
                  (point, pointIndex) =>
                    `${pointIndex === 0 ? "M" : "L"}${x(point.index)},${y(point.value)}`,
                )
                .join(" ");
              return (
                <path
                  key={`segment-${segmentIndex}`}
                  d={path}
                  className="stroke-primary fill-none"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}
            {numericPoints.map((point, pointIndex) => (
              <circle
                key={point.date}
                cx={x(point.index)}
                cy={y(point.value)}
                r={hover === pointIndex ? 7 : 4.5}
                className="fill-primary stroke-surface focus-visible:stroke-fg-primary"
                strokeWidth={hover === pointIndex ? 3 : 2}
                tabIndex={0}
                role="button"
                aria-label={t("analytics.chartPointAria", {
                  date: point.date,
                  value: formatValue(point.value),
                  metric: metricLabel.toLocaleLowerCase(locale),
                })}
                onMouseEnter={() => setHover(pointIndex)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(pointIndex)}
                onBlur={() => setHover(null)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setHover(null);
                }}
              />
            ))}
            {hover !== null && numericPoints[hover] ? (
              <g pointerEvents="none" aria-hidden="true">
                <line
                  x1={x(numericPoints[hover].index)}
                  x2={x(numericPoints[hover].index)}
                  y1={PLOT_TOP}
                  y2={PLOT_BOTTOM}
                  className="stroke-primary"
                  strokeDasharray="3 4"
                  opacity={0.35}
                />
                <rect
                  x={Math.min(
                    PLOT_RIGHT - 132,
                    Math.max(PLOT_LEFT, x(numericPoints[hover].index) - 66),
                  )}
                  y={Math.max(PLOT_TOP, y(numericPoints[hover].value) - 34)}
                  width={132}
                  height={24}
                  className="fill-surface stroke-border"
                  rx={5}
                />
                <text
                  x={
                    Math.min(
                      PLOT_RIGHT - 132,
                      Math.max(PLOT_LEFT, x(numericPoints[hover].index) - 66),
                    ) + 66
                  }
                  y={Math.max(PLOT_TOP, y(numericPoints[hover].value) - 34) + 16}
                  textAnchor="middle"
                  className="fill-fg-primary"
                  fontSize={11}
                >
                  {numericPoints[hover].date}: {formatValue(numericPoints[hover].value)}
                </text>
              </g>
            ) : null}
          </>
        ) : (
          <text
            x={(PLOT_LEFT + PLOT_RIGHT) / 2}
            y={140}
            textAnchor="middle"
            className="fill-fg-muted"
            fontSize={14}
          >
            {t("analytics.chartNotEnoughData")}
          </text>
        )}

        <g aria-hidden="true">
          <text x={PLOT_LEFT} y={PLOT_BOTTOM + 24} className="fill-fg-muted" fontSize={11}>
            {points[0]?.date ?? ""}
          </text>
          {points.length > 1 ? (
            <text
              x={PLOT_RIGHT}
              y={PLOT_BOTTOM + 24}
              textAnchor="end"
              className="fill-fg-muted"
              fontSize={11}
            >
              {points[points.length - 1]?.date ?? ""}
            </text>
          ) : null}
        </g>
      </svg>

      <p className="text-label text-fg-muted sr-only" id={tableId}>
        {t("analytics.chartNumericValues", { profileName })}
      </p>
    </figure>
  );
}
