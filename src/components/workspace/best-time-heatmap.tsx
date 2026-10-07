import {
  COMMAND_CENTER_TIME_BAND_HOURS,
  type CommandCenterTimeSlot,
} from "@/lib/social/command-center";

/**
 * BestTimeHeatmap — the reference Command Center timing grid.
 *
 * Structure follows the canonical screen: seven day columns (Sun→Sat)
 * crossed with six three-hour band rows, each cell shaded by its share
 * of the strongest average in the window. The best cell is outlined so
 * the recommendation is findable without relying on colour alone.
 *
 * Both the row list and the lookup keys come from
 * `COMMAND_CENTER_TIME_BAND_HOURS`, the same constant the domain buckets
 * with. The previous implementation drew hardcoded rows while the domain
 * keyed slots by exact hour, so almost every cell stayed empty; sharing
 * one constant is what makes the grid and the data agree.
 *
 * Each cell keeps a visible tooltip AND an aria-label with the day, hour,
 * average and sample size, and the whole grid exposes a text summary —
 * the design system requires a chart to never be the only way to read
 * the value.
 */
export interface BestTimeHeatmapLabels {
  days: readonly string[];
  averageViews: string;
  sampleSize: string;
  noData: string;
  legend: string;
  less: string;
  more: string;
  bestSlot: string;
  notEnoughData: string;
  /** Empty cell — no post ever landed here. Must not borrow the below-threshold copy. */
  noPosts: string;
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    numberingSystem: "latn",
    maximumFractionDigits: 0,
  }).format(value);
}

