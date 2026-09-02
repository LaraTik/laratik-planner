import * as React from "react";
import Link from "next/link";

import { DirAwareChevronLeft, DirAwareChevronRight } from "@/components/ui/dir-aware-icon";
import { formatDate } from "@/lib/i18n/format-locale";
import type { LocaleCode } from "@/lib/i18n/locales";
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
  /** Active interface locale for the month label and accessible names. */
  locale: LocaleCode;
  /** Translates the previous/next month accessible names. */
  t: (key: string, params?: Record<string, string | number>) => string;
  className?: string;
}

export function MonthNav({ month, buildHref, locale, t, className }: MonthNavProps) {
  const formatMonth = (value: Date) =>
    formatDate(value, locale, { month: "long", year: "numeric" });
  const label = formatMonth(month);
  const previousLabel = (() => {
    const d = new Date(month.getFullYear(), month.getMonth() - 1, 1);
    return formatMonth(d);
  })();
  const nextLabel = (() => {
    const d = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    return formatMonth(d);
  })();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Link
        aria-label={t("workspaceOverview.previousMonth", { month: previousLabel })}
        href={buildHref(-1)}
        className="border-border bg-surface focus-visible:ring-focus-ring rounded-[var(--radius-control)] border p-2 transition-colors focus:outline-none focus-visible:ring-2"
      >
        <DirAwareChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Link>
      <span className="text-body min-w-32 text-center font-semibold sm:min-w-36">{label}</span>
      <Link
        aria-label={t("workspaceOverview.nextMonth", { month: nextLabel })}
        href={buildHref(1)}
        className="border-border bg-surface focus-visible:ring-focus-ring rounded-[var(--radius-control)] border p-2 transition-colors focus:outline-none focus-visible:ring-2"
      >
        <DirAwareChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
