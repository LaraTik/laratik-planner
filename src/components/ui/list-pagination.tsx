import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { DirAwareChevronLeft, DirAwareChevronRight } from "@/components/ui/dir-aware-icon";

/**
 * ListPagination — the bottom strip on every paginated admin list.
 *
 * Renders three things from props:
 *   1. Counter: "Showing X–Y of Z" (bilingual via the caller)
 *   2. Prev button (only when page > 1)
 *   3. Page indicator + Next button (only when page < total)
 *
 * The caller is responsible for computing the prev/next hrefs and for
 * supplying the bilingual counter copy. Keeping the math out of this
 * primitive means it works for both SSR-driven pagination (Next.js)
 * and any future client-driven one without a refactor.
 *
 * Layout:
 *   - Stacks vertically on mobile (<sm) so the counter stays full width.
 *   - Side-by-side with Prev/Right on the right from sm and up.
 *
 * Accessibility:
 *   - `<nav aria-label="Pagination">` so landmark users can jump to it.
 *   - Prev/Next have a visible label plus the chevron icon so a screen
 *     reader announces "Previous" instead of "graphic".
 *   - When the user is on the first or last page, the button is
 *     disabled (rather than removed) so the layout doesn't shift and
 *     SR users still hear the boundary state.
 */
export interface ListPaginationProps {
  /** Currently displayed page (1-indexed). */
  page: number;
  /** Total page count (>= 1). */
  totalPages: number;
  /** Total matched rows. Used only for the rendered "Showing X–Y of Z" copy
   * via `counterLabel`; not rendered in the markup. The interface keeps it
   * so callers can compute the range without redeclaring the math. */
  total: number;
  /** Inclusive start row shown on this page (0 when total is 0). */
  from: number;
  /** Inclusive end row shown on this page (0 when total is 0). */
  to: number;
  /** Href for the previous page (omit to disable the button). */
  prevHref: string | null;
  /** Href for the next page (omit to disable the button). */
  nextHref: string | null;
  /** Bilingual counter formatter (caller owns the strings). */
  counterLabel: string;
  /** aria-label for the nav landmark, e.g. "Member list pagination". */
  ariaLabel: string;
  /** Pre-translated "Previous" and "Next" labels. */
  prevLabel: string;
  nextLabel: string;
  /** Pre-translated "{page} / {total}" indicator. */
  pageIndicator: string;
  testId?: string;
}

export function ListPagination({
  page,
  totalPages,
  from,
  to,
  prevHref,
  nextHref,
  counterLabel,
  ariaLabel,
  prevLabel,
  nextLabel,
  pageIndicator,
  testId = "list-pagination",
}: ListPaginationProps) {
  return (
    <nav
      aria-label={ariaLabel}
      data-testid={testId}
      className="border-border text-label text-fg-secondary flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3"
    >
      <span data-testid={`${testId}-counter`} aria-live="polite">
        {counterLabel}
      </span>
      <div className="flex items-center gap-2">
        {prevHref ? (
          <Link
            href={prevHref}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            data-testid={`${testId}-prev`}
          >
            <DirAwareChevronLeft className="h-4 w-4" />
            <span className="sr-only">{prevLabel}</span>
            <span aria-hidden>{prevLabel}</span>
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "opacity-50")}
            aria-label={prevLabel}
            data-testid={`${testId}-prev-disabled`}
          >
            <DirAwareChevronLeft className="h-4 w-4" />
            <span aria-hidden>{prevLabel}</span>
          </button>
        )}
        <span className="text-fg-muted font-mono" data-testid={`${testId}-page`}>
          {pageIndicator}
        </span>
        {nextHref ? (
          <Link
            href={nextHref}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            data-testid={`${testId}-next`}
          >
            <span className="sr-only">{nextLabel}</span>
            <span aria-hidden>{nextLabel}</span>
            <DirAwareChevronRight className="h-4 w-4" />
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "opacity-50")}
            aria-label={nextLabel}
            data-testid={`${testId}-next-disabled`}
          >
            <span aria-hidden>{nextLabel}</span>
            <DirAwareChevronRight className="h-4 w-4" />
          </button>
        )}
        {/* Page count encoded in `pageIndicator` so the visible
            expression of pagination stays self-contained. */}
        <span className="sr-only">{page}</span>
      </div>
      {/* Quick reference for the from/to numbers (helps testids and
          is internal — no visual rendering). */}
      <span className="hidden" data-testid={`${testId}-range`}>
        {from}-{to} / {totalPages}
      </span>
    </nav>
  );
}