export function BestTimeHeatmap({
  slots,
  locale,
  labels,
  timezone,
  testId,
  bestTime = null,
}: {
  slots: CommandCenterTimeSlot[];
  locale: string;
  labels: BestTimeHeatmapLabels;
  timezone: string;
  testId?: string;
  /**
   * The slot the panel actually recommends, passed in rather than recomputed.
   *
   * This grid used to derive its own winner as the highest average across ALL
   * slots while the header pill took the highest average among RELIABLE ones.
   * On real data those were different cells: the pill read "Tue 15:00" while
   * the ring landed on a 502-view cell backed by a single post, so the panel
   * recommended Tuesday and highlighted Friday. The heatmap also scaled its
   * colour to that same one-post cell, washing out every cell with real
   * support. Both now key off the domain's choice.
   */
  bestTime?: CommandCenterTimeSlot | null;
}) {
  const byKey = new Map(slots.map((slot) => [`${slot.dayOfWeek}:${slot.hour}`, slot]));
  const reliableSlots = slots.filter((slot) => slot.reliable);
  // Anchor the scale on the strongest RELIABLE cell whenever one exists, so
  // colour encodes "well-supported performance" rather than "loudest single
  // post". With no reliable cell yet, fall back to everything.
  const scaleSlots = reliableSlots.length > 0 ? reliableSlots : slots;
  const maxAverage = Math.max(1, ...scaleSlots.map((slot) => slot.averageViews));
  const bestKey = bestTime ? `${bestTime.dayOfWeek}:${bestTime.hour}` : null;

  return (
    <div className="min-w-0">
      <div
        className="overflow-x-auto"
        dir="ltr"
        tabIndex={0}
        aria-label={labels.legend.replace("{timezone}", timezone)}
      >
        <table
          dir={locale.startsWith("ar") ? "rtl" : "ltr"}
          className="w-full table-fixed border-separate border-spacing-0.5 text-center"
          data-testid={testId ?? "command-center-best-time-heatmap"}
        >
          <caption className="sr-only">{labels.legend.replace("{timezone}", timezone)}</caption>
          <thead>
            <tr>
              <th scope="col" className="w-8 text-start">
                <span className="sr-only">{timezone}</span>
              </th>
              {labels.days.map((day) => (
                <th
                  key={day}
                  scope="col"
                  className="text-fg-muted px-0.5 pb-1 text-[10px] font-semibold"
                >
                  <abbr
                    title={day}
                    className="text-fg-muted decoration-clone no-underline"
                    aria-label={day}
                  >
                    {day}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMMAND_CENTER_TIME_BAND_HOURS.map((hour) => (
              <tr key={hour}>
                <th
                  scope="row"
                  className="text-fg-muted pe-1.5 text-[10px] font-medium whitespace-nowrap"
                >
                  {String(hour).padStart(2, "0")}:00
                </th>
                {labels.days.map((_, day) => {
                  const slot = byKey.get(`${day}:${hour}`);
                  const isBest = bestKey === `${day}:${hour}`;
                  // Intensity is relative to the strongest well-supported band,
                  // so the warmest cell is always fully saturated and the grid
                  // stays readable across very different view volumes.
                  const intensity = slot ? 0.18 + (slot.averageViews / maxAverage) * 0.82 : 0;
                  // The dim is folded into the computed value rather than added
                  // as an `opacity-*` utility: this element sets `opacity` as an
                  // inline style, and an inline style always beats a class, so a
                  // Tailwind opacity here is silently dead. Below-threshold
                  // cells therefore carry the distinction through a DASHED
                  // border (shape) plus their text — never through colour or
                  // dimness alone, both of which fail for colour-blind users
                  // and on washed-out screens.
                  const renderedOpacity = slot && !slot.reliable ? intensity * 0.55 : intensity;
                  // Three distinct states, not one. An empty cell has no posts
                  // at all; a cell below the gate has posts but too few to
                  // recommend. Both used to render the same "at least three
                  // posts" sentence, repeated across thirty-odd cells.
                  const cellLabel = !slot
                    ? labels.noPosts
                    : slot.reliable
                      ? `${formatNumber(slot.averageViews, locale)} ${labels.averageViews} · ${slot.sampleSize} ${labels.sampleSize}`
                      : `${formatNumber(slot.averageViews, locale)} ${labels.averageViews} · ${slot.sampleSize} ${labels.sampleSize} · ${labels.notEnoughData}`;
                  return (
                    <td key={`${day}:${hour}`} className="p-0">
                      <div
                        title={`${labels.days[day]} ${String(hour).padStart(2, "0")}:00 — ${cellLabel}`}
                        aria-label={`${labels.days[day]} ${String(hour).padStart(2, "0")}:00 — ${cellLabel}${isBest ? ` · ${labels.bestSlot}` : ""}`}
                        data-testid={`command-center-heatmap-cell-${day}-${hour}`}
                        data-has-data={slot ? "true" : "false"}
                        data-reliable={slot?.reliable ? "true" : "false"}
                        data-best={isBest ? "true" : "false"}
                        className={[
                          "h-6 w-full rounded-[3px] border",
                          slot
                            ? slot.reliable
                              ? "border-primary/25"
                              : // Below the gate: dashed, so a real observation that
                                // cannot support a recommendation is visibly
                                // distinct from one that can.
                                "border-primary/40 border-dashed"
                            : "border-border bg-surface-subtle",
                          isBest ? "border-primary ring-primary/40 ring-2" : "",
                        ].join(" ")}
                        style={
                          slot
                            ? { backgroundColor: "var(--primary)", opacity: renderedOpacity }
                            : undefined
                        }
                      >
                        <span className="sr-only">{cellLabel}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-fg-muted mt-2.5 flex items-center justify-end gap-2">
        <span className="text-[10px] font-semibold">{labels.less}</span>
        <span className="flex items-center gap-0.5" aria-hidden="true">
          {[0.25, 0.5, 0.75, 1].map((step) => (
            <span
              key={step}
              className="border-primary/25 h-3 w-3 rounded-[3px] border"
              style={{ backgroundColor: "var(--primary)", opacity: step }}
            />
          ))}
        </span>
        <span className="text-[10px] font-semibold">{labels.more}</span>
      </div>
    </div>
  );
}
