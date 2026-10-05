/**
 * Sparkline — the compact trend glyph used inside Command Center KPI cards.
 *
 * The reference Command Center shows each metric as label → big number →
 * delta → mini trend line. This component owns only that last part: a
 * sparkline has no axes, no ticks and no interactive surface, so it
 * carries `aria-hidden` and the readable value always comes from the
 * card's own visible text. That keeps the accessible name on the
 * meaningful element instead of duplicating the number inside a graphic.
 *
 * Fewer than two finite points means there is no shape to draw, so the
 * caller gets a flat baseline rather than a misleading peak.
 */
export interface SparklineProps {
  values: ReadonlyArray<number | null | undefined>;
  /** Extra classes for the <svg> element. */
  className?: string;
}

export function Sparkline({ values, className }: SparklineProps) {
  const points = values.filter((value): value is number => typeof value === "number");
  const width = 100;
  const height = 32;
  // A 2px inset keeps the stroke from clipping against the viewBox edge.
  const inset = 2;

  if (points.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className={className}
        aria-hidden="true"
        focusable="false"
        data-testid="sparkline"
      >
        <line
          x1={0}
          x2={width}
          y1={height - inset}
          y2={height - inset}
          className="stroke-border"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(1, max - min);
  const span = width - inset * 2;
  const usableHeight = height - inset * 2;
  const coordinates = points.map((value, index) => ({
    x: inset + (index * span) / Math.max(1, points.length - 1),
    y: inset + usableHeight - ((value - min) / range) * usableHeight,
  }));
  const line = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  const first = coordinates[0]!;
  const last = coordinates[coordinates.length - 1]!;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      focusable="false"
      data-testid="sparkline"
    >
      <path
        d={`${line} L${last.x},${height} L${first.x},${height} Z`}
        fill="var(--primary)"
        opacity={0.1}
      />
      <path
        d={line}
        className="stroke-primary fill-none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
