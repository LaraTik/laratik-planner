import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ALL_FORMATS, ALL_STATUSES, humanFormat, humanStatus } from "@/lib/content/status";

/**
 * PlanningFilters — status + format + owner + search + density + apply/clear
 * controls for the Monthly Planning list. Server-rendered: the page already
 * knows the current filter values from the URL search params, so this is a
 * pure form that posts back to itself.
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
  /** Currently active format filter, or undefined for "All". */
  selectedFormat?: string | undefined;
  /** Currently active owner filter, or undefined for "All". */
  selectedOwnerId?: string | undefined;
  /** Current search term, or undefined for "no search". */
  searchValue?: string | undefined;
  /** Currently active list density. */
  density: "comfortable" | "compact";
  /** Whether any filter is active (controls whether Clear shows). */
  hasFilter: boolean;
  /**
   * Workspace members for the owner dropdown. Built by the page so
   * the dropdown never queries the DB itself.
   */
  members: { id: string; label: string }[];
}

const DENSITY_OPTIONS: { value: "comfortable" | "compact"; label: string }[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

const controlClass =
  "border-border bg-surface text-body h-10 rounded-[var(--radius-control)] border px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1";

export function PlanningFilters({
  slug,
  monthParam,
  selectedStatus,
  selectedFormat,
  selectedOwnerId,
  searchValue,
  density,
  hasFilter,
  members,
}: PlanningFiltersProps) {
  return (
    <form className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="month" value={monthParam} />
      <div className="relative">
        <Search
          className="text-fg-muted pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2"
          aria-hidden="true"
        />
        <input
          type="search"
          name="search"
          aria-label="Search by title or brief"
          defaultValue={searchValue ?? ""}
          placeholder="Search title or brief"
          maxLength={80}
          className={`${controlClass} w-44 pl-7`}
          data-testid="planning-search-input"
        />
      </div>
      <select
        name="status"
        aria-label="Filter by status"
        defaultValue={selectedStatus ?? ""}
        className={controlClass}
        data-testid="planning-status-filter"
      >
        <option value="">All statuses</option>
        {ALL_STATUSES.map((status) => (
          <option key={status} value={status}>
            {humanStatus(status)}
          </option>
        ))}
      </select>
      <select
        name="format"
        aria-label="Filter by format"
        defaultValue={selectedFormat ?? ""}
        className={controlClass}
        data-testid="planning-format-filter"
      >
        <option value="">All formats</option>
        {ALL_FORMATS.map((format) => (
          <option key={format} value={format}>
            {humanFormat(format)}
          </option>
        ))}
      </select>
      <select
        name="owner"
        aria-label="Filter by owner"
        defaultValue={selectedOwnerId ?? ""}
        className={controlClass}
        data-testid="planning-owner-filter"
      >
        <option value="">All owners</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <select
        name="density"
        aria-label="List density"
        defaultValue={density}
        className={controlClass}
        data-testid="planning-density-filter"
      >
        {DENSITY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <Button variant="outline" type="submit" data-testid="planning-apply-filters">
        Apply
      </Button>
      {hasFilter ? (
        <Button variant="ghost" asChild>
          <Link
            href={`/app/w/${slug}/planning?month=${monthParam}`}
            data-testid="planning-clear-filters"
          >
            Clear
          </Link>
        </Button>
      ) : null}
    </form>
  );
}
