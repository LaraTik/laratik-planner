export type KpiContentStatus =
  | "draft"
  | "content_review"
  | "approved_for_design"
  | "in_design"
  | "creative_review"
  | "ready_to_publish"
  | "partially_published"
  | "published"
  | "changes_requested"
  | "blocked"
  | "cancelled";

export type KpiContentFormat =
  | "static_post"
  | "carousel"
  | "story"
  | "short_form_video"
  | "long_form_video"
  | "live_content"
  | "article"
  | "other";

/**
 * Stable display order for the 8 canonical content formats (per master
 * prompt §10). The overview's format-breakdown bar and the planning
 * library all use this order so the labels never re-shuffle when one
 * format has zero items.
 */
export const CONTENT_FORMAT_ORDER: KpiContentFormat[] = [
  "static_post",
  "short_form_video",
  "long_form_video",
  "carousel",
  "story",
  "live_content",
  "article",
  "other",
];

export const CONTENT_FORMAT_LABELS: Record<KpiContentFormat, string> = {
  static_post: "Image",
  short_form_video: "Reel",
  long_form_video: "Video",
  carousel: "Carousel",
  story: "Story",
  live_content: "Live",
  article: "Article",
  other: "Other",
};

/**
 * Stable display order for the 8 status buckets shown in the overview's
 * Status Pipeline (matches the master prompt's workflow states).
 */
export const CONTENT_STATUS_PIPELINE: KpiContentStatus[] = [
  "draft",
  "approved_for_design",
  "in_design",
  "creative_review",
  "content_review",
  "changes_requested",
  "ready_to_publish",
  "published",
];

