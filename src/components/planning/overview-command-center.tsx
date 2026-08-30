"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  History,
  Info,
  Pencil,
  Send,
  Users,
} from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { humanFormat, humanStatus } from "@/lib/content/status";
import { explainStatus } from "@/lib/content/workflow-explanations";
import { ActivityTimeline, type ActivityEventView } from "./activity-timeline";

/**
 * OverviewCommandCenter — the at-a-glance summary that lives
 * under the `Overview` tab of the content workspace.
 *
 * It deliberately does NOT duplicate the per-section detail.
 * Its job is to answer the four questions a planner asks when
 * they open a record:
 *
 *   1. What's happening?     → Next Action card
 *   2. Is something wrong?    → Readiness summary
 *   3. What is this?         → Content summary (one-line per field)
 *   4. What just happened?    → Recent activity (last 5)
 *
 * Every actionable row links to the section that resolves it
 * (Content / Creative / Publishing / Activity) so the user
 * doesn't have to hunt for the right tab.
 *
 * Server-renderable — the component is a Client Component
 * only because it embeds ActivityTimeline (which is a client
 * component for the kind → icon map). The shape of props is
 * plain data.
 */
export interface OverviewSummaryChannel {
  id: string;
  platform: string;
  accountName: string;
  configured: boolean;
}

export interface OverviewReadinessLine {
  id: string;
  label: string;
  status: "ready" | "warning" | "danger" | "neutral";
  /** Optional one-liner explaining the status. */
  detail?: string;
  /** Anchor href into the workspace (e.g. `#creative`). */
  href?: string;
}

export interface OverviewCommandCenterProps {
  workspaceSlug: string;
  contentItemId: string;
  contentStatus: string;
  format: string;
  plannedPublishAt: string;
  workspaceTimezone: string;
  channels: OverviewSummaryChannel[];
  /** Name of the content owner, when present. */
  ownerName?: string | null;
  /** Total blockers from the readiness service. */
  readinessBlockers: number;
  readinessCanPublish: boolean;
  /** Compact readiness summary, one line per workspace area. */
  readiness: OverviewReadinessLine[];
  /** Total delivery versions, with the final-approved count. */
  deliveryCount: number;
  finalApprovedCount: number;
  /** Last N activity events (typically 3-5). */
  recentActivity: ActivityEventView[];
  /** Total activity events on record. */
  totalActivityCount: number;
  /** Whether the user can edit content. */
  canEdit: boolean;
  /** Edit-content href (the "Edit content" CTA in the header). */
  editHref: string;
  /** Why is the primary action what it is. Used to render the
   *  contextual CTA copy in the Next Action card. */
  primaryActionLabel?: string;
  /** When present, links to the delivery version in the Creative
   *  tab. Used to deep-link from "review changes" copy. */
  reviewChangesHref?: string;
}

