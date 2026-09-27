import * as React from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { ActivityEntry } from "./activity-entry";
import type { ActivityRenderSpec } from "@/lib/activity/types";

/**
 * ActivityTimeline — per-content-item lifecycle timeline shell.
 *
 * Wraps the same `<ActivityEntry />` rows used by the
 * workspace-wide `<ActivityFeed />` in a `<Card>` with an
 * optional title + an "older events" overflow note.
 *
 * The timeline is intentionally not a duplicate of the
 * Discussion thread. It's a *lifecycle* view (status
 * transitions, deliveries uploaded, publish-recorded) so a
 * planner can answer "what happened to this item?" at a
 * glance. Comments are kept on the Discussion surface.
 *
 * Server-renderable (no `"use client"`). Filtering is the
 * caller's responsibility (see
 * `components/planning/activity-with-filters.tsx`).
 */

export interface ActivityTimelineProps {
  /** Pre-rendered specs produced by `formatActivityEvent`. */
  specs: ActivityRenderSpec[];
  /** Optional title shown above the list. */
  title?: string;
  /** Maximum events to render. Older events fall off the
   *  bottom — the parent decides the cut. */
  maxEvents?: number;
  /** Render the timestamp using a parent-supplied
   *  locale-aware formatter. */
  renderTime?: (iso: string) => React.ReactNode;
  /** Localised copy. */
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function ActivityTimeline({
  specs,
  title,
  maxEvents = 25,
  renderTime,
  t,
}: ActivityTimelineProps) {
  const visible = specs.slice(0, maxEvents);
  const resolvedTitle = title ?? t("contentDetail.activity.title");
  if (visible.length === 0) {
    return (
      <Card padding="md" data-testid="activity-timeline">
        <CardTitle className="text-body text-fg-primary font-semibold">{resolvedTitle}</CardTitle>
        <p className="text-body text-fg-muted mt-2">{t("contentDetail.activity.emptyState")}</p>
      </Card>
    );
  }
  return (
    <Card padding="md" data-testid="activity-timeline">
      {resolvedTitle ? (
        <CardTitle className="text-body text-fg-primary mb-3 font-semibold">
          {resolvedTitle}
        </CardTitle>
      ) : null}
      <ol className="space-y-2" data-testid="activity-timeline-list">
        {visible.map((spec) => (
          <ActivityEntry key={spec.id} spec={spec} bare {...(renderTime ? { renderTime } : {})} />
        ))}
      </ol>
      {specs.length > maxEvents ? (
        <p className="text-label text-fg-muted mt-2" data-testid="activity-timeline-overflow">
          {t("contentDetail.activity.olderEvents", {
            count: specs.length - maxEvents,
          })}
        </p>
      ) : null}
    </Card>
  );
}
