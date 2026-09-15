"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, Info } from "lucide-react";
import { DirAwareArrowRight } from "@/components/ui/dir-aware-icon";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { humanStatus } from "@/lib/content/status";
import { explainStatus } from "@/lib/content/workflow-explanations";
import { ActivityTimeline, type ActivityEventView } from "./activity-timeline";
import { useLocaleT } from "@/components/i18n/locale-provider";
import type { PlanningAttentionItem } from "@/lib/planning/presentation";

/**
 * OverviewCommandCenter — the at-a-glance summary that lives
 * under the `Overview` tab of the content workspace.
 *
 * It deliberately does NOT duplicate the per-section detail.
 * Its job is to answer the four questions a planner asks when
 * they open a record:
 *
 *   1. What's happening?     → Next Action card
 *   2. Is something wrong?    → Needs attention
 *   3. How ready is it?       → Compact readiness summary
 *   4. Where is the work?     → Workspace snapshots
 *   5. What just happened?    → Recent activity (last 5)
 *
 * Every actionable row links to the section that resolves it
 * (Content / Publishing / Activity) so the user doesn't have
 * to hunt for the right tab.
 *
 * Server-renderable — the component is a Client Component
 * only because it embeds ActivityTimeline and the contextual
 * overdue acknowledgement. The shape of props is plain data.
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
  plannedPublishAtIso: string;
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
  /** Unified attention model shared with the workflow rail. */
  attention?: PlanningAttentionItem[];
  /** Total delivery versions, with the final-approved count. */
  deliveryCount: number;
  finalApprovedCount: number;
  /** Creative references surfaced for fast review and handoff. */
  references?: string[];
  /** Last N activity events (typically 3-5). */
  recentActivity: ActivityEventView[];
  /** Total activity events on record. */
  totalActivityCount: number;
  /** Whether the user can edit content. */
  canEdit: boolean;
  /** Whether inline overview fields remain editable in later workflow stages. */
  canEditOverview?: boolean;
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
  /** Localized fields projected by the shared planning presentation model. */
  workflowStageLabel?: string;
  nextActionHeadline?: string;
  nextActionDescription?: string;
  nextActionDestinationTab?: string;
  nextActionExecutable?: boolean;
  onAcknowledgeOverdue?: (input: {
    workspaceSlug: string;
    contentItemId: string;
  }) => Promise<{ ok: boolean }>;
  /** When present, links to the delivery version in the Creative
   *  tab. Used to deep-link from "review changes" copy. */
  reviewChangesHref?: string;
}

export function OverviewCommandCenter({
  workspaceSlug,
  contentItemId,
  contentStatus,
  brief,
  plannedPublishAt,
  channels,
  readinessBlockers,
  readinessCanPublish,
  readiness,
  attention = [],
  deliveryCount,
  finalApprovedCount,
  recentActivity,
  totalActivityCount,
  canEdit,
  canEditOverview = canEdit,
  editHref,
  onReadinessNavigate,
  primaryActionLabel,
  workflowStageLabel,
  nextActionHeadline,
  nextActionDescription,
  nextActionDestinationTab,
  nextActionExecutable,
  onAcknowledgeOverdue,
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
        {...(workflowStageLabel ? { workflowStageLabel } : {})}
        {...(nextActionHeadline ? { nextActionHeadline } : {})}
        {...(nextActionDescription ? { nextActionDescription } : {})}
        {...(nextActionDestinationTab ? { nextActionDestinationTab } : {})}
        {...(nextActionExecutable !== undefined ? { nextActionExecutable } : {})}
        {...(reviewChangesHref ? { reviewChangesHref } : {})}
      />
      <NeedsAttention
        items={attention}
        onNavigate={onReadinessNavigate}
        workspaceSlug={workspaceSlug}
        contentItemId={contentItemId}
        plannedPublishAt={plannedPublishAt}
        editHref={editHref}
        canAcknowledgeOverdue={canEditOverview}
        {...(onAcknowledgeOverdue ? { onAcknowledgeOverdue } : {})}
        t={t}
      />
      <ReadinessSummary
        blockers={readinessBlockers}
        canPublish={readinessCanPublish}
        lines={readiness}
        t={t}
      />
      <WorkspaceSnapshot
        brief={brief}
        deliveryCount={deliveryCount}
        finalApprovedCount={finalApprovedCount}
        channels={channels}
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

function WorkspaceSnapshot({
  brief,
  deliveryCount,
  finalApprovedCount,
  channels,
  t,
}: {
  brief: string;
  deliveryCount: number;
  finalApprovedCount: number;
  channels: OverviewSummaryChannel[];
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const cards = [
    {
      id: "brief",
      label: t("contentDetail.tabs.content"),
      fact: brief ? t("contentDetail.overview.snapshotReady") : t("contentDetail.overview.noBrief"),
      href: "#content",
    },
    {
      id: "copy",
      label: t("contentDetail.tabs.copy"),
      fact: t("contentDetail.overview.snapshotSharedCopy"),
      href: "#copy",
    },
    {
      id: "assets",
      label: t("contentDetail.tabs.delivery"),
      fact: t("contentDetail.overview.snapshotVersions", { count: deliveryCount }),
      href: "#delivery",
    },
    {
      id: "publish",
      label: t("contentDetail.tabs.publishing"),
      fact: t("contentDetail.overview.snapshotChannels", { count: channels.length }),
      href: "#publishing",
    },
  ];
  return (
    <section aria-labelledby="overview-snapshot-heading" data-testid="overview-workspace-snapshot">
      <h2
        id="overview-snapshot-heading"
        className="text-label text-fg-secondary mb-2 font-semibold uppercase"
      >
        {t("contentDetail.overview.workspaceSnapshot")}
      </h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.id}
            href={card.href}
            className="border-border bg-surface hover:bg-surface-subtle focus-visible:ring-focus-ring min-h-20 rounded-[var(--radius-control)] border p-3 focus-visible:ring-2 focus-visible:outline-none"
            data-testid={`overview-snapshot-${card.id}`}
          >
            <span className="text-body text-fg-primary block font-semibold">{card.label}</span>
            <span className="text-label text-fg-muted mt-1 block">{card.fact}</span>
            <span className="text-label text-primary mt-2 block font-semibold">
              {t("contentDetail.overview.goTo")}
            </span>
          </Link>
        ))}
      </div>
      {finalApprovedCount > 0 ? <span className="sr-only">{finalApprovedCount}</span> : null}
    </section>
  );
}

