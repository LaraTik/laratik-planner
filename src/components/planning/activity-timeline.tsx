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
  Trash2,
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { humanStatus, humanFormat } from "@/lib/content/status";
import { useLocaleCode } from "@/components/i18n/locale-provider";
import { DateFormat, formatDate } from "@/lib/i18n/format-locale";

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
  /**
   * Bound translator from the parent. Resolves the section
   * title, the empty state, the "older events" truncation
   * note, and every `kind`-based humanised phrase through
   * the active message catalog.
   */
  t: (key: string, params?: Record<string, string | number>) => string;
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
  delete: Trash2,
  bulk_delete: Trash2,
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
  delete: "border-danger/30 bg-danger-subtle text-danger",
  bulk_delete: "border-danger/30 bg-danger-subtle text-danger",
};

export function ActivityTimeline({ events, title, maxEvents = 25, t }: ActivityTimelineProps) {
  const locale = useLocaleCode();
  const visible = events.slice(0, maxEvents);
  // Default title comes from the catalog; callers can still
  // override (the planning detail's overview-command-center
  // passes `title=""` to suppress the heading).
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
      <CardTitle className="text-body text-fg-primary mb-3 font-semibold">
        {resolvedTitle}
      </CardTitle>
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
                  <span className="text-fg-secondary">{humanizeKind(t, e.kind, e.summary)}</span>
                </p>
                <p className="text-label text-fg-muted">
                  <time dateTime={e.occurredAt}>
                    {formatDate(e.occurredAt, locale, DateFormat.dateTime)}
                  </time>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {events.length > maxEvents ? (
        <p className="text-label text-fg-muted mt-2">
          {t("contentDetail.activity.olderEvents", { count: events.length - maxEvents })}
        </p>
      ) : null}
    </Card>
  );
}

function humanizeKind(
  t: (key: string, params?: Record<string, string | number>) => string,
  kind: string,
  summary: string,
): string {
  if (summary) return summary;
  switch (kind) {
    case "status_transition":
      return t("contentDetail.activity.kindStatusTransition");
    case "brief_updated":
      return t("contentDetail.activity.kindBriefUpdated");
    case "title_updated":
      return t("contentDetail.activity.kindTitleUpdated");
    case "date_updated":
      return t("contentDetail.activity.kindDateUpdated");
    case "content_updated":
      return t("contentDetail.activity.kindContentUpdated");
    case "content_copy_patched":
      return t("contentDetail.activity.kindContentCopyPatched");
    case "delivery_submitted":
      return t("contentDetail.activity.kindDeliverySubmitted");
    case "comment_added":
      return t("contentDetail.activity.kindCommentAdded");
    case "mention":
      return t("contentDetail.activity.kindMention");
    case "ai_draft_applied":
      return t("contentDetail.activity.kindAiDraftApplied");
    case "publication_recorded":
      return t("contentDetail.activity.kindPublicationRecorded");
    case "publication":
      return t("contentDetail.activity.kindPublication");
    case "blocked":
      return t("contentDetail.activity.kindBlocked");
    case "claimed":
      return t("contentDetail.activity.kindClaimed");
    case "assignment":
      return t("contentDetail.activity.kindAssignment");
    case "schedule_change":
      return t("contentDetail.activity.kindScheduleChange");
    case "bulk_archive":
      return t("contentDetail.activity.kindBulkArchive");
    case "create":
      return t("contentDetail.activity.kindCreate");
    case "update":
      return t("contentDetail.activity.kindUpdate");
    case "system":
      return t("contentDetail.activity.kindSystem");
    case "delete":
      return t("contentDetail.activity.kindDelete");
    case "bulk_delete":
      return t("contentDetail.activity.kindBulkDelete");
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
