import Link from "next/link";
import { ChevronFirst, ChevronLast } from "lucide-react";
import { DirAwareChevronLeft, DirAwareChevronRight } from "@/components/ui/dir-aware-icon";
import { cn } from "@/lib/utils";

/**
 * Pagination — page-based navigation for any paginated list. The
 * rendered output is a set of `<Link>` elements so deep-linking a
 * page (e.g. /app/w/foo/planning?page=3) and the browser back/forward
 * buttons both work without a client-side router.
 *
 * The component is purely presentational — the parent owns the
 * page-size, total, and current-page state and decides which params
 * to put on each link (e.g. preserves filter state). It does NOT
 * load the next page on its own; it just renders the controls.
 *
 * Visible windowing: we always render the first and last page plus
 * a sliding window of ±2 around the current page. Pages outside the
 * window render as an ellipsis so the control stays compact on
 * large result sets (e.g. 100+ pages).
 */
export interface PaginationProps {
  /** Current 1-indexed page. */
  currentPage: number;
  /** Total number of pages (>= 1). */
  totalPages: number;
  /**
   * Optional translator. When provided, the nav + page-link
   * aria-labels + the prev/next text labels render from
   * `common.{paginationAria,firstPage,previousPage,pageX,nextPage,lastPage}`;
   * when omitted, the hard-coded English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
  /**
   * Href builder. Called with a 1-indexed page number; the parent
   * is responsible for preserving filter / sort / search state in
   * the returned URL.
   */
  buildHref: (page: number) => string;
  /**
   * Total result count for the "Showing X–Y of Z" line. Optional —
   * if the parent doesn't have a count, the line is omitted.
   */
  totalCount?: number;
  /**
   * Page-size used to compute the "X–Y" range. Required when
   * `totalCount` is set.
   */
  pageSize?: number;
  /** Optional CSS class on the outer nav. */
  className?: string;
}

function pageHrefs(currentPage: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 1) return [];
  const result: (number | "ellipsis")[] = [];
  // Always show first page
  result.push(1);
  // Window: ±2 around the current page
  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd = Math.min(totalPages - 1, currentPage + 1);
  if (windowStart > 2) result.push("ellipsis");
  for (let p = windowStart; p <= windowEnd; p++) result.push(p);
  if (windowEnd < totalPages - 1) result.push("ellipsis");
  // Always show last page
  if (totalPages > 1) result.push(totalPages);
  return result;
}

function rangeForPage(page: number, pageSize: number, total: number): { from: number; to: number } {
  if (total === 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return { from, to };
}

export function Pagination({
  currentPage,
  totalPages,
  buildHref,
  totalCount,
  pageSize,
  className,
  t,
}: PaginationProps) {
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) => {
    const value = t ? t(key, params) : fallback;
    if (!params) return value;
    return Object.entries(params).reduce(
      (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
      value,
    );
  };
  if (totalPages <= 1 && totalCount === undefined) return null;
  const safePage = Math.min(Math.max(currentPage, 1), Math.max(totalPages, 1));
  const pages = pageHrefs(safePage, totalPages);
  const hasPrev = safePage > 1;
  const hasNext = safePage < totalPages;
  // Render the "Showing X–Y of Z" line whenever a total is known,
  // even if no pageSize is set. The component still works as a
  // pure "current page / total pages" pager in that case.
  const range =
    totalCount !== undefined
      ? pageSize !== undefined
        ? rangeForPage(safePage, pageSize, totalCount)
        : { from: 0, to: 0 }
      : null;
  return (
    <nav
      aria-label={tr("common.paginationAria", "Pagination")}
      className={cn(
        "border-border bg-surface flex flex-col gap-3 rounded-[var(--radius-card)] border p-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
      data-testid="pagination"
    >
      {range ? (
        <p className="text-label text-fg-secondary" data-testid="pagination-summary">
          {totalCount === 0 ? "No results" : `Showing ${range.from}–${range.to} of ${totalCount}`}
        </p>
      ) : (
        <span aria-hidden="true" />
      )}
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          <PageLink
            {...(hasPrev ? { href: buildHref(1) } : {})}
            disabled={!hasPrev}
            label={tr("common.firstPageAria", "First page")}
          >
            <ChevronFirst className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">{tr("common.firstPageAria", "First page")}</span>
          </PageLink>
        </li>
        <li>
          <PageLink
            {...(hasPrev ? { href: buildHref(safePage - 1) } : {})}
            disabled={!hasPrev}
            label={tr("common.previousPageAria", "Previous page")}
          >
            <DirAwareChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only sm:hidden">
              {tr("common.previousPageAria", "Previous page")}
            </span>
            <span className="text-label hidden sm:inline">
              {tr("common.previousPageText", "Previous")}
            </span>
          </PageLink>
        </li>
        {pages.map((p, i) =>
          p === "ellipsis" ? (
            <li key={`ellipsis-${i}`} className="text-fg-muted text-label px-2" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={p}>
              <PageLink
                href={buildHref(p)}
                active={p === safePage}
                label={tr("common.pageX", "Page {p}", { p })}
                {...(p === safePage ? { ariaCurrent: "page" as const } : {})}
              >
                {p}
              </PageLink>
            </li>
          ),
        )}
        <li>
          <PageLink
            {...(hasNext ? { href: buildHref(safePage + 1) } : {})}
            disabled={!hasNext}
            label={tr("common.nextPageAria", "Next page")}
          >
            <span className="text-label hidden sm:inline">{tr("common.nextPageText", "Next")}</span>
            <span className="sr-only sm:hidden">{tr("common.nextPageAria", "Next page")}</span>
            <DirAwareChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </PageLink>
        </li>
        <li>
          <PageLink
            {...(hasNext ? { href: buildHref(totalPages) } : {})}
            disabled={!hasNext}
            label={tr("common.lastPageAria", "Last page")}
          >
            <span className="sr-only">{tr("common.lastPageAria", "Last page")}</span>
            <ChevronLast className="h-3.5 w-3.5" aria-hidden="true" />
          </PageLink>
        </li>
      </ul>
    </nav>
  );
}

function PageLink({
  href,
  active = false,
  disabled = false,
  label,
  ariaCurrent,
  children,
}: {
  href?: string;
  active?: boolean;
  disabled?: boolean;
  label: string;
  /** Set to "page" on the active page link. Omit on all other links. */
  ariaCurrent?: "page";
  children: React.ReactNode;
}) {
  const base =
    "text-body inline-flex min-h-9 items-center justify-center gap-1 rounded-[var(--radius-control)] border px-2.5 py-1 font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
  if (disabled || !href) {
    return (
      <span
        aria-disabled
        aria-label={label}
        data-testid={`pagination-${label.toLowerCase().replace(/\s+/g, "-")}`}
        className={cn(base, "border-border bg-surface text-fg-muted cursor-not-allowed opacity-50")}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      {...(ariaCurrent ? { "aria-current": ariaCurrent } : {})}
      data-testid={`pagination-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className={cn(
        base,
        active
          ? "border-primary bg-primary-subtle text-primary"
          : "border-border bg-surface text-fg-primary hover:border-fg-secondary hover:bg-surface-subtle",
      )}
    >
      {children}
    </Link>
  );
}