export const CONTENT_STATUS_PIPELINE_LABELS: Record<KpiContentStatus, string> = {
  draft: "Draft",
  approved_for_design: "Approved",
  in_design: "In Design",
  creative_review: "Creative",
  content_review: "Content Review",
  changes_requested: "Changes",
  ready_to_publish: "Ready",
  published: "Published",
  partially_published: "Partial",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

/**
 * ADR-0007 — Dashboard "Delivery Health" % reconciliation.
 *
 * The pre-refactor overview labelled the donut "4% AT RISK" while
 * the math was `ready_to_publish + partially_published + published
 * / total` (1/27 → 4%). That label was wrong: 4% was actually
 * "% completed", and it clashed with the at-risk count of 23
 * sitting in the same card.
 *
 * The fix has two halves:
 *
 *  1. Rename the math to what it really computes:
 *     `completionPercent` = `completed / total`. The label on the
 *     page now matches the math.
 *
 *  2. Make the "at risk" signal an *exclusive* count derived from
 *     the strict-overdue definition (past-due AND not in
 *     ready/partially_published/published/cancelled/blocked).
 *     The dashboard renders a stacked health bar (on-track /
 *     at-risk / blocked) and shows the dominant bucket's headline
 *     percentage — never a misleading 4% next to 23 at-risk items.
 */

const COMPLETED_STATUSES: KpiContentStatus[] = [
  "ready_to_publish",
  "partially_published",
  "published",
];

/**
 * Statuses that are never "at risk".
 *
 * `draft` belongs here per ADR-0006, which is unambiguous about the formula:
 *
 *   At risk = plannedPublishAt < now AND status NOT IN
 *             {ready_to_publish, partially_published, published,
 *              cancelled, blocked, draft}
 *
 * It was previously MISSING, so every slipped draft inflated the Overview's
 * at-risk count — reproducing the exact "at risk 23 / total 27" back-of-drafts
 * reading that ADR-0006 was written to kill, on a surface ADR-0006 names
 * explicitly ("workspace overview KPI tile"), while `lib/dashboard/health.ts`
 * filtered drafts out. The Planning list and the Overview disagreed about the
 * same month. Drafts are surfaced through `notStarted` instead.
 */
const NOT_AT_RISK_STATUSES: KpiContentStatus[] = [
  "ready_to_publish",
  "partially_published",
  "published",
  "cancelled",
  "blocked",
  "draft",
];

export function calculateWorkspaceKpis(input: {
  now: Date;
  monthlyTarget: number | null;
  items: { status: KpiContentStatus; plannedPublishAt: Date }[];
}) {
  const actionable = input.items.filter((item) => item.status !== "cancelled");
  const totalIdeas = actionable.length;
  const readyToPublish = actionable.filter((item) => item.status === "ready_to_publish").length;
  const published = actionable.filter((item) => item.status === "published").length;
  const atRisk = actionable.filter(
    (item) =>
      item.plannedPublishAt.getTime() < input.now.getTime() &&
      !(NOT_AT_RISK_STATUSES as readonly KpiContentStatus[]).includes(item.status),
  ).length;
  const coveragePercent = input.monthlyTarget
    ? Math.min(100, Math.round((totalIdeas / input.monthlyTarget) * 100))
    : null;
  const completed = actionable.filter((item) =>
    (COMPLETED_STATUSES as readonly KpiContentStatus[]).includes(item.status),
  ).length;
  // What the dashboard now calls `completionPercent`. Kept as
  // `deliveryHealthPercent` here for backward compatibility with the
  // planning list (which still reads it). The overview page no
  // longer uses it directly — it reads the dashboard-specific shape
  // from `calculateOverviewDashboardMetrics`.
  const deliveryHealthPercent = totalIdeas ? Math.round((completed / totalIdeas) * 100) : 100;
  // Planning-page metrics. needsReview = items in a review state
  // (content/creative/changes). ready = items cleared to publish
  // (ready_to_publish or partially_published) — both can be acted on
  // by a publisher without further review.
  const needsReview = actionable.filter((item) =>
    ["content_review", "creative_review", "changes_requested"].includes(item.status),
  ).length;
  const ready = actionable.filter((item) =>
    ["ready_to_publish", "partially_published"].includes(item.status),
  ).length;

  return {
    totalIdeas,
    readyToPublish,
    published,
    atRisk,
    coveragePercent,
    deliveryHealthPercent,
    needsReview,
    ready,
    onTrack: atRisk === 0 && (coveragePercent === null || coveragePercent >= 100),
    onTrackCount: totalIdeas - atRisk - actionable.filter((i) => i.status === "blocked").length,
    atRiskCount: atRisk,
    blockedCount: actionable.filter((i) => i.status === "blocked").length,
  };
}

/**
 * Extended overview metrics — everything `calculateWorkspaceKpis` returns
 * plus the per-format breakdown, per-status pipeline counts, and the
 * at-risk milestone list shown on the Stitch Workspace Overview screen
 * (project 5403097764334458790).
 *
 * Input items must include `format` (a `KpiContentFormat`). Items with
 * a cancelled status are excluded from the format breakdown and the
 * pipeline so the numbers reflect real workload.
 */
export function calculateOverviewMetrics(input: {
  now: Date;
  monthlyTarget: number | null;
  items: {
    status: KpiContentStatus;
    plannedPublishAt: Date;
    format: KpiContentFormat;
  }[];
}) {
  const kpis = calculateWorkspaceKpis(input);
  const actionable = input.items.filter((item) => item.status !== "cancelled");

  // Per-format counts, in the canonical order. Always returns 8 rows
  // (zero-filled) so the bar layout never collapses when a format is
  // empty.
  const formatBreakdown = CONTENT_FORMAT_ORDER.map((format) => ({
    format,
    label: CONTENT_FORMAT_LABELS[format],
    count: actionable.filter((item) => item.format === format).length,
  }));

  // Per-status counts for the Status Pipeline.
  const statusPipeline = CONTENT_STATUS_PIPELINE.map((status) => ({
    status,
    label: CONTENT_STATUS_PIPELINE_LABELS[status],
    count: actionable.filter((item) => item.status === status).length,
  }));

  // At-risk items for the At-Risk Milestones list. Capped at 5 so the
  // card stays compact.
  const atRiskItems = actionable
    .filter(
      (item) =>
        item.plannedPublishAt.getTime() < input.now.getTime() &&
        !(NOT_AT_RISK_STATUSES as readonly KpiContentStatus[]).includes(item.status),
    )
    .sort((a, b) => a.plannedPublishAt.getTime() - b.plannedPublishAt.getTime())
    .slice(0, 5);

  return {
    ...kpis,
    formatBreakdown,
    statusPipeline,
    atRiskItems,
  };
}

// ─── Dashboard-specific shape (ADR-0007) ────────────────────────────────

/**
 * The four semantic workflow stages the dashboard surfaces in its
 * pipeline. They map the 11-status enum down to the user-facing
 * 4-stage vocabulary used on the planning detail page
 * (`WorkflowMiniProgress`): Planning / Review / Design / Publish.
 *
 * Why four, not eleven: the 8-tile "Status Pipeline" was the single
 * loudest complaint in the audit (orphaned cards, hard to read as a
 * flow). The semantic stages match the planning list's row stepper,
 * so the user sees the same language on both surfaces.
 */
export const WORKFLOW_STAGES = ["planning", "review", "design", "publish"] as const;
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export const WORKFLOW_STAGE_LABELS: Record<WorkflowStage, string> = {
  planning: "Planning",
  review: "Review",
  design: "Design",
  publish: "Publish",
};

/**
 * Map a content status to its dashboard workflow stage. Mirrors the
 * `STAGE_ORDER` table in `workflow-mini-progress.tsx` so the row
 * stepper and the dashboard pipeline never disagree.
 */
export function stageForStatus(status: KpiContentStatus): WorkflowStage {
  // `cancelled` is intentionally shown in the planning stage so the
  // bar doesn't look empty on workspaces that have cancelled items
  // — operators want to see the "we cancelled this" record, not a
  // hidden bucket. The attention list filters it out separately.
  if (status === "cancelled") return "planning";
  // `changes_requested` sits in the review stage per the existing
  // stepper, not in the planning stage.
  if (status === "draft" || status === "changes_requested" || status === "content_review") {
    // `changes_requested` is the post-review return state; it
    // belongs with the review stage. `content_review` is in
    // review. `draft` is the only "planning" status.
    if (status === "draft") return "planning";
    return "review";
  }
  if (status === "approved_for_design" || status === "in_design") return "design";
  if (
    status === "creative_review" ||
    status === "ready_to_publish" ||
    status === "partially_published" ||
    status === "published"
  ) {
    return "publish";
  }
  // `blocked` is its own bucket; the dashboard surfaces it
  // separately as a stacked-bar segment.
  return "planning";
}

/**
 * The risk-reason taxonomy used by the "Why items are at risk"
 * breakdown. The dashboard rolls every at-risk item into one of
 * these four buckets so the operator can see *why* the count is
 * high without scrolling the attention list.
 *
 *   past_due  — the item's plannedPublishAt is in the past
 *   awaiting_review — sits in a review state, blocking progress
 *   design_in_progress — sits in design and is not yet ready
 *   needs_creative — sits in creative_review
 *
 * The reasons are EXCLUSIVE — one item gets exactly one bucket, the
 * first that matches. This is intentional: the dashboard's purpose
 * is a single-glance summary, not a multi-dimensional breakdown.
 */
export const RISK_REASONS = [
  "past_due",
  "awaiting_review",
  "design_in_progress",
  "needs_creative",
  "other",
] as const;
export type RiskReason = (typeof RISK_REASONS)[number];

export const RISK_REASON_LABELS: Record<RiskReason, string> = {
  past_due: "Past planned date",
  awaiting_review: "Awaiting review",
  design_in_progress: "In design",
  needs_creative: "Awaiting creative",
  other: "Other",
};

export function riskReasonFor(input: {
  status: KpiContentStatus;
  plannedPublishAt: Date;
  now: Date;
}): RiskReason {
  const pastDue = input.plannedPublishAt.getTime() < input.now.getTime();
  if (input.status === "content_review" || input.status === "changes_requested") {
    return "awaiting_review";
  }
  if (input.status === "creative_review") return "needs_creative";
  if (input.status === "in_design" || input.status === "approved_for_design") {
    return "design_in_progress";
  }
  if (pastDue) return "past_due";
  return "other";
}

/**
 * Item shape required by the dashboard's "Needs attention" list. The
 * page supplies `id`, `title`, `status`, `format`, `ownerId`,
 * `designerId` so the row can show format + status + owner chip and
 * link to the detail page.
 */
export interface DashboardItem {
  id: string;
  title: string;
  status: KpiContentStatus;
  format: KpiContentFormat;
  plannedPublishAt: Date;
  /**
   * When the row was last touched (any update path: status,
   * brief, channel, delivery upload, etc.). Drives the
   * "Recently updated" panel's actual ordering. Without this
   * the panel was sorted by `plannedPublishAt` and the
   * "Recently updated" name was a lie — items with a future
   * publish date floated to the top regardless of how stale
   * they were. Master prompt §16 calls this out as the
   * "operational surface" the planner needs.
   */
  updatedAt: Date;
  ownerId: string | null;
  ownerName: string | null;
}

export interface RiskReasonCount {
  reason: RiskReason;
  label: string;
  count: number;
}

export interface WorkflowStageCount {
  stage: WorkflowStage;
  label: string;
  count: number;
}

export interface NeedsAttentionItem {
  id: string;
  title: string;
  status: KpiContentStatus;
  format: KpiContentFormat;
  plannedPublishAt: Date;
  daysOverdue: number;
  ownerName: string | null;
  reason: RiskReason;
}

export interface RecentlyUpdatedItem {
  id: string;
  title: string;
  status: KpiContentStatus;
  format: KpiContentFormat;
  /**
   * When the row was last touched. The panel sorts by this
   * DESC and renders the relative time as the row's primary
   * date signal (`formatRelativeDate(updatedAt)`).
   * `plannedPublishAt` stays on the type for the
   * "View all activity" deep link + future cross-filters.
   */
  updatedAt: Date;
  plannedPublishAt: Date;
  ownerName: string | null;
}

export interface OverviewDashboardMetrics {
  /** Same anchor the planning list uses; included so the caller
   *  doesn't have to thread a separate clock through. */
  now: Date;

  /**
   * Where the viewed month sits relative to `now`. Consumers use it to pick
   * honest wording — "Missed" for a closed month, "At risk" for the live one,
   * and to suppress the health percentage entirely for a month that has not
   * started (where 100% on-track would be a vacuous claim, not a measurement).
   */
  monthPhase: MonthPhase;

  /** Counts that drive the executive summary strip. */
  total: number;
  notStarted: number;
  onTrack: number;
  atRisk: number;
  blocked: number;
  needsReview: number;
  ready: number;
  published: number;

  /** Plan-coverage math. `null` when no monthly target is set. */
  monthlyTarget: number | null;
  coveragePercent: number | null;

  /**
   * The single "delivery health" headline number. Semantically:
   * "what percentage of this month's planned content has been
   * cleared for publication (ready, partially published, or
   * fully published)?"
   *
   * Note: this is the same math as the pre-refactor
   * `deliveryHealthPercent` (i.e. 1/27 → 4%), but the dashboard
   * does NOT call it "at risk". It calls it "% complete" or
   * "shipped", and the at-risk count is shown as a separate
   * number from a stacked bar — so the 4% and the 23 at-risk
   * no longer fight for the same headline.
   */
  completionPercent: number;

  /**
   * The stacked-health-bar segments. They sum to `total` (every
   * actionable item is in exactly one bucket: on-track, at-risk,
   * blocked, or not-started). The dashboard renders them as a
   * horizontal bar with a legend underneath.
   */
  onTrackPercent: number;
  atRiskPercent: number;
  blockedPercent: number;
  /**
   * Share of the month still sitting in `draft`.
   *
   * A fourth stacked-bar segment, added with ADR-0006 parity in mind: drafts
   * are excluded from `atRiskPercent`, so without a visible home they would
   * otherwise read as "on track". The four percentages sum to 100 (or 0 for an
   * empty month).
   */
  notStartedPercent: number;

  /** Workflow-stage distribution (4 stages, not 11 statuses). */
  workflowStages: WorkflowStageCount[];

  /** Risk-reason breakdown for the "Why at risk" card. */
  riskReasonCounts: RiskReasonCount[];

  /** Per-format distribution (8 formats, zero-filled). */
  formatBreakdown: { format: KpiContentFormat; label: string; count: number }[];

  /** Up to 5 at-risk items sorted by severity (overdue first). */
  needsAttention: NeedsAttentionItem[];

  /** Up to 6 most-recently-updated items. */
  recentlyUpdated: RecentlyUpdatedItem[];
}

const MAX_NEEDS_ATTENTION = 5;
const MAX_RECENTLY_UPDATED = 6;

/**
 * Where the viewed month sits relative to the real clock.
 *
 * The Overview anchors every metric to `?month=YYYY-MM`, but "at risk" has
 * historically been computed against `now` alone (`plannedPublishAt < now`).
 * That makes the same number mean three different things:
 *
 *   future — the month has not started, so nothing can be late yet and the
 *            health bar reads a vacuous "100% on track".
 *   current — the only case where "at risk" is genuinely actionable.
 *   past   — every unpublished item is past-due, so "at risk" spikes toward
 *            100% for items nobody can act on any more. The arithmetic is
 *            correct; the *implication* ("fix this") is wrong.
 *
 * The counts themselves stay calendar-agnostic and correct — for a month in
 * the past every item already satisfies `plannedPublishAt < now`, so changing
 * the anchor would be a no-op. What has to change is the WORDING, and that is
 * what this phase drives. Callers pick labels from it; `kpis.ts` stays pure.
 *
 * `monthEnd` is EXCLUSIVE (it is the first instant of the following month),
 * which is why a month counts as past on `monthEnd <= now` rather than `<`.
 */
export type MonthPhase = "past" | "current" | "future";

export function monthPhaseFor(input: { monthStart: Date; monthEnd: Date; now: Date }): MonthPhase {
  if (input.monthStart.getTime() > input.now.getTime()) return "future";
  if (input.monthEnd.getTime() <= input.now.getTime()) return "past";
  return "current";
}

export function calculateOverviewDashboardMetrics(input: {
  now: Date;
  monthlyTarget: number | null;
  items: DashboardItem[];
  /**
   * Defaults to `"current"` so existing callers (and the planning list, which
   * shares this function) keep today's behaviour unchanged.
   */
  monthPhase?: MonthPhase;
}): OverviewDashboardMetrics {
  const actionable = input.items.filter((it) => it.status !== "cancelled");
  const total = actionable.length;

  const isPublishedish = (s: KpiContentStatus) =>
    (COMPLETED_STATUSES as readonly KpiContentStatus[]).includes(s);
  const isNotAtRisk = (s: KpiContentStatus) =>
    (NOT_AT_RISK_STATUSES as readonly KpiContentStatus[]).includes(s);

  const blocked = actionable.filter((it) => it.status === "blocked").length;
  const notStarted = actionable.filter((it) => it.status === "draft").length;
  const atRisk = actionable.filter(
    (it) => it.plannedPublishAt.getTime() < input.now.getTime() && !isNotAtRisk(it.status),
  ).length;
  // Four mutually-exclusive buckets that must sum to `total`: on-track,
  // at-risk, blocked and not-started. `notStarted` has to be subtracted
  // explicitly — excluding drafts from `atRisk` (ADR-0006) without doing so
  // would quietly relabel every slipped draft as "on track", which trades one
  // false reading for another instead of removing the falsehood.
  const onTrack = Math.max(0, total - atRisk - blocked - notStarted);
  const needsReview = actionable.filter((it) =>
    (
      ["content_review", "creative_review", "changes_requested"] as readonly KpiContentStatus[]
    ).includes(it.status),
  ).length;
  const ready = actionable.filter(
    (it) => it.status === "ready_to_publish" || it.status === "partially_published",
  ).length;
  const published = actionable.filter((it) => it.status === "published").length;
  const completed = actionable.filter((it) => isPublishedish(it.status)).length;

  const coveragePercent = input.monthlyTarget
    ? Math.min(100, Math.round((total / input.monthlyTarget) * 100))
    : null;
  const completionPercent = total ? Math.round((completed / total) * 100) : 0;
  const onTrackPercent = total ? Math.round((onTrack / total) * 100) : 0;
  const atRiskPercent = total ? Math.round((atRisk / total) * 100) : 0;
  const blockedPercent = total ? Math.round((blocked / total) * 100) : 0;
  const notStartedPercent = total ? Math.round((notStarted / total) * 100) : 0;

  const workflowStages: WorkflowStageCount[] = WORKFLOW_STAGES.map((stage) => ({
    stage,
    label: WORKFLOW_STAGE_LABELS[stage],
    count: actionable.filter((it) => stageForStatus(it.status) === stage).length,
  }));

  const reasonBuckets = new Map<RiskReason, number>();
  for (const r of RISK_REASONS) reasonBuckets.set(r, 0);
  for (const it of actionable.filter(
    (it) => it.plannedPublishAt.getTime() < input.now.getTime() && !isNotAtRisk(it.status),
  )) {
    const reason = riskReasonFor({
      status: it.status,
      plannedPublishAt: it.plannedPublishAt,
      now: input.now,
    });
    reasonBuckets.set(reason, (reasonBuckets.get(reason) ?? 0) + 1);
  }
  const riskReasonCounts: RiskReasonCount[] = RISK_REASONS.map((reason) => ({
    reason,
    label: RISK_REASON_LABELS[reason],
    count: reasonBuckets.get(reason) ?? 0,
  })).filter((r) => r.count > 0);

  const formatBreakdown = CONTENT_FORMAT_ORDER.map((format) => ({
    format,
    label: CONTENT_FORMAT_LABELS[format],
    count: actionable.filter((it) => it.format === format).length,
  }));

  const daysOverdue = (plannedPublishAt: Date): number => {
    const ms = input.now.getTime() - plannedPublishAt.getTime();
    if (ms <= 0) return 0;
    return Math.floor(ms / 86_400_000);
  };

  // Needs-attention sort: blocked first, then by days-overdue
  // descending, then by date ascending. This matches the
  // "severity ordering" the master prompt asks for.
  //
  // The "needs attention" list is BROADER than the at-risk count:
  // it includes both at-risk items AND blocked items (which are
  // excluded from `atRisk` because the stacked-bar surfaces them
  // as their own segment, but the operator still wants to see
  // them on the attention list).
  const needsAttention: NeedsAttentionItem[] = actionable
    .filter(
      (it) =>
        it.status === "blocked" ||
        (it.plannedPublishAt.getTime() < input.now.getTime() && !isNotAtRisk(it.status)),
    )
    .map((it) => ({
      id: it.id,
      title: it.title,
      status: it.status,
      format: it.format,
      plannedPublishAt: it.plannedPublishAt,
      daysOverdue: daysOverdue(it.plannedPublishAt),
      ownerName: it.ownerName,
      reason: riskReasonFor({
        status: it.status,
        plannedPublishAt: it.plannedPublishAt,
        now: input.now,
      }),
    }))
    .sort((a, b) => {
      // 1. blocked items first
      const aBlocked = a.status === "blocked" ? 1 : 0;
      const bBlocked = b.status === "blocked" ? 1 : 0;
      if (aBlocked !== bBlocked) return bBlocked - aBlocked;
      // 2. more overdue first
      if (a.daysOverdue !== b.daysOverdue) return b.daysOverdue - a.daysOverdue;
      // 3. older date first
      return a.plannedPublishAt.getTime() - b.plannedPublishAt.getTime();
    })
    .slice(0, MAX_NEEDS_ATTENTION);

  const recentlyUpdated: RecentlyUpdatedItem[] = [...actionable]
    // Sort by `updatedAt` (when the row was last touched),
    // NOT `plannedPublishAt` (which is the user's intent, not
    // the system's signal of "this just changed"). The old
    // sort made "Recently updated" float items with a future
    // publish date to the top regardless of how stale they
    // were. Master prompt §16 / /ui-ux-pro-max P3.1.
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, MAX_RECENTLY_UPDATED)
    .map((it) => ({
      id: it.id,
      title: it.title,
      status: it.status,
      format: it.format,
      updatedAt: it.updatedAt,
      plannedPublishAt: it.plannedPublishAt,
      ownerName: it.ownerName,
    }));

  return {
    now: input.now,
    monthPhase: input.monthPhase ?? "current",
    total,
    notStarted,
    onTrack,
    atRisk,
    blocked,
    needsReview,
    ready,
    published,
    monthlyTarget: input.monthlyTarget,
    coveragePercent,
    completionPercent,
    onTrackPercent,
    atRiskPercent,
    blockedPercent,
    notStartedPercent,
    workflowStages,
    riskReasonCounts,
    formatBreakdown,
    needsAttention,
    recentlyUpdated,
  };
}
