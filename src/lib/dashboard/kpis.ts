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
      !["ready_to_publish", "partially_published", "published"].includes(item.status),
  ).length;
  const coveragePercent = input.monthlyTarget
    ? Math.min(100, Math.round((totalIdeas / input.monthlyTarget) * 100))
    : null;
  const completed = actionable.filter((item) =>
    ["ready_to_publish", "partially_published", "published"].includes(item.status),
  ).length;
  const deliveryHealthPercent = totalIdeas ? Math.round((completed / totalIdeas) * 100) : 100;

  return {
    totalIdeas,
    readyToPublish,
    published,
    atRisk,
    coveragePercent,
    deliveryHealthPercent,
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
        !["ready_to_publish", "partially_published", "published"].includes(item.status),
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
