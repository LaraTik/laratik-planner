import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ALL_STATUSES, humanStatus } from "@/lib/content/status";

/**
 * PlanningFilters — status + density + apply/clear controls for the
 * Monthly Planning list. Server-rendered: the page already knows the
 * current `selectedStatus`, `density`, and `hasFilter` from the URL
 * search params, so this is a pure form that posts back to itself.
 *
 * Centralises the select + button styling so the planning page (and
 * any future filter surface) can use the same UX without re-deriving
 * the option list.
 */
export interface PlanningFiltersProps {
  slug: string;
  /** ISO `YYYY-MM` for the current month — preserved across submits. */
  monthParam: string;
  /** Currently active status filter, or undefined for "All". */
  selectedStatus?: string | undefined;
  /** Currently active list density. */
  density: "comfortable" | "compact";
  /** Whether any filter is active (controls whether Clear shows). */
  hasFilter: boolean;
}

const DENSITY_OPTIONS: { value: "comfortable" | "compact"; label: string }[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

export function PlanningFilters({
  slug,
  monthParam,
  selectedStatus,
  density,
  hasFilter,
}: PlanningFiltersProps) {
  return (
    <form className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="month" value={monthParam} />
      <select
        name="status"
        aria-label="Filter by status"
        defaultValue={selectedStatus ?? ""}
        className="border-border bg-surface text-body h-10 rounded-[var(--radius-control)] border px-3"
      >
        <option value="">All statuses</option>
        {ALL_STATUSES.map((status) => (
          <option key={status} value={status}>
            {humanStatus(status)}
          </option>
        ))}
      </select>
      <select
        name="density"
        aria-label="List density"
        defaultValue={density}
        className="border-border bg-surface text-body h-10 rounded-[var(--radius-control)] border px-3"
      >
        {DENSITY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <Button variant="outline" type="submit">
        Apply
      </Button>
      {hasFilter ? (
        <Button variant="ghost" asChild>
          <Link href={`/app/w/${slug}/planning?month=${monthParam}`}>Clear</Link>
        </Button>
      ) : null}
    </form>
  );
}