export function OverviewCommandCenter({
  workspaceSlug,
  contentItemId,
  contentStatus,
  format,
  plannedPublishAt,
  workspaceTimezone,
  channels,
  ownerName,
  readinessBlockers,
  readinessCanPublish,
  readiness,
  deliveryCount,
  finalApprovedCount,
  recentActivity,
  totalActivityCount,
  canEdit,
  editHref,
  primaryActionLabel,
  reviewChangesHref,
}: OverviewCommandCenterProps) {
  return (
    <div className="space-y-6" data-testid="overview-command-center">
      <NextActionCard
        contentStatus={contentStatus}
        readinessBlockers={readinessBlockers}
        readinessCanPublish={readinessCanPublish}
        canEdit={canEdit}
        editHref={editHref}
        {...(primaryActionLabel ? { primaryActionLabel } : {})}
        {...(reviewChangesHref ? { reviewChangesHref } : {})}
      />
      <ReadinessSummary
        blockers={readinessBlockers}
        canPublish={readinessCanPublish}
        lines={readiness}
      />
      <ContentSummary
        contentItemId={contentItemId}
        workspaceSlug={workspaceSlug}
        format={format}
        channels={channels}
        plannedPublishAt={plannedPublishAt}
        workspaceTimezone={workspaceTimezone}
        ownerName={ownerName ?? null}
        deliveryCount={deliveryCount}
        finalApprovedCount={finalApprovedCount}
      />
      <RecentActivity
        events={recentActivity}
        totalCount={totalActivityCount}
        workspaceSlug={workspaceSlug}
        contentItemId={contentItemId}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── *
 * Next Action
 * ────────────────────────────────────────────────────────────────────── */

function NextActionCard({
  contentStatus,
  readinessBlockers,
  readinessCanPublish,
  canEdit,
  editHref,
  primaryActionLabel,
  reviewChangesHref,
}: {
  contentStatus: string;
  readinessBlockers: number;
  readinessCanPublish: boolean;
  canEdit: boolean;
  editHref: string;
  primaryActionLabel?: string;
  reviewChangesHref?: string;
}) {
  const step = safeExplain(contentStatus);

  // "Healthy" item — no action required.
  if (readinessCanPublish && readinessBlockers === 0 && !stepIsActionable(contentStatus)) {
    return null;
  }

  // Pick a contextual headline + CTA.
  const headline = nextHeadline(contentStatus, readinessBlockers);
  const body = nextBody(contentStatus, step?.next);
  const ctaHref = nextHref(contentStatus, editHref, reviewChangesHref);
  const ctaLabel = primaryActionLabel ?? nextCtaLabel(contentStatus, canEdit);

  const tone =
    readinessBlockers > 0
      ? "border-danger/30 bg-danger-subtle/40"
      : contentStatus === "changes_requested"
        ? "border-warning/30 bg-warning-subtle/40"
        : "border-primary/30 bg-primary-subtle/40";

  return (
    <Card padding="md" data-testid="overview-next-action" className={tone}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-label text-fg-muted font-semibold uppercase">Next action</p>
          <CardTitle className="text-body text-fg-primary text-lg font-semibold">
            {headline}
          </CardTitle>
          {body ? <CardDescription>{body}</CardDescription> : null}
        </div>
        {ctaHref && ctaLabel ? (
          <Button asChild size="sm" data-testid="overview-next-action-cta">
            <Link href={ctaHref}>
              {ctaLabel}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function nextHeadline(status: string, blockers: number): string {
  if (blockers > 0) return `${blockers} blocker${blockers === 1 ? "" : "s"} to publish`;
  switch (status) {
    case "draft":
      return "Ready to submit for review";
    case "content_review":
      return "Awaiting internal review";
    case "changes_requested":
      return "Changes requested — update and resubmit";
    case "approved_for_design":
      return "Approved for design — start the creative";
    case "in_design":
      return "In design — submit a delivery to advance";
    case "creative_review":
      return "Awaiting creative review";
    case "ready_to_publish":
      return "Ready to publish";
    case "partially_published":
      return "Partially published — finish the remaining channels";
    case "published":
      return "Published";
    case "blocked":
      return "Blocked — needs an unblock reason";
    case "cancelled":
      return "Cancelled";
    default:
      return humanStatus(status);
  }
}

function nextBody(status: string, fallback: string | undefined): string | null {
  if (status === "changes_requested") {
    return "A reviewer left feedback. Update the requested content and resubmit for review.";
  }
  if (status === "approved_for_design") {
    return "A designer can claim this item and start the creative, or a manager can assign a designer.";
  }
  if (status === "in_design") {
    return "Submit a delivery version to advance to creative review.";
  }
  if (status === "ready_to_publish") {
    return "Open Publishing to schedule or publish to the configured channels.";
  }
  return fallback ?? null;
}

function nextHref(status: string, editHref: string, reviewChangesHref: string | undefined): string {
  switch (status) {
    case "changes_requested":
      return reviewChangesHref ?? editHref;
    case "approved_for_design":
    case "in_design":
    case "creative_review":
      return "#creative";
    case "ready_to_publish":
    case "partially_published":
      return "#publishing";
    case "draft":
    case "content_review":
    default:
      return editHref;
  }
}

function nextCtaLabel(status: string, canEdit: boolean): string {
  switch (status) {
    case "draft":
      return canEdit ? "Edit content" : "View content";
    case "content_review":
      return "View content";
    case "changes_requested":
      return "Review changes";
    case "approved_for_design":
    case "in_design":
    case "creative_review":
      return "Open Creative";
    case "ready_to_publish":
    case "partially_publish":
      return "Open Publishing";
    default:
      return "View";
  }
}

function stepIsActionable(status: string): boolean {
  return [
    "draft",
    "content_review",
    "changes_requested",
    "approved_for_design",
    "in_design",
    "creative_review",
    "ready_to_publish",
    "partially_published",
    "blocked",
  ].includes(status);
}

function safeExplain(status: string) {
  try {
    return explainStatus(status as Parameters<typeof explainStatus>[0]);
  } catch {
    return null;
  }
}

/* ────────────────────────────────────────────────────────────────────── *
 * Readiness
 * ────────────────────────────────────────────────────────────────────── */

function ReadinessSummary({
  blockers,
  canPublish,
  lines,
}: {
  blockers: number;
  canPublish: boolean;
  lines: OverviewReadinessLine[];
}) {
  return (
    <section
      aria-labelledby="overview-readiness-heading"
      data-testid="overview-readiness"
      data-blockers={blockers}
      data-ready={canPublish}
    >
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="overview-readiness-heading"
          className="text-label text-fg-secondary font-semibold uppercase"
        >
          Readiness
        </h2>
        {blockers > 0 ? (
          <p className="text-label text-fg-muted inline-flex items-center gap-1.5">
            <AlertTriangle className="text-danger h-3.5 w-3.5" aria-hidden="true" />
            <span data-testid="overview-readiness-blocker-count">
              {blockers} blocker{blockers === 1 ? "" : "s"} prevent publishing
            </span>
          </p>
        ) : canPublish ? (
          <p className="text-label text-fg-muted inline-flex items-center gap-1.5">
            <CheckCircle2 className="text-success h-3.5 w-3.5" aria-hidden="true" />
            Ready to publish
          </p>
        ) : null}
      </header>
      <ul
        className="border-border bg-surface divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-control)] border"
        data-testid="overview-readiness-list"
      >
        {lines.map((line) => (
          <ReadinessRow key={line.id} line={line} />
        ))}
      </ul>
    </section>
  );
}

function ReadinessRow({ line }: { line: OverviewReadinessLine }) {
  const content = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <StatusIcon status={line.status} />
      <div className="min-w-0 flex-1">
        <p className="text-body text-fg-primary font-semibold">{line.label}</p>
        {line.detail ? <p className="text-label text-fg-muted truncate">{line.detail}</p> : null}
      </div>
    </div>
  );
  const className =
    "flex items-center gap-2 px-3 py-2 hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:ring-focus-ring focus-visible:ring-2 focus-visible:outline-none";
  if (line.href) {
    return (
      <li data-testid={`overview-readiness-row-${line.id}`} data-status={line.status}>
        <Link
          href={line.href}
          className={className}
          data-testid={`overview-readiness-link-${line.id}`}
        >
          {content}
          <ArrowRight className="text-fg-muted h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </Link>
      </li>
    );
  }
  return (
    <li
      data-testid={`overview-readiness-row-${line.id}`}
      data-status={line.status}
      className="px-3 py-2"
    >
      {content}
    </li>
  );
}

function StatusIcon({ status }: { status: OverviewReadinessLine["status"] }) {
  if (status === "ready") {
    return <CheckCircle2 className="text-success h-4 w-4 shrink-0" aria-hidden="true" />;
  }
  if (status === "warning") {
    return <Info className="text-warning h-4 w-4 shrink-0" aria-hidden="true" />;
  }
  if (status === "danger") {
    return <AlertTriangle className="text-danger h-4 w-4 shrink-0" aria-hidden="true" />;
  }
  return <Circle className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />;
}

/* ────────────────────────────────────────────────────────────────────── *
 * Content Summary
 * ────────────────────────────────────────────────────────────────────── */

function ContentSummary({
  workspaceSlug,
  contentItemId,
  format,
  channels,
  plannedPublishAt,
  workspaceTimezone,
  ownerName,
  deliveryCount,
  finalApprovedCount,
}: {
  workspaceSlug: string;
  contentItemId: string;
  format: string;
  channels: OverviewSummaryChannel[];
  plannedPublishAt: string;
  workspaceTimezone: string;
  ownerName: string | null;
  deliveryCount: number;
  finalApprovedCount: number;
}) {
  return (
    <section aria-labelledby="overview-content-heading" data-testid="overview-content-summary">
      <h2
        id="overview-content-heading"
        className="text-label text-fg-secondary mb-2 font-semibold uppercase"
      >
        At a glance
      </h2>
      <dl
        className="border-border bg-surface grid grid-cols-1 divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-control)] border sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3"
        data-testid="overview-content-summary-list"
      >
        <SummaryRow
          icon={<Pencil className="text-fg-muted h-3.5 w-3.5" aria-hidden="true" />}
          label="Format"
          value={humanFormat(format)}
        />
        <SummaryRow
          icon={<Users className="text-fg-muted h-3.5 w-3.5" aria-hidden="true" />}
          label="Channels"
          value={channelSummary(channels)}
        />
        <SummaryRow
          icon={<CalendarDays className="text-fg-muted h-3.5 w-3.5" aria-hidden="true" />}
          label="Planned publish"
          value={
            <span>
              {plannedPublishAt} <span className="text-fg-muted">· {workspaceTimezone}</span>
            </span>
          }
        />
        <SummaryRow
          icon={<Send className="text-fg-muted h-3.5 w-3.5" aria-hidden="true" />}
          label="Creative"
          value={creativeSummary(deliveryCount, finalApprovedCount)}
        />
        {ownerName ? (
          <SummaryRow
            icon={<Users className="text-fg-muted h-3.5 w-3.5" aria-hidden="true" />}
            label="Owner"
            value={ownerName}
          />
        ) : null}
        <SummaryRow
          icon={<History className="text-fg-muted h-3.5 w-3.5" aria-hidden="true" />}
          label="Workspace"
          value={
            <Link
              href={`/app/w/${workspaceSlug}`}
              className="text-primary underline-offset-4 hover:underline"
              data-testid="overview-workspace-link"
              data-content-item-id={contentItemId}
            >
              Back to workspace
            </Link>
          }
        />
      </dl>
    </section>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 px-3 py-2.5">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <dt className="text-label text-fg-muted font-semibold uppercase">{label}</dt>
        <dd className="text-body text-fg-primary mt-0.5 break-words">{value}</dd>
      </div>
    </div>
  );
}

function channelSummary(channels: OverviewSummaryChannel[]): string {
  if (channels.length === 0) return "No channels";
  if (channels.length === 1) return `${channels[0]!.platform} · ${channels[0]!.accountName}`;
  const configured = channels.filter((c) => c.configured).length;
  return `${channels.length} channels (${configured} configured)`;
}

function creativeSummary(total: number, finalApproved: number): string {
  if (total === 0) return "No delivery yet";
  if (finalApproved === 0) return `${total} version${total === 1 ? "" : "s"} — none approved`;
  return `${finalApproved} approved of ${total}`;
}

/* ────────────────────────────────────────────────────────────────────── *
 * Recent Activity
 * ────────────────────────────────────────────────────────────────────── */

function RecentActivity({
  events,
  totalCount,
  workspaceSlug,
  contentItemId,
}: {
  events: ActivityEventView[];
  totalCount: number;
  workspaceSlug: string;
  contentItemId: string;
}) {
  return (
    <section
      aria-labelledby="overview-recent-activity-heading"
      data-testid="overview-recent-activity"
    >
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="overview-recent-activity-heading"
          className="text-label text-fg-secondary font-semibold uppercase"
        >
          Recent activity
        </h2>
        {totalCount > events.length ? (
          <Link
            href={`#activity`}
            className="text-label text-primary focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] px-1.5 py-0.5 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
            data-testid="overview-view-all-activity"
            data-workspace-slug={workspaceSlug}
            data-content-item-id={contentItemId}
          >
            View all
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </header>
      {events.length > 0 ? (
        <div className="border-border bg-surface rounded-[var(--radius-control)] border px-2 py-1">
          <ActivityTimeline events={events} title="" maxEvents={events.length} />
        </div>
      ) : (
        <Card padding="md" data-testid="overview-recent-activity-empty">
          <p className="text-body text-fg-muted">
            No activity yet. Changes to this content will appear here.
          </p>
        </Card>
      )}
    </section>
  );
}
