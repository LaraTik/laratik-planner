import Link from "next/link";

/**
 * ReviewsFilters — gate + sort controls for the Reviews queue. Mirrors
 * the PlanningFilters pattern (server-rendered form posting back to the
 * same route) but scoped to the two affordances the queue actually has:
 * which gate to show, and how to order the list.
 *
 * Both selects honour the focus-ring token used elsewhere on the app,
 * and ship with a visible "Clear" link so users have a one-click escape
 * if a filter combination produces no results.
 */
export interface ReviewsFiltersProps {
  slug: string;
  /** Available gates, derived from the user's workspace roles. */
  gates: ReadonlyArray<"content" | "creative_internal" | "creative_client">;
  /** Currently active gate filter, or undefined for "All". */
  selectedGate?: string | undefined;
  /** Currently active sort key. Defaults to "requested_desc". */
  selectedSort: "requested_desc" | "due_asc" | "due_desc";
  /** Whether any filter is active (controls whether Clear shows). */
  hasFilter: boolean;
  /**
   * Bound translator from the parent. Resolves the toolbar
   * aria-label, the two select aria-labels, the "All gates"
   * placeholder option, the three sort option labels, the
   * Apply / Clear buttons, and the per-gate label table.
   */
  t: (key: string, params?: Record<string, string | number>) => string;
}

const SORT_VALUES: ReadonlyArray<ReviewsFiltersProps["selectedSort"]> = [
  "requested_desc",
  "due_asc",
  "due_desc",
];

function sortKey(value: ReviewsFiltersProps["selectedSort"]): string {
  switch (value) {
    case "requested_desc":
      return "reviews.sortNewest";
    case "due_asc":
      return "reviews.sortDueSoonest";
    case "due_desc":
      return "reviews.sortDueLatest";
  }
}

function gateKey(value: "content" | "creative_internal" | "creative_client"): string {
  switch (value) {
    case "content":
      return "reviews.gateContent";
    case "creative_internal":
      return "reviews.gateCreativeInternal";
    case "creative_client":
      return "reviews.gateCreativeClient";
  }
}

const controlClass =
  "border-border bg-surface text-body h-10 rounded-[var(--radius-control)] border px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1";

const applyClass =
  "border-border bg-primary text-label text-white hover:bg-primary-hover focus-visible:ring-focus-ring h-10 rounded-[var(--radius-control)] border px-3 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1";

const clearClass =
  "text-label text-fg-secondary hover:text-fg-primary focus-visible:ring-focus-ring h-10 rounded-[var(--radius-control)] px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1";

export function ReviewsFilters({
  slug,
  gates,
  selectedGate,
  selectedSort,
  hasFilter,
  t,
}: ReviewsFiltersProps) {
  return (
    <form
      action={`/app/w/${slug}/reviews`}
      method="get"
      className="flex flex-wrap items-center gap-2"
      aria-label={t("reviews.filtersAria")}
    >
      <select
        name="gate"
        aria-label={t("reviews.gateAria")}
        defaultValue={selectedGate ?? ""}
        className={controlClass}
        data-testid="reviews-gate-filter"
      >
        <option value="">{t("reviews.allGates")}</option>
        {gates.map((g) => (
          <option key={g} value={g}>
            {t(gateKey(g))}
          </option>
        ))}
      </select>
      <select
        name="sort"
        aria-label={t("reviews.sortAria")}
        defaultValue={selectedSort}
        className={controlClass}
        data-testid="reviews-sort"
      >
        {SORT_VALUES.map((value) => (
          <option key={value} value={value}>
            {t(sortKey(value))}
          </option>
        ))}
      </select>
      <button type="submit" className={applyClass}>
        {t("reviews.apply")}
      </button>
      {hasFilter ? (
        <Link href={`/app/w/${slug}/reviews`} className={clearClass}>
          {t("reviews.clear")}
        </Link>
      ) : null}
    </form>
  );
}
