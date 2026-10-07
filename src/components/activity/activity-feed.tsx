import * as React from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { Activity } from "lucide-react";
import { ActivityEntry } from "./activity-entry";
import type { ActivityRenderSpec } from "@/lib/activity/types";

/**
 * ActivityFeed — workspace-wide activity feed row list.
 *
 * Replaces the inline `<ol>` block in
 * `src/app/(app)/app/a/[agencySlug]/w/[slug]/activity/page.tsx`. The page is
 * server-rendered: it already has the activity rows + actor +
 * target labels. This component receives a list of pre-rendered
 * specs (built once in the page using `formatActivityEvent`)
 * and emits the rows.
 *
 * The component is server-renderable (no `"use client"`). It
 * is intentionally presentational — filtering, pagination, and
 * search live in the page so the URL stays the source of truth.
 */

export interface ActivityFeedProps {
  /** Pre-rendered specs. The page is responsible for running
   *  `buildActivityContext` + `formatActivityEvent` once. */
  specs: ActivityRenderSpec[];
  /** When `specs` is empty and `emptyTitle` is provided, the
   *  component renders the standard `<EmptyState>`. */
  emptyTitle?: string;
  emptyBody?: string;
  /** Optional scope chip per row (e.g. "Content", "Brand kit"). */
  scopeLabels?: ReadonlyMap<string, string>;
  /** Render the timestamp; the page supplies its own
   *  timezone-aware formatter. */
  renderTime?: (iso: string) => React.ReactNode;
}

export function ActivityFeed({
  specs,
  emptyTitle,
  emptyBody,
  scopeLabels,
  renderTime,
}: ActivityFeedProps) {
  if (specs.length === 0) {
    return (
      <div className="p-6" data-testid="activity-feed-empty">
        <EmptyState
          icon={<Activity className="h-8 w-8" aria-hidden="true" />}
          title={emptyTitle ?? "No activity yet"}
          description={emptyBody ?? ""}
        />
      </div>
    );
  }
  return (
    <ol
      className="divide-border divide-y"
      data-testid="activity-feed"
      aria-label={emptyTitle ?? "Activity feed"}
    >
      {specs.map((spec) => (
        <div key={spec.id} className="relative">
          <ActivityEntry spec={spec} {...(renderTime ? { renderTime } : {})} />
          {scopeLabels ? (
            <Badge
              variant="outline"
              className="absolute end-3 top-3 hidden sm:inline-flex"
              data-testid="activity-feed-scope"
            >
              {scopeLabels.get(spec.kind) ?? ""}
            </Badge>
          ) : null}
        </div>
      ))}
    </ol>
  );
}

/**
 * ActivityFeedCard — the workspace feed wrapped in a Card with a
 * header. The page supplies the title + description.
 */
export interface ActivityFeedCardProps extends ActivityFeedProps {
  title: string;
  description?: React.ReactNode;
  trailing?: React.ReactNode;
}

export function ActivityFeedCard({
  title,
  description,
  trailing,
  specs,
  emptyTitle,
  emptyBody,
  scopeLabels,
  renderTime,
}: ActivityFeedCardProps) {
  return (
    <Card padding="none" data-testid="activity-feed-card">
      <div className="border-border flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <CardTitle className="text-body text-fg-primary font-semibold">{title}</CardTitle>
          {description ? <p className="text-label text-fg-muted mt-0.5">{description}</p> : null}
        </div>
        {trailing}
      </div>
      <ActivityFeed
        specs={specs}
        {...(emptyTitle ? { emptyTitle } : {})}
        {...(emptyBody ? { emptyBody } : {})}
        {...(scopeLabels ? { scopeLabels } : {})}
        {...(renderTime ? { renderTime } : {})}
      />
    </Card>
  );
}
