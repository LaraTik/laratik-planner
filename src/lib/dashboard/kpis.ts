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
  };
}
