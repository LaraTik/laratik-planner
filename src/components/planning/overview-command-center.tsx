"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, Info, Pencil } from "lucide-react";
import { DirAwareArrowRight } from "@/components/ui/dir-aware-icon";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { humanFormat, humanStatus } from "@/lib/content/status";
import { explainStatus } from "@/lib/content/workflow-explanations";
import { ActivityTimeline, type ActivityEventView } from "./activity-timeline";
import { useLocaleT } from "@/components/i18n/locale-provider";

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
 *   3. What is this?         → Details (title, format, channels,
 *                              schedule, brief, owner)
 *   4. What just happened?    → Recent activity (last 5)
 *
 * Every actionable row links to the section that resolves it
 * (Content / Publishing / Activity) so the user doesn't have
 * to hunt for the right tab.
 *
 * Server-renderable — the component is a Client Component
 * only because it embeds ActivityTimeline + the inline
 * editors (both of which are client components). The shape
 * of props is plain data.
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
  title: string;
  brief: string;
  format: string;
  plannedPublishAt: string;
  workspaceTimezone: string;
  channels: OverviewSummaryChannel[];
  /**
   * Bound translator from the parent (planning detail page).
   * Threaded to the embedded `<ActivityTimeline>` so the
   * activity tab's title / empty state / kind-based
   * humanised phrases render in the active locale. The overview
   * chrome uses the same translator so Arabic/RTL never silently
   * falls back to English.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
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
  /**
   * Optional callback fired when a readiness row with a
   * destination is clicked. The parent (the planning-detail
   * page) uses this to switch tabs and scroll the target
   * sub-anchor into view, because Next.js's `<Link>` with
   * a same-page hash doesn't always scroll to a section
   * that just mounted. When absent, the row falls back to
   * a plain `<Link>` (preserves the previous behaviour for
   * callers that haven't been updated yet).
   */
  onReadinessNavigate?: (href: string) => void;
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
  title,
  brief,
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
  onReadinessNavigate,
  primaryActionLabel,
  reviewChangesHref,
  t: tProp,
}: OverviewCommandCenterProps) {
  const localeT = useLocaleT();
  const t = tProp ?? localeT;
  return (
    <div className="space-y-6" data-testid="overview-command-center">
      <NextActionCard
        contentStatus={contentStatus}
        readinessBlockers={readinessBlockers}
        readinessCanPublish={readinessCanPublish}
        canEdit={canEdit}
        editHref={editHref}
        t={t}
        {...(primaryActionLabel ? { primaryActionLabel } : {})}
        {...(reviewChangesHref ? { reviewChangesHref } : {})}
      />
      <ReadinessSummary
        blockers={readinessBlockers}
        canPublish={readinessCanPublish}
        lines={readiness}
        onNavigate={onReadinessNavigate}
        t={t}
      />
      <DetailsSection
        contentItemId={contentItemId}
        title={title}
        brief={brief}
        format={format}
        channels={channels}
        plannedPublishAt={plannedPublishAt}
        workspaceTimezone={workspaceTimezone}
        ownerName={ownerName ?? null}
        deliveryCount={deliveryCount}
        finalApprovedCount={finalApprovedCount}
        editHref={editHref}
        t={t}
      />
      <RecentActivity
        events={recentActivity}
        totalCount={totalActivityCount}
        workspaceSlug={workspaceSlug}
        contentItemId={contentItemId}
        t={t}
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
  t,
}: {
  contentStatus: string;
  readinessBlockers: number;
  readinessCanPublish: boolean;
  canEdit: boolean;
  editHref: string;
  primaryActionLabel?: string;
  reviewChangesHref?: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  // "Healthy" item — no action required.
  if (readinessCanPublish && readinessBlockers === 0 && !stepIsActionable(contentStatus)) {
    return null;
  }

  // The right rail now owns the primary workflow transition
  // action (Submit for review, Resubmit, Approve, etc.) and the
  // current stage block. The Overview's "Next action" card
  // therefore no longer renders its own CTA — it summarises
  // the work that needs attention and links each item to the
  // relevant workspace section. The right rail handles the
  // actual transition.
  const headline = nextHeadline(contentStatus, readinessBlockers, t);
  const body = nextBody(contentStatus, safeExplain(contentStatus)?.next, t);

  const tone =
    readinessBlockers > 0
      ? "border-danger/30 bg-danger-subtle/40"
      : contentStatus === "changes_requested"
        ? "border-warning/30 bg-warning-subtle/40"
        : "border-primary/30 bg-primary-subtle/40";

  return (
    <Card padding="md" data-testid="overview-next-action" className={tone}>
      <div className="space-y-1.5">
        <p className="text-label text-fg-muted font-semibold uppercase">
          {t("contentDetail.overview.actionRequired")}
        </p>
        <CardTitle className="text-body text-fg-primary text-lg font-semibold">
          {headline}
        </CardTitle>
        {body ? <CardDescription>{body}</CardDescription> : null}
      </div>
    </Card>
  );
}

function nextHeadline(
  status: string,
  blockers: number,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (blockers > 0) {
    return t(
      blockers === 1
        ? "contentDetail.overview.blockersToPublish"
        : "contentDetail.overview.blockersToPublishMany",
      { count: blockers },
    );
  }
  switch (status) {
    case "draft":
      return t("contentDetail.overview.readyToSubmit");
    case "content_review":
      return t("contentDetail.overview.awaitingInternalReview");
    case "changes_requested":
      return t("contentDetail.overview.changesRequested");
    case "approved_for_design":
      return t("contentDetail.overview.approvedForDesign");
    case "in_design":
      return t("contentDetail.overview.inDesign");
    case "creative_review":
      return t("contentDetail.overview.awaitingCreativeReview");
    case "ready_to_publish":
      return t("contentDetail.overview.readyToPublish");
    case "partially_published":
      return t("contentDetail.overview.partiallyPublished");
    case "published":
      return t("contentDetail.overview.published");
    case "blocked":
      return t("contentDetail.overview.blocked");
    case "cancelled":
      return t("contentDetail.overview.cancelled");
    default:
      return humanStatus(status);
  }
}

function nextBody(
  status: string,
  fallback: string | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): string | null {
  if (status === "changes_requested") {
    return t("contentDetail.overview.changesRequestedBody");
  }
  if (status === "approved_for_design") {
    return t("contentDetail.overview.approvedForDesignBody");
  }
  if (status === "in_design") {
    return t("contentDetail.overview.inDesignBody");
  }
  if (status === "ready_to_publish") {
    return t("contentDetail.overview.readyToPublishBody");
  }
  return fallback ?? null;
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
  onNavigate,
  t,
}: {
  blockers: number;
  canPublish: boolean;
  lines: OverviewReadinessLine[];
  onNavigate: ((href: string) => void) | undefined;
  t: (key: string, params?: Record<string, string | number>) => string;
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
          {t("contentDetail.overview.readiness")}
        </h2>
        {blockers > 0 ? (
          <p className="text-label text-fg-muted inline-flex items-center gap-1.5">
            <AlertTriangle className="text-danger h-3.5 w-3.5" aria-hidden="true" />
            <span data-testid="overview-readiness-blocker-count">
              {t(
                blockers === 1
                  ? "contentDetail.overview.blockerPreventsPublishing"
                  : "contentDetail.overview.blockersPreventPublishing",
                { count: blockers },
              )}
            </span>
          </p>
        ) : canPublish ? (
          <p className="text-label text-fg-muted inline-flex items-center gap-1.5">
            <CheckCircle2 className="text-success h-3.5 w-3.5" aria-hidden="true" />
            {t("contentDetail.overview.readyToPublish")}
          </p>
        ) : null}
      </header>
      <ul
        className="border-border bg-surface divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-control)] border"
        data-testid="overview-readiness-list"
      >
        {lines.map((line) => (
          <ReadinessRow key={line.id} line={line} onNavigate={onNavigate} />
        ))}
      </ul>
    </section>
  );
}

