"use client";

import * as React from "react";
import {
  ArrowRight,
  FileEdit,
  Upload,
  MessageCircle,
  Sparkles,
  Eye,
  ShieldX,
  Play,
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { humanStatus, humanFormat } from "@/lib/content/status";

/**
 * ActivityTimeline — visual history of meaningful lifecycle
 * events for a content item.
 *
 * Sourced from the `activityEvents` table. The events are
 * server-rendered (the page already loads them) and passed
 * into this component as a normalised array.
 *
 * The timeline is intentionally not a duplicate of the
 * Discussion thread. It's a *lifecycle* view (status
 * transitions, deliveries uploaded, publish-recorded) so a
 * planner can answer "what happened to this item?" at a
 * glance. Comments are kept on the Discussion surface.
 */

export interface ActivityEventView {
  id: string;
  kind: string;
  summary: string;
  actorName: string;
  occurredAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface ActivityTimelineProps {
  events: ActivityEventView[];
  /** Optional title shown above the list. */
  title?: string;
  /** Maximum events to render. Older events fall off the
   *  bottom — the parent decides the cut. */
  maxEvents?: number;
}

const ICON_BY_KIND: Record<string, React.ComponentType<{ className?: string }>> = {
  status_transition: ArrowRight,
  brief_updated: FileEdit,
  title_updated: FileEdit,
  date_updated: FileEdit,
  content_updated: FileEdit,
  delivery_submitted: Upload,
  comment_added: MessageCircle,
  mention: MessageCircle,
  ai_draft_applied: Sparkles,
  publication_recorded: Eye,
  publication: Eye,
  blocked: ShieldX,
  claimed: Play,
  assignment: Play,
  schedule_change: FileEdit,
  bulk_archive: FileEdit,
  create: Sparkles,
  update: FileEdit,
  system: ArrowRight,
};

const TONE_BY_KIND: Record<string, string> = {
  status_transition: "border-primary/30 bg-primary-subtle text-primary",
  brief_updated: "border-info/30 bg-info-subtle text-info",
  title_updated: "border-info/30 bg-info-subtle text-info",
  date_updated: "border-info/30 bg-info-subtle text-info",
  content_updated: "border-info/30 bg-info-subtle text-info",
  delivery_submitted: "border-success/30 bg-success-subtle text-success",
  comment_added: "border-border bg-surface text-fg-secondary",
  mention: "border-border bg-surface text-fg-secondary",
  ai_draft_applied: "border-warning/30 bg-warning-subtle text-warning",
  publication_recorded: "border-success/30 bg-success-subtle text-success",
  publication: "border-success/30 bg-success-subtle text-success",
  blocked: "border-danger/30 bg-danger-subtle text-danger",
  claimed: "border-primary/30 bg-primary-subtle text-primary",
  assignment: "border-primary/30 bg-primary-subtle text-primary",
  schedule_change: "border-info/30 bg-info-subtle text-info",
  bulk_archive: "border-warning/30 bg-warning-subtle text-warning",
  create: "border-primary/30 bg-primary-subtle text-primary",
  update: "border-info/30 bg-info-subtle text-info",
  system: "border-border bg-surface text-fg-secondary",
};

export function ActivityTimeline({
  events,
  title = "Activity",
  maxEvents = 25,
}: ActivityTimelineProps) {
  const visible = events.slice(0, maxEvents);
  if (visible.length === 0) {
    return (
      <Card padding="md" data-testid="activity-timeline">
        <CardTitle className="text-body text-fg-primary font-semibold">{title}</CardTitle>
        <p className="text-body text-fg-muted mt-2">No activity yet.</p>
      </Card>
    );
  }
  return (
    <Card padding="md" data-testid="activity-timeline">
      <CardTitle className="text-body text-fg-primary mb-3 font-semibold">{title}</CardTitle>
      <ol className="space-y-2">
        {visible.map((e) => {
          const Icon = ICON_BY_KIND[e.kind] ?? MessageCircle;
          const tone = TONE_BY_KIND[e.kind] ?? "border-border bg-surface text-fg-secondary";
          return (
            <li
              key={e.id}
              className="flex items-start gap-2"
              data-testid="activity-event"
              data-event-kind={e.kind}
            >
              <span
                className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${tone}`}
                aria-hidden="true"
              >
                <Icon className="h-3 w-3" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body text-fg-primary">
                  <span className="font-semibold">{e.actorName}</span>{" "}
                  <span className="text-fg-secondary">{humanizeKind(e.kind, e.summary)}</span>
                </p>
                <p className="text-label text-fg-muted">
                  <time dateTime={e.occurredAt}>{new Date(e.occurredAt).toLocaleString()}</time>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {events.length > maxEvents ? (
        <p className="text-label text-fg-muted mt-2">+{events.length - maxEvents} older events</p>
      ) : null}
    </Card>
  );
}

function humanizeKind(kind: string, summary: string): string {
  if (summary) return summary;
  switch (kind) {
    case "status_transition":
      return "moved the workflow forward";
    case "brief_updated":
      return "updated the brief";
    case "title_updated":
      return "updated the title";
    case "date_updated":
      return "updated the planned publish date";
    case "content_updated":
      return "updated content details";
    case "delivery_submitted":
      return "submitted a delivery version";
    case "comment_added":
      return "commented on the item";
    case "mention":
      return "mentioned someone in a comment";
    case "ai_draft_applied":
      return "applied an AI suggestion";
    case "publication_recorded":
      return "recorded a publication outcome";
    case "publication":
      return "marked the item as published";
    case "blocked":
      return "blocked the item";
    case "claimed":
      return "claimed the design task";
    case "assignment":
      return "was assigned to the item";
    case "schedule_change":
      return "changed the schedule";
    case "bulk_archive":
      return "bulk-archived items";
    case "create":
      return "created the item";
    case "update":
      return "updated the item";
    case "system":
      return "ran a system action";
    default:
      // Last-resort fallback: turn `creative_internal_decision` into
      // "creative internal decision" so we never render raw enum
      // strings to the user. The list above is the canonical map
      // (one entry per `kind:` we emit) — when a new kind is added
      // it MUST be added here in the same PR.
      return kind.replace(/_/g, " ");
  }
}

// Re-export the humanizers from `lib/content/status` so
// callers that use the timeline can also format status /
// format enum values in the rendered text. The `void`
// statement below keeps tree-shaking honest.
void humanStatus;
void humanFormat;
