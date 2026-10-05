/**
 * Sparkline — the compact trend glyph: a polyline with no axes, no ticks and
 * no interaction surface.
 *
 * This is the single owner of sparkline geometry in the app. Two callers use
 * it with deliberately different policies, expressed as props rather than as
 * two components:
 *
 *   - Command Center KPI tiles: decorative. `aria-hidden`, because the card's
 *     own visible text already carries the readable value, and an area fill to
 *     match the reference. Nulls collapse, so a missing day reads as
 *     continuity. Fewer than two points draws a flat baseline rather than a
 *     misleading peak.
 *   - Analytics channel cards: self-describing. Carries its own accessible
 *     name, so a caller supplies `ariaLabel`. `preserveGaps` keeps a missing
 *     day a real gap instead of collapsing it, and `hideWhenInsufficient`
 *     renders nothing rather than a flat line, because the surrounding chart
 *     and table already tell that story.
 *
 * Keeping the geometry here means the two surfaces can never drift into two
 * subtly different polyline implementations.
 */
export interface SparklineProps {
  /** Series values. `null`/`undefined` is a gap. */
  values: ReadonlyArray<number | null | undefined>;
  /** viewBox width. The SVG scales via CSS; this is the drawing coordinate space. */
  width?: number;
  /** viewBox height. */
  height?: number;
  /** Paint a soft area fill under the line. */
  fill?: boolean;
  /**
   * When true, a `null` breaks the line and keeps its horizontal space, so a
   * gap is visible as a gap. When false (default) nulls are collapsed and the
   * trend reads as continuous.
   */
  preserveGaps?: boolean;
  /**
   * Render nothing when there are fewer than two drawable points. Use this
   * when the surrounding layout already communicates "not enough data".
   */
  hideWhenInsufficient?: boolean;
  /**
   * Accessible name. When omitted the sparkline is decorative and hidden from
   * assistive tech; when supplied it becomes an `img` with this label.
   */
  ariaLabel?: string;
  /**
   * Caller-supplied identifier emitted as `data-testid-id`, so a caller can
   * address one instance among many in a test without wrapping the SVG in an
   * extra element (which would break a "renders nothing" assertion).
   */
  entityId?: string;
  strokeWidth?: number;
  testId?: string;
  className?: string;
}

export function Sparkline({
  values,
  width = 100,
  height = 32,
  fill = true,
  preserveGaps = false,
  hideWhenInsufficient = false,
  ariaLabel,
  entityId,
  strokeWidth = 2,
  testId = "sparkline",
  className,
}: SparklineProps) {
  const isNumber = (value: number | null | undefined): value is number =>
    typeof value === "number" && Number.isFinite(value);

  // With gaps preserved, x comes from the FULL index so a missing day holds
  // its horizontal position instead of being squeezed out.
  const drawable = values.filter(isNumber);
  if (drawable.length < 2 && hideWhenInsufficient) return null;

  // A 2-unit inset keeps the stroke from clipping against the viewBox edge.
  const inset = 2;
  const baseline = height - inset;

  if (drawable.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className={className}
        {...(ariaLabel ? { role: "img", "aria-label": ariaLabel } : { "aria-hidden": true })}
        focusable="false"
        data-testid={testId}
        data-testid-id={entityId}
      >
        <line
          x1={0}
          x2={width}
          y1={baseline}
          y2={baseline}
          className="stroke-border"
          strokeWidth={strokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  const min = Math.min(...drawable);
  const range = Math.max(1, Math.max(...drawable) - min);
  const span = width - inset * 2;
  const usableHeight = height - inset * 2;
  const divisor = Math.max(1, values.length - 1);
  const yOf = (value: number) => inset + usableHeight - ((value - min) / range) * usableHeight;

  const segments: string[] = [];
  let firstX = 0;
  let lastX = 0;
  let previousWasNumeric = false;
  let drawn = 0;
  // A plain `for` loop, not `forEach`: TypeScript's control-flow analysis
  // does not see assignments made inside a callback, which narrows these
  // locals to their initial values at the point they are read below.
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!isNumber(value)) {
      // Only a gap-preserving run breaks the line; otherwise nulls collapse
      // and the trend stays continuous.
      if (preserveGaps) previousWasNumeric = false;
      continue;
    }
    const x = inset + (index * span) / divisor;
    const y = yOf(value);
    if (drawn === 0) firstX = x;
    lastX = x;
    drawn += 1;
    segments.push(`${previousWasNumeric ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`);
    previousWasNumeric = true;
  }

  const line = segments.join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      {...(ariaLabel ? { role: "img", "aria-label": ariaLabel } : { "aria-hidden": true })}
      focusable="false"
      data-testid={testId}
      data-testid-id={entityId}
    >
      {fill && drawn > 1 ? (
        <path
          d={`${line} L${lastX.toFixed(2)},${height} L${firstX.toFixed(2)},${height} Z`}
          fill="var(--primary)"
          opacity={0.1}
        />
      ) : null}
      <path
        d={line}
        className="stroke-primary fill-none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