function ReadinessRow({
  line,
  onNavigate,
}: {
  line: OverviewReadinessLine;
  onNavigate: ((href: string) => void) | undefined;
}) {
  const content = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <StatusIcon status={line.status} />
      <div className="min-w-0 flex-1">
        <p className="text-body text-fg-primary font-semibold">{line.label}</p>
        {line.detail ? <p className="text-label text-fg-muted break-words">{line.detail}</p> : null}
      </div>
    </div>
  );
  const className =
    "flex min-h-11 items-center gap-2 px-3 py-2 hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:ring-focus-ring focus-visible:ring-2 focus-visible:outline-none";
  if (line.href) {
    // Phase 1 of the planning-workspace-v2 refactor (2026-08-30):
    // when the parent supplies an `onNavigate` callback we
    // render a real <button> that triggers it. The button
    // still updates the URL hash via the same code path the
    // <Link> used to, but the parent's callback also
    // switches tabs and scrolls the target anchor into view
    // (Next.js's <Link> with a same-page hash doesn't always
    // scroll when the destination section just mounted).
    if (onNavigate) {
      return (
        <li data-testid={`overview-readiness-row-${line.id}`} data-status={line.status}>
          <button
            type="button"
            className={className + " w-full text-start"}
            data-testid={`overview-readiness-link-${line.id}`}
            onClick={() => onNavigate(line.href!)}
          >
            {content}
            <DirAwareArrowRight className="text-fg-muted h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </button>
        </li>
      );
    }
    return (
      <li data-testid={`overview-readiness-row-${line.id}`} data-status={line.status}>
        <Link
          href={line.href}
          className={className}
          data-testid={`overview-readiness-link-${line.id}`}
        >
          {content}
          <DirAwareArrowRight className="text-fg-muted h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </Link>
      </li>
    );
  }
  return (
    <li
      data-testid={`overview-readiness-row-${line.id}`}
      data-status={line.status}
      className="min-h-11 px-3 py-2"
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
 * Details
 *
 * Phase 6 of the planning-detail refactor (2026-08-30) merged
 * the old "At a glance" card and the Content tab's "Basic
 * information" block into a single `DetailsSection` that lives
 * in the Overview. Editable fields render the existing
 * `Inline*Editor` components so routine edits (title, date,
 * brief) stay in the user's current context.
 *
 * The "Edit details" deep-link at the bottom opens the
 * `/edit/[id]` route, which the header's `EditDetailsDrawer`
 * also surfaces as a button. Both paths lead to the same form;
 * the deep-link is the fallback for users without JS / in a
 * preview environment.
 * ────────────────────────────────────────────────────────────────────── */

function DetailsSection({
  contentItemId,
  title,
  brief,
  format,
  channels,
  plannedPublishAt,
  workspaceTimezone,
  ownerName,
  deliveryCount,
  finalApprovedCount,
  editHref,
  t,
}: {
  contentItemId: string;
  title: string;
  brief: string;
  format: string;
  channels: OverviewSummaryChannel[];
  plannedPublishAt: string;
  workspaceTimezone: string;
  ownerName: string | null;
  deliveryCount: number;
  finalApprovedCount: number;
  editHref: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <section aria-labelledby="overview-details-heading" data-testid="overview-content-summary">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="overview-details-heading"
          className="text-label text-fg-secondary font-semibold uppercase"
        >
          {t("contentDetail.overview.details")}
        </h2>
        <Link
          href={editHref}
          className="text-label text-primary focus-visible:ring-focus-ring inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-control)] px-2 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
          data-testid="overview-edit-details"
          data-content-item-id={contentItemId}
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />
          {t("contentDetail.overview.editDetails")}
        </Link>
      </header>
      <dl
        className="border-border bg-surface divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-control)] border sm:grid sm:grid-cols-2 sm:divide-x sm:divide-y-0"
        data-testid="overview-content-summary-list"
      >
        <SummaryRow
          label={t("contentDetail.overview.title")}
          value={
            <span className="text-body text-fg-primary font-semibold break-words">{title}</span>
          }
        />
        <SummaryRow label={t("contentDetail.overview.format")} value={humanFormat(format)} />
        <SummaryRow
          label={t("contentDetail.overview.channels")}
          value={channelSummary(channels, t)}
        />
        <SummaryRow
          label={t("contentDetail.overview.plannedPublish")}
          value={
            <>
              {plannedPublishAt}{" "}
              <span className="text-label text-fg-muted">· {workspaceTimezone}</span>
            </>
          }
        />
        {ownerName ? (
          <SummaryRow label={t("contentDetail.overview.owner")} value={ownerName} />
        ) : null}
        <SummaryRow
          label={t("contentDetail.overview.versions")}
          value={versionsSummary(deliveryCount, finalApprovedCount, t)}
        />
        <SummaryRow
          label={t("contentDetail.overview.brief")}
          value={
            brief ? (
              <span className="text-body text-fg-primary whitespace-pre-wrap">{brief}</span>
            ) : (
              <span className="text-body text-fg-muted">{t("contentDetail.overview.noBrief")}</span>
            )
          }
        />
      </dl>
    </section>
  );
}

function SummaryRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
}) {
  // Per the HTML5 spec, a <dl> can contain a <div> wrapper but the
  // wrapper must contain exactly one <dt> followed by one <dd>. No
  // siblings, no presentational content. The icon was dropped from
  // each row (it was decorative anyway) to satisfy axe-core's
  // `definition-list` rule.
  return (
    <div className="min-h-11 px-3 py-2.5">
      <dt className="text-label text-fg-muted font-semibold uppercase">{label}</dt>
      <dd className="text-body text-fg-primary mt-0.5 break-words">{children ?? value}</dd>
    </div>
  );
}

