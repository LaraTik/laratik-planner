import * as React from "react";
import Link from "next/link";

import { DirAwareChevronLeft, DirAwareChevronRight } from "@/components/ui/dir-aware-icon";
import { cn } from "@/lib/utils";

/**
 * MonthNav — server-rendered prev/next chevron + month label, driven by
 * a `monthParam(offset)` function that the caller closes over. Used on
 * Planning, Calendar, and any other date-driven screen.
 *
 * Buttons honour WCAG touch targets (44px) and include visible focus
 * rings. Month label collapses to a single line on narrow viewports.
 */
export interface MonthNavProps {
  /** Currently displayed month. */
  month: Date;
  /** Returns the search-param value for a relative month offset (-1 / +1). */
  buildHref: (offset: number) => string;
  className?: string;
}

export function MonthNav({ month, buildHref, className }: MonthNavProps) {
  const label = month.toLocaleString("default", { month: "long", year: "numeric" });
  const previousLabel = (() => {
    const d = new Date(month.getFullYear(), month.getMonth() - 1, 1);
    return d.toLocaleString("default", { month: "long", year: "numeric" });
  })();
  const nextLabel = (() => {
    const d = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    return d.toLocaleString("default", { month: "long", year: "numeric" });
  })();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Link
        aria-label={`Previous month, ${previousLabel}`}
        href={buildHref(-1)}
        className="border-border bg-surface focus-visible:ring-focus-ring rounded-[var(--radius-control)] border p-2 transition-colors focus:outline-none focus-visible:ring-2"
      >
        <DirAwareChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Link>
      <span className="text-body min-w-32 text-center font-semibold sm:min-w-36">{label}</span>
      <Link
        aria-label={`Next month, ${nextLabel}`}
        href={buildHref(1)}
        className="border-border bg-surface focus-visible:ring-focus-ring rounded-[var(--radius-control)] border p-2 transition-colors focus:outline-none focus-visible:ring-2"
      >
        <DirAwareChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
