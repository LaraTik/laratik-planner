import * as React from "react";
import { PlanningListItem, PlanningListItemList } from "@/components/workspace/planning-list-item";
import type { EnrichedContentItem } from "@/lib/content/enriched-list";

/**
 * PlanningListGrouped — the planning list with sticky date group
 * headers. Groups items by week when the user has no filters active
 * (so the visual grouping surfaces naturally); when filters are
 * active, falls back to a flat list because the headers would
 * fragment the data and add noise.
 *
 * Per Goal 33 #15: group by publication date with sticky week
 * headers. We use ISO week boundaries (Mon-Sun) so the headers
 * are stable across the timezone.
 */

const MS_PER_DAY = 86_400_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** ISO week start (Monday 00:00 local) for the given date. */
function isoWeekStart(d: Date): Date {
  const day = startOfDay(d);
  const dow = (day.getDay() + 6) % 7; // Mon=0, ..., Sun=6
  return new Date(day.getTime() - dow * MS_PER_DAY);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function groupKey(d: Date, now: Date): { key: string; label: string } {
  const start = startOfDay(d).getTime();
  const today = startOfDay(now).getTime();
  const daysAhead = Math.round((start - today) / MS_PER_DAY);
  if (daysAhead === 0) return { key: "today", label: "Today" };
  if (daysAhead === 1) return { key: "tomorrow", label: "Tomorrow" };
  if (daysAhead > 1 && daysAhead <= 7) {
    const weekStart = isoWeekStart(d);
    const weekEnd = new Date(weekStart.getTime() + 6 * MS_PER_DAY);
    return {
      key: `week-${weekStart.toISOString()}`,
      label: `This week · ${fmtDate(weekStart)}–${fmtDate(weekEnd)}`,
    };
  }
  if (daysAhead > 7 && daysAhead <= 14) {
    const weekStart = isoWeekStart(d);
    const weekEnd = new Date(weekStart.getTime() + 6 * MS_PER_DAY);
    return {
      key: `week-${weekStart.toISOString()}`,
      label: `Next week · ${fmtDate(weekStart)}–${fmtDate(weekEnd)}`,
    };
  }
  if (daysAhead < 0) {
    return { key: `overdue-${start}`, label: "Overdue" };
  }
  // > 14 days: group by month-day
  return {
    key: `day-${start}`,
    label: d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" }),
  };
}

export interface PlanningListGroupedProps {
  items: EnrichedContentItem[];
  workspaceSlug: string;
  workspaceTimezone: string;
  density: "comfortable" | "compact";
  now: Date;
  /** When true, render with sticky date headers; when false, render flat. */
  grouped: boolean;
  actions?: (item: EnrichedContentItem) => React.ReactNode;
}

export function PlanningListGrouped({
  items,
  workspaceSlug,
  workspaceTimezone,
  density,
  now,
  grouped,
  actions,
}: PlanningListGroupedProps) {
  if (!grouped) {
    return (
      <PlanningListItemList>
        {items.map((it) => (
          <PlanningListItem
            key={it.id}
            item={it}
            workspaceSlug={workspaceSlug}
            workspaceTimezone={workspaceTimezone}
            density={density}
            now={now}
            actions={actions?.(it)}
          />
        ))}
      </PlanningListItemList>
    );
  }

  // Group by date header, preserving sort order (plannedPublishAt ASC).
  const groups: { key: string; label: string; items: EnrichedContentItem[] }[] = [];
  for (const it of items) {
    const g = groupKey(it.plannedPublishAt, now);
    const last = groups[groups.length - 1];
    if (last && last.key === g.key) {
      last.items.push(it);
    } else {
      groups.push({ key: g.key, label: g.label, items: [it] });
    }
  }

  return (
    <div className="space-y-4" data-testid="planning-list-grouped">
      {groups.map((g) => (
        <section key={g.key} data-group={g.key}>
          <h3
            className="text-label text-fg-muted bg-canvas sticky top-0 z-10 mb-2 px-1 py-1 font-semibold tracking-wide uppercase"
            data-testid="planning-group-header"
          >
            {g.label}
            <span className="text-fg-muted ms-2 font-normal">({g.items.length})</span>
          </h3>
          <PlanningListItemList>
            {g.items.map((it) => (
              <PlanningListItem
                key={it.id}
                item={it}
                workspaceSlug={workspaceSlug}
                workspaceTimezone={workspaceTimezone}
                density={density}
                now={now}
                actions={actions?.(it)}
              />
            ))}
          </PlanningListItemList>
        </section>
      ))}
    </div>
  );
}
