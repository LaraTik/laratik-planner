import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ALL_FORMATS, ALL_STATUSES, humanFormat, humanStatus } from "@/lib/content/status";

/**
 * PlanningFilters — status + format + owner + search + apply/clear
 * controls for the Planning list and the Workflow Board.
 *
 * Server-rendered: the page already knows the current filter values
 * from the URL search params, so this is a pure form that posts
 * back to the same path (`targetPath`). Centralises the select +
 * button styling so the planning list and the board can use the
 * exact same UX without re-deriving the option list, and so
 * `targetPath` is the only thing that differs between the two
 * surfaces.
 *
 * Multi-surface contract:
 *  - The List view (the planning list) shows a row-density selector.
 *  - The Board view does not — board density is fixed by the
 *    column geometry, not a user preference. `showDensity`
 *    controls whether the row renders.
 *  - Switching between the two views preserves every other filter
 *    (status, format, owner, search) by re-serialising the active
 *    filters in the `targetPath` querystring. The parent's view
 *    switcher is responsible for passing the right `targetPath`
 *    so the user lands on the right view with the right state.
 */
export interface PlanningFiltersProps {
  /**
   * Base path the form submits to AND the Clear button links to.
   * Defaults to `/app/w/{slug}/planning` (the list) when not set.
   */
  targetPath?: string;
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
  /**
   * Optional translator. When provided, the 4 filter aria-labels +
   * the search placeholder render from `planningFilters.*`; when
   * omitted, the hard-coded English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
  /** Currently active list density. Required when `showDensity` is true. */
  density?: "comfortable" | "compact";
  /** Whether to render the density selector. List view: true. Board view: false. */
  showDensity?: boolean;
  /** Whether any filter is active (controls whether Clear shows). */
  hasFilter: boolean;
  /**
   * Workspace members for the owner dropdown. Built by the page so
   * the dropdown never queries the DB itself.
   */
  members: { id: string; label: string }[];
  /** Test id prefix; defaults to "planning". Board surfaces can override. */
  testIdPrefix?: string;
}

const DENSITY_OPTIONS: { value: "comfortable" | "compact"; label: string }[] = [
  { value: "comfortable", label: "Comfortable" },
  { value: "compact", label: "Compact" },
];

const controlClass =
  "border-border bg-surface text-body h-10 rounded-[var(--radius-control)] border px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-1";

export function PlanningFilters({
  targetPath,
  monthParam,
  selectedStatus,
  selectedFormat,
  selectedOwnerId,
  searchValue,
  density,
  showDensity = true,
  hasFilter,
  members,
  testIdPrefix = "planning",
  t,
}: PlanningFiltersProps) {
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);
  // The form's `action` is the same path it lives on — both the
  // list and the board pages render this form on themselves. The
  // form has no `action` attribute, which makes the browser fall
  // back to the page's own URL, so a user who submits the form on
  // the board stays on the board (with the new filters applied).
  // This is the same submit-back-to-self pattern the previous
  // version used — we just expose `targetPath` so the Clear
  // button can link to a known URL on the same surface.
  return (
    <form
      method="get"
      action={targetPath}
      className="flex flex-wrap items-center gap-2"
      data-testid={`${testIdPrefix}-filters-form`}
    >
      <input type="hidden" name="month" value={monthParam} />
      <div className="relative">
        <Search
          className="text-fg-muted pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
          aria-hidden="true"
        />
        <input
          type="search"
          name="search"
          aria-label={tr("planningFilters.searchAria", "Search by title or brief")}
          defaultValue={searchValue ?? ""}
          placeholder={tr("planningFilters.searchPlaceholder", "Search title or brief")}
          maxLength={80}
          className={`${controlClass} w-44 ps-7`}
          data-testid={`${testIdPrefix}-search-input`}
        />
      </div>
      <select
        name="status"
        aria-label={tr("planningFilters.statusAria", "Filter by status")}
        defaultValue={selectedStatus ?? ""}
        className={controlClass}
        data-testid={`${testIdPrefix}-status-filter`}
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
        aria-label={tr("planningFilters.formatAria", "Filter by format")}
        defaultValue={selectedFormat ?? ""}
        className={controlClass}
        data-testid={`${testIdPrefix}-format-filter`}
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
        aria-label={tr("planningFilters.ownerAria", "Filter by owner")}
        defaultValue={selectedOwnerId ?? ""}
        className={controlClass}
        data-testid={`${testIdPrefix}-owner-filter`}
      >
        <option value="">All owners</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      {showDensity && density ? (
        <select
          name="density"
          aria-label={tr("planningFilters.densityAria", "List density")}
          defaultValue={density}
          className={controlClass}
          data-testid={`${testIdPrefix}-density-filter`}
        >
          {DENSITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : null}
      <Button variant="outline" type="submit" data-testid={`${testIdPrefix}-apply-filters`}>
        Apply
      </Button>
      {hasFilter && targetPath ? (
        <Button variant="ghost" asChild>
          <Link
            href={`${targetPath}?month=${monthParam}`}
            data-testid={`${testIdPrefix}-clear-filters`}
          >
            Clear
          </Link>
        </Button>
      ) : null}
    </form>
  );
}