function channelSummary(
  channels: OverviewSummaryChannel[],
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (channels.length === 0) return t("contentDetail.overview.noChannels");
  if (channels.length === 1) return `${channels[0]!.platform} · ${channels[0]!.accountName}`;
  const configured = channels.filter((c) => c.configured).length;
  return t("contentDetail.overview.channelsConfigured", {
    count: channels.length,
    configured,
  });
}

function versionsSummary(
  total: number,
  finalApproved: number,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (total === 0) return t("contentDetail.overview.noVersions");
  if (finalApproved === 0) {
    return t(
      total === 1
        ? "contentDetail.overview.versionNoneApproved"
        : "contentDetail.overview.versionsNoneApproved",
      { count: total },
    );
  }
  return t("contentDetail.overview.approvedOf", { approved: finalApproved, total });
}

/* ────────────────────────────────────────────────────────────────────── *
 * Recent Activity
 * ────────────────────────────────────────────────────────────────────── */

function RecentActivity({
  events,
  totalCount,
  workspaceSlug,
  contentItemId,
  t,
}: {
  events: ActivityEventView[];
  totalCount: number;
  workspaceSlug: string;
  contentItemId: string;
  t: (key: string, params?: Record<string, string | number>) => string;
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
          {t("contentDetail.overview.recentActivity")}
        </h2>
        {totalCount > events.length ? (
          <Link
            href={`#activity`}
            className="text-label text-primary focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] px-1.5 py-0.5 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
            data-testid="overview-view-all-activity"
            data-workspace-slug={workspaceSlug}
            data-content-item-id={contentItemId}
          >
            {t("contentDetail.overview.viewAll")}
            <DirAwareArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </header>
      {events.length > 0 ? (
        <div className="border-border bg-surface rounded-[var(--radius-control)] border px-2 py-1">
          <ActivityTimeline events={events} title="" maxEvents={events.length} t={t} />
        </div>
      ) : (
        <Card padding="md" data-testid="overview-recent-activity-empty">
          <p className="text-body text-fg-muted">{t("contentDetail.overview.noActivity")}</p>
        </Card>
      )}
    </section>
  );
}
