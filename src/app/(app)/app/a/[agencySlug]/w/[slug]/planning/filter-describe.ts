import { humanFormat, humanStatus } from "@/lib/content/status";

type FilterDescriptionTranslator = (
  key: string,
  params?: Record<string, string | number>,
) => string;

function localized(
  t: FilterDescriptionTranslator | undefined,
  key: string,
  fallback: string,
  params?: Record<string, string | number>,
): string {
  if (!t) return fallback;
  const value = t(key, params);
  return value.startsWith(`[${key}]`) ? fallback : value;
}

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
export function describeActiveFilter(
  filters: {
    status?: string;
    format?: string;
    stage?: string;
    channelId?: string;
    ownerId?: string;
    search?: string;
    health?: string;
    risk?: string;
  },
  t?: FilterDescriptionTranslator,
): string {
  const clauses: string[] = [];
  if (filters.status) {
    const fallbackValue = humanStatus(filters.status);
    const value = localized(t, `planningFilters.statusLabels.${filters.status}`, fallbackValue);
    clauses.push(
      localized(t, "planningFilters.filterStatus", `status "${fallbackValue}"`, { value }),
    );
  }
  if (filters.format) {
    const fallbackValue = humanFormat(filters.format);
    const value = localized(t, `planningFilters.formatLabels.${filters.format}`, fallbackValue);
    clauses.push(
      localized(t, "planningFilters.filterFormat", `format "${fallbackValue}"`, { value }),
    );
  }
  if (filters.stage) {
    const fallbackValue = humanStatus(filters.stage);
    const value = localized(t, `planningFilters.stageLabels.${filters.stage}`, fallbackValue);
    clauses.push(
      localized(t, "planningFilters.filterStage", `stage "${fallbackValue}"`, { value }),
    );
  }
  if (filters.channelId) {
    clauses.push(localized(t, "planningFilters.filterChannel", "the selected channel"));
  }
  if (filters.ownerId) {
    clauses.push(localized(t, "planningFilters.filterOwner", "the selected owner"));
  }
  if (filters.search) {
    clauses.push(
      localized(t, "planningFilters.filterSearch", `search "${filters.search}"`, {
        value: filters.search,
      }),
    );
  }
  if (filters.health) {
    const fallbackValue = humanStatus(filters.health);
    const value = localized(t, `planningFilters.healthLabels.${filters.health}`, fallbackValue);
    clauses.push(
      localized(t, "planningFilters.filterHealth", `health "${fallbackValue}"`, { value }),
    );
  }
  if (filters.risk === "at_risk") {
    clauses.push(localized(t, "planningFilters.filterRisk", '"at risk"'));
  }
  if (clauses.length === 0) {
    return localized(t, "planningFilters.filterFallback", "the active filter");
  }
  if (clauses.length === 1) return clauses[0]!;
  const conjunction = localized(t, "planningFilters.filterAnd", "and");
  if (clauses.length === 2) return `${clauses[0]} ${conjunction} ${clauses[1]}`;
  const listSeparator = localized(t, "planningFilters.filterListSeparator", ", ");
  const finalSeparator = localized(t, "planningFilters.filterFinalSeparator", ", and ");
  return `${clauses.slice(0, -1).join(listSeparator)}${finalSeparator}${clauses[clauses.length - 1]}`;
}
