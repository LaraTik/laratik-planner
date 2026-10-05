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
}: {
  slots: CommandCenterTimeSlot[];
  locale: string;
  labels: BestTimeHeatmapLabels;
  timezone: string;
  testId?: string;
}) {
  const byKey = new Map(slots.map((slot) => [`${slot.dayOfWeek}:${slot.hour}`, slot]));
  const maxAverage = Math.max(1, ...slots.map((slot) => slot.averageViews));
  const best = slots.reduce<CommandCenterTimeSlot | null>(
    (winner, slot) => (!winner || slot.averageViews > winner.averageViews ? slot : winner),
    null,
  );
  const bestKey = best ? `${best.dayOfWeek}:${best.hour}` : null;

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
                  // Intensity is relative to the strongest band so the
                  // warmest cell is always fully saturated and the grid
                  // stays readable across very different view volumes.
                  const intensity = slot ? 0.18 + (slot.averageViews / maxAverage) * 0.82 : 0;
                  const cellLabel = slot
                    ? `${formatNumber(slot.averageViews, locale)} ${labels.averageViews} · ${slot.sampleSize} ${labels.sampleSize}`
                    : labels.noData;
                  return (
                    <td key={`${day}:${hour}`} className="p-0">
                      <div
                        title={`${labels.days[day]} ${String(hour).padStart(2, "0")}:00 — ${cellLabel}`}
                        aria-label={`${labels.days[day]} ${String(hour).padStart(2, "0")}:00 — ${cellLabel}${isBest ? ` · ${labels.bestSlot}` : ""}${slot && !slot.reliable ? ` · ${labels.notEnoughData}` : ""}`}
                        data-testid={`command-center-heatmap-cell-${day}-${hour}`}
                        data-has-data={slot ? "true" : "false"}
                        data-best={isBest ? "true" : "false"}
                        className={[
                          "h-6 w-full rounded-[3px] border",
                          slot ? "border-primary/25" : "border-border bg-surface-subtle",
                          isBest ? "border-primary ring-primary/40 ring-2" : "",
                        ].join(" ")}
                        style={
                          slot
                            ? { backgroundColor: "var(--primary)", opacity: intensity }
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
