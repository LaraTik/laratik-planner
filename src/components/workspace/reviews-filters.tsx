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
}

const SORT_OPTIONS: { value: ReviewsFiltersProps["selectedSort"]; label: string }[] = [
  { value: "requested_desc", label: "Newest first" },
  { value: "due_asc", label: "Due soonest" },
  { value: "due_desc", label: "Due latest" },
];

const GATE_LABEL: Record<"content" | "creative_internal" | "creative_client", string> = {
  content: "Content review",
  creative_internal: "Creative (internal)",
  creative_client: "Creative (client)",
};

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
}: ReviewsFiltersProps) {
  return (
    <form
      action={`/app/w/${slug}/reviews`}
      method="get"
      className="flex flex-wrap items-center gap-2"
      aria-label="Filter and sort reviews"
    >
      <select
        name="gate"
        aria-label="Filter by review gate"
        defaultValue={selectedGate ?? ""}
        className={controlClass}
        data-testid="reviews-gate-filter"
      >
        <option value="">All gates</option>
        {gates.map((g) => (
          <option key={g} value={g}>
            {GATE_LABEL[g] ?? g}
          </option>
        ))}
      </select>
      <select
        name="sort"
        aria-label="Sort reviews"
        defaultValue={selectedSort}
        className={controlClass}
        data-testid="reviews-sort"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button type="submit" className={applyClass}>
        Apply
      </button>
      {hasFilter ? (
        <Link href={`/app/w/${slug}/reviews`} className={clearClass}>
          Clear
        </Link>
      ) : null}
    </form>
  );
}