function NeedsAttention({
  items,
  onNavigate,
  workspaceSlug,
  contentItemId,
  plannedPublishAt,
  editHref,
  canAcknowledgeOverdue,
  onAcknowledgeOverdue,
  t,
}: {
  items: PlanningAttentionItem[];
  onNavigate: ((href: string) => void) | undefined;
  workspaceSlug: string;
  contentItemId: string;
  plannedPublishAt: string;
  editHref: string;
  canAcknowledgeOverdue: boolean;
  onAcknowledgeOverdue?: (input: {
    workspaceSlug: string;
    contentItemId: string;
  }) => Promise<{ ok: boolean }>;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [acknowledging, startAcknowledging] = React.useTransition();
  const [acknowledged, setAcknowledged] = React.useState(false);
  const openCount = items.reduce((total, item) => total + (item.count ?? 1), 0);
  const visibleItems = acknowledged
    ? items.filter((item) => item.code !== "schedule_overdue")
    : items;
  if (visibleItems.length === 0) return null;
  return (
    <section aria-labelledby="overview-attention-heading" data-testid="overview-needs-attention">
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h2
          id="overview-attention-heading"
          className="text-label text-fg-secondary font-semibold uppercase"
        >
          {t("contentDetail.overview.needsAttention")}
        </h2>
        <span className="text-label text-fg-muted">
          {t("contentDetail.overview.attentionCount", { count: openCount })}
        </span>
      </header>
      <ul className="border-border bg-surface divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-control)] border">
        {visibleItems.map((item) => {
          const destination = item.destinationTab ? `#${item.destinationTab}` : undefined;
          const isOverdue = item.code === "schedule_overdue";
          const message = item.messageKey ? t(item.messageKey) : item.message;
          const content = (
            <div className="flex min-w-0 flex-1 items-start gap-2">
              {item.severity === "blocking" ? (
                <AlertTriangle className="text-danger mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : item.severity === "attention" ? (
                <Info className="text-warning mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <Circle className="text-fg-muted mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span className="text-body text-fg-primary min-w-0 break-words">
                {item.count && item.count > 1 ? (
                  <span className="text-fg-secondary me-1 font-semibold">
                    {t("contentDetail.overview.issueCount", { count: item.count })}
                  </span>
                ) : null}
                {message}
                {isOverdue ? (
                  <span className="text-label text-fg-muted mt-1 block">{plannedPublishAt}</span>
                ) : null}
              </span>
            </div>
          );
          return (
            <li key={`${item.path}:${item.code}`} data-testid={`overview-attention-${item.code}`}>
              {isOverdue ? (
                <div className="flex min-h-11 flex-wrap items-start gap-2 px-3 py-2">
                  {content}
                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      href={editHref}
                      className="text-label text-primary inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-2 font-semibold underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                    >
                      {t("contentDetail.overview.reschedule")}
                    </Link>
                    {canAcknowledgeOverdue && onAcknowledgeOverdue ? (
                      <button
                        type="button"
                        disabled={acknowledging}
                        className="text-label text-fg-secondary inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-2 font-semibold underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                        onClick={() =>
                          startAcknowledging(async () => {
                            const result = await onAcknowledgeOverdue({
                              workspaceSlug,
                              contentItemId,
                            });
                            if (result.ok) {
                              setAcknowledged(true);
                              window.location.reload();
                            }
                          })
                        }
                      >
                        {t("contentDetail.overview.keepPastDate")}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : destination ? (
                <button
                  type="button"
                  className="hover:bg-surface-subtle focus-visible:ring-focus-ring flex min-h-11 w-full items-start gap-2 px-3 py-2 text-start focus-visible:ring-2 focus-visible:outline-none"
                  data-testid={`overview-attention-link-${item.code}`}
                  onClick={() =>
                    onNavigate ? onNavigate(destination) : (window.location.hash = destination)
                  }
                >
                  {content}
                  <DirAwareArrowRight
                    className="text-fg-muted mt-0.5 h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                </button>
              ) : (
                <div className="flex min-h-11 items-start gap-2 px-3 py-2">{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────── *
 * Next Action
 * ────────────────────────────────────────────────────────────────────── */

function NextActionCard({
  contentStatus,
  readinessBlockers,
  readinessCanPublish,
  primaryActionLabel,
  workflowStageLabel,
  nextActionHeadline,
  nextActionDescription,
  nextActionDestinationTab,
  nextActionExecutable,
  reviewChangesHref,
  t,
}: {
  contentStatus: string;
  readinessBlockers: number;
  readinessCanPublish: boolean;
  canEdit: boolean;
  editHref: string;
  primaryActionLabel?: string;
  workflowStageLabel?: string;
  nextActionHeadline?: string;
  nextActionDescription?: string;
  nextActionDestinationTab?: string;
  nextActionExecutable?: boolean;
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
  const headline = nextActionHeadline ?? nextHeadline(contentStatus, readinessBlockers, t);
  const body =
    nextActionDescription ?? nextBody(contentStatus, safeExplain(contentStatus)?.next, t);

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
        {workflowStageLabel ? (
          <p className="text-label text-fg-secondary" data-testid="overview-workflow-stage">
            {workflowStageLabel}
          </p>
        ) : null}
        <CardTitle className="text-body text-fg-primary text-lg font-semibold">
          {headline}
        </CardTitle>
        {body ? <CardDescription>{body}</CardDescription> : null}
        {primaryActionLabel ? (
          <p className="text-label text-fg-secondary pt-1" data-testid="overview-next-action-label">
            <span className="font-semibold">{t("contentDetail.overview.nextActionLabel")}</span>{" "}
            {primaryActionLabel}
          </p>
        ) : null}
        {nextActionDestinationTab ? (
          <Link
            href={`#${nextActionDestinationTab}`}
            className="text-label text-primary focus-visible:ring-focus-ring mt-1 inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-control)] font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
            data-testid="overview-next-action-destination"
          >
            {nextActionExecutable
              ? t("contentDetail.workflow.goToAction")
              : t("contentDetail.workflow.viewAction")}
            <DirAwareArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : null}
        {contentStatus === "changes_requested" && reviewChangesHref ? (
          <Link
            href={reviewChangesHref}
            className="text-label text-primary focus-visible:ring-focus-ring mt-1 inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-control)] font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
            data-testid="overview-next-action-link"
          >
            {t("contentDetail.overview.openNextAction", {
              action: primaryActionLabel ?? t("contentDetail.nextAction.changesRequested"),
            })}
            <DirAwareArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

function nextHeadline(
  status: string,
  blockers: number,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  // Publishing checks can be evaluated early so the team can see what
  // will eventually be required, but they are not the current job while
  // an item is still being planned, reviewed, or designed. Calling them
  // the next blocker on a draft makes a future concern feel actionable
  // now and competes with the workflow transition owned by the rail.
  if (blockers > 0 && publishingChecksAreActive(status)) {
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

function publishingChecksAreActive(status: string): boolean {
  return ["ready_to_publish", "partially_published"].includes(status);
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
  t,
}: {
  blockers: number;
  canPublish: boolean;
  lines: OverviewReadinessLine[];
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const readyAreas = lines.filter((line) => line.status === "ready").length;
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
      </header>
      <div
        className="border-border bg-surface text-body flex min-h-14 items-center gap-2 rounded-[var(--radius-control)] border px-3 py-3"
        data-testid="overview-readiness-summary"
      >
        {canPublish ? (
          <CheckCircle2 className="text-success h-4 w-4 shrink-0" aria-hidden="true" />
        ) : blockers > 0 ? (
          <AlertTriangle className="text-warning h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <Info className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span className="text-fg-primary font-semibold">
          {t("contentDetail.overview.readinessSummary", {
            ready: readyAreas,
            total: lines.length,
          })}
        </span>
        {blockers > 0 ? (
          <span className="text-label text-fg-muted ms-auto">
            {t(
              blockers === 1
                ? "contentDetail.overview.blockerPreventsPublishing"
                : "contentDetail.overview.blockersPreventPublishing",
              { count: blockers },
            )}
          </span>
        ) : null}
      </div>
    </section>
  );
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
