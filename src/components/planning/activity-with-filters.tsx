"use client";

import * as React from "react";
import { ActivityTimeline, type ActivityEventView } from "./activity-timeline";
import { cn } from "@/lib/utils";

/**
 * ActivityWithFilters — the Activity tab body, with the
 * five filters the user can switch between (All / Comments /
 * Workflow / Publishing / System) per the planning content
 * spec §13.
 *
 * The filter state is local. We keep the full events array in
 * memory and derive the visible list on each render — the
 * activity list is bounded (~50 events per the upstream
 * `listActivityEvents`), so re-deriving is cheap and avoids
 * re-fetching on filter change.
 *
 * Filter chips follow the same pattern as the workspace tabs:
 *   - Plain `<button>` with `aria-pressed` for the active chip.
 *   - The chip text is the count of events in that category,
 *     not the count of currently-visible events. This is the
 *     same shape the planning detail tabs use and keeps the
 *     chips stable as the user filters.
 *
 * A11y:
 *   - The chip strip is a `<div role="toolbar" aria-label>`
 *     so screen readers announce it as a group.
 *   - The active chip carries `aria-pressed="true"`.
 *   - The empty filtered state is announced via a `role="status"`
 *     so the user knows the filter is working (vs. a real
 *     "no activity yet" state).
 */

export type ActivityFilterId = "all" | "comments" | "workflow" | "publishing" | "system";

const FILTERS: ReadonlyArray<{
  id: ActivityFilterId;
  label: string;
  /** Predicate that decides whether an event belongs in this bucket. */
  match: (kind: string) => boolean;
}> = [
  { id: "all", label: "All", match: () => true },
  { id: "comments", label: "Comments", match: (k) => k === "comment" },
  {
    id: "workflow",
    label: "Workflow",
    match: (k) =>
      k === "status_transition" || k === "review" || k === "approval_reset" || k === "assignment",
  },
  {
    id: "publishing",
    label: "Publishing",
    match: (k) => k === "delivery" || k === "publication" || k === "schedule_change",
  },
  {
    id: "system",
    label: "System",
    match: (k) =>
      k === "create" ||
      k === "update" ||
      k === "archive" ||
      k === "restore" ||
      k === "invitation" ||
      k === "ai_assistance",
  },
];

export interface ActivityWithFiltersProps {
  events: ActivityEventView[];
  /** Optional default filter; defaults to "all". */
  defaultFilter?: ActivityFilterId;
}

export function ActivityWithFilters({ events, defaultFilter = "all" }: ActivityWithFiltersProps) {
  const [filter, setFilter] = React.useState<ActivityFilterId>(defaultFilter);

  const counts = React.useMemo(() => {
    const result: Record<ActivityFilterId, number> = {
      all: events.length,
      comments: 0,
      workflow: 0,
      publishing: 0,
      system: 0,
    };
    for (const e of events) {
      for (const f of FILTERS) {
        if (f.id !== "all" && f.match(e.kind)) {
          result[f.id] += 1;
        }
      }
    }
    return result;
  }, [events]);

  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0]!;
  const visible = events.filter((e) => active.match(e.kind));

  return (
    <div className="space-y-3" data-testid="activity-with-filters" data-filter={filter}>
      <div
        role="toolbar"
        aria-label="Filter activity"
        className="flex flex-wrap items-center gap-1.5"
        data-testid="activity-filter-chips"
      >
        {FILTERS.map((f) => {
          const isActive = f.id === filter;
          const count = counts[f.id];
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={isActive}
              data-testid={`activity-filter-${f.id}`}
              data-count={count}
              className={cn(
                "text-label inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 font-semibold",
                "focus-visible:ring-focus-ring focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none",
                isActive
                  ? "border-primary bg-primary-subtle text-primary"
                  : "border-border bg-surface text-fg-secondary hover:bg-surface-subtle",
              )}
            >
              <span>{f.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 tabular-nums",
                  isActive ? "bg-primary/15" : "bg-surface-subtle text-fg-muted",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length > 0 ? (
        <ActivityTimeline events={visible} maxEvents={visible.length} />
      ) : (
        <p
          className="text-body text-fg-muted border-border bg-surface rounded-[var(--radius-control)] border px-3 py-3"
          role="status"
          data-testid="activity-filter-empty"
        >
          No <span className="text-fg-primary font-semibold">{active.label.toLowerCase()}</span>{" "}
          activity yet.
        </p>
      )}
    </div>
  );
}
