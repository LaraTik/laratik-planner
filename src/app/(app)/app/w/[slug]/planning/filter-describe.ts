import { humanFormat, humanStatus } from "@/lib/content/status";

/**
 * Build the human-readable phrase that names which filter is active.
 *
 * Used by the filter-aware empty state (UX-04, GAP-FULL-REVIEW-2026-08-25)
 * so the user knows which filter is suppressing the result, not just
 * that "some filter" is. The list of clauses is joined with " and " so
 * a status+owner combo reads naturally:
 *
 *   describeActiveFilter({ status: "draft" })
 *     // -> 'status "Draft"'
 *   describeActiveFilter({ status: "draft", search: "spring" })
 *     // -> 'status "Draft" and search "spring"'
 *   describeActiveFilter({ status: "draft", format: "carousel", ownerId: "u-1" })
 *     // -> 'status "Draft", format "Carousel", and the selected owner'
 *
 * The helper falls back to "the active filter" when called with no
 * recognised values, so a defensive caller never ships a sentence like
 * "No items match ." in the UI.
 */
export function describeActiveFilter(filters: {
  status?: string;
  format?: string;
  stage?: string;
  channelId?: string;
  ownerId?: string;
  search?: string;
  health?: string;
  risk?: string;
}): string {
  const clauses: string[] = [];
  if (filters.status) clauses.push(`status "${humanStatus(filters.status)}"`);
  if (filters.format) clauses.push(`format "${humanFormat(filters.format)}"`);
  if (filters.stage) clauses.push(`stage "${humanStatus(filters.stage)}"`);
  if (filters.channelId) clauses.push("the selected channel");
  if (filters.ownerId) clauses.push("the selected owner");
  if (filters.search) clauses.push(`search "${filters.search}"`);
  if (filters.health) clauses.push(`health "${humanStatus(filters.health)}"`);
  if (filters.risk === "at_risk") clauses.push('"at risk"');
  if (clauses.length === 0) return "the active filter";
  if (clauses.length === 1) return clauses[0]!;
  if (clauses.length === 2) return `${clauses[0]} and ${clauses[1]}`;
  return `${clauses.slice(0, -1).join(", ")}, and ${clauses[clauses.length - 1]}`;
}
