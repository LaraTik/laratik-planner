/**
 * Health rollups — the planning list and the workspace KPIs both need to
 * classify each content item into a small set of operational buckets.
 *
 * The KPI tile and the row "Health" column must NEVER disagree, so the
 * classification lives in one place and both surfaces call it.
 *
 * IMPORTANT: this is a list-safe rollup. The full readiness service
 * (`@/lib/publishing/readiness`) does 4+ DB round-trips per item to
 * evaluate per-channel blockers — that is correct for the detail page
 * where one item is being published, but it is not affordable for a
 * 20-row list page. The rollup here uses the same status-level concepts
 * (draft / content_review / in_design / ready / published / blocked /
 * cancelled) plus the date-overdue signal. It intentionally does not
 * read per-channel platformPayload or approval state — those are
 * detail-page concerns.
 *
 * Decision ADR-0005 (planning list at-risk semantics) records the
 * product decision: "At risk" is strictly the past-due, still-in-flight
 * subset. Drafts are NOT excluded, but a separate "Not started" tile
 * (count of items still in `draft`) is added to the KPI bar so the
 * "at risk 23/27" case stops being a proxy for "drafts that slipped".
 */

import type { ContentStatus } from "@/lib/content/status";

/**
 * The finite set of operational health states a row can be in.
 *
 * `at_risk` — past-due AND still in flight (not done, not cancelled, not blocked).
 * `blocked` — explicit `blocked` status (a manager parked it with a reason).
 * `overdue` — past-due AND in a review/design state (more specific than at_risk;
 *              these are the items where the team is on the hook).
 * `not_started` — still in `draft` (never submitted for review).
 * `needs_review` — in a review state (content/creative/changes) regardless of date.
 * `ready` — ready to publish or partially published.
 * `in_progress` — past review, pre-ready (approved_for_design, in_design).
 * `published` — fully published.
 * `cancelled` — terminal.
 * `scheduled` — future-dated, in flight, no other flag.
 */
export type HealthSnapshot =
  | "at_risk"
  | "blocked"
  | "overdue"
  | "not_started"
  | "needs_review"
  | "ready"
  | "in_progress"
  | "published"
  | "cancelled"
  | "scheduled";

const TERMINAL_PUBLISHED = new Set<ContentStatus>([
  "ready_to_publish",
  "partially_published",
  "published",
]);
const REVIEW_STATUSES = new Set<ContentStatus>([
  "content_review",
  "creative_review",
  "changes_requested",
]);
const IN_PROGRESS_STATUSES = new Set<ContentStatus>(["approved_for_design", "in_design"]);

/**
 * Classify a single content item into a HealthSnapshot.
 *
 * Pure function — no DB access, no Date.now() reads. Pass `now` explicitly
 * so unit tests can pin the clock and the list page can pass the same
 * `Date` used to render the month.
 */
export function classifyHealth(input: {
  status: ContentStatus;
  plannedPublishAt: Date;
  now: Date;
}): HealthSnapshot {
  const { status, plannedPublishAt, now } = input;
  const isPastDue = plannedPublishAt.getTime() < now.getTime();

  if (status === "cancelled") return "cancelled";
  if (status === "blocked") return "blocked";
  if (status === "published") return "published";
  if (status === "draft") {
    // Drafts are separately bucketed so the "at risk" count stops being
    // a back-of-drafts proxy. The detail page still shows the raw
    // status; the row Health column is a derived signal.
    return "not_started";
  }
  if (REVIEW_STATUSES.has(status)) {
    return isPastDue ? "overdue" : "needs_review";
  }
  if (IN_PROGRESS_STATUSES.has(status)) {
    return isPastDue ? "overdue" : "in_progress";
  }
  if (TERMINAL_PUBLISHED.has(status)) {
    return "ready";
  }
  // Fall-through (should not happen — defensive). If we land here, the
  // status enum has been extended without updating this rollup. Treat
  // the row as scheduled (the most neutral bucket) so the page still
  // renders; the missing case will surface in tests.
  return isPastDue ? "at_risk" : "scheduled";
}

/**
 * Aggregate a list of HealthSnapshots into KPI counts.
 *
 * `atRisk` mirrors the strict-overdue definition: past-due AND not in
 * (ready_to_publish, partially_published, published, cancelled, blocked).
 * Drafts are EXCLUDED — they are reported via `notStarted` instead, so
 * a back-of-drafts month no longer shows "at risk 23/27".
 *
 * `overdue` is a stricter bucket (past-due AND in a review/design
 * state). It's surfaced separately on the row Health column, not on
 * the KPI bar, because the KPI bar is meant to be a single-glance
 * summary of "where is the team on the hook".
 */
export function aggregateHealth(input: {
  rows: { status: ContentStatus; plannedPublishAt: Date }[];
  now: Date;
}): {
  total: number;
  atRisk: number;
  overdue: number;
  notStarted: number;
  needsReview: number;
  ready: number;
  inProgress: number;
  blocked: number;
  published: number;
  cancelled: number;
  scheduled: number;
} {
  const counts = {
    atRisk: 0,
    overdue: 0,
    notStarted: 0,
    needsReview: 0,
    ready: 0,
    inProgress: 0,
    blocked: 0,
    published: 0,
    cancelled: 0,
    scheduled: 0,
  };
  for (const row of input.rows) {
    const snap = classifyHealth({
      status: row.status,
      plannedPublishAt: row.plannedPublishAt,
      now: input.now,
    });
    switch (snap) {
      case "at_risk":
        counts.atRisk += 1;
        break;
      case "overdue":
        counts.atRisk += 1;
        counts.overdue += 1;
        break;
      case "not_started":
        counts.notStarted += 1;
        break;
      case "needs_review":
        counts.needsReview += 1;
        break;
      case "ready":
        counts.ready += 1;
        break;
      case "in_progress":
        counts.inProgress += 1;
        break;
      case "blocked":
        counts.blocked += 1;
        break;
      case "published":
        counts.published += 1;
        break;
      case "cancelled":
        counts.cancelled += 1;
        break;
      case "scheduled":
        counts.scheduled += 1;
        break;
    }
  }
  return { total: input.rows.length, ...counts };
}

/**
 * Past-due days. `0` for not-past-due rows. Positive integer for past-due rows.
 * Used by the row "3 days overdue" label.
 */
export function daysOverdue(input: { plannedPublishAt: Date; now: Date }): number {
  const ms = input.now.getTime() - input.plannedPublishAt.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / 86_400_000);
}

/**
 * The HealthSnapshots that count as "needs attention" — the basis for
 * the manager "Needs attention" view filter. This is intentionally a
 * list of buckets, not a re-implementation of the readiness service:
 * the same rollup that drives the row Health column drives this view.
 */
export const ATTENTION_HEALTHS: readonly HealthSnapshot[] = [
  "at_risk",
  "overdue",
  "blocked",
  "needs_review",
];
