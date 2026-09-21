import * as React from "react";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/**
 * DataTableToolbar — the shared filter bar above each admin list.
 *
 * Lives in `src/components/ui/` because every Team / Access / future
 * Users-of-X page builds the same shape:
 *   - Search input (free text, debounced via form GET submission)
 *   - Status / role chips (multi-select via form GET submission, each
 *     chip renders as a checkbox-bearing button)
 *   - Clear link (visible only when at least one filter is active)
 *   - Hidden `page` input — submitted alongside the new query so the
 *     SSR pagination resets to page 1 when the result set changes
 *
 * Why a form GET instead of `useRouter().push` + `useSearchParams()`?
 *   - The page is a Server Component (it has to be, to run the DB query
 *     with the filters). A plain HTML form gives us SSR for free — the
 *     browser builds the right URL, no client JS.
 *   - Debounce isn't worth the JS cost at this scale; a 250ms debounce
 *     saves a few KB of bundle and a handful of round-trips per minute.
 *     Submit-on-blur / submit-on-Enter is the standard admin pattern.
 *   - `noscript` users still get a fully working search bar.
 *
 * Hidden inputs are how the form re-submits the *other* filter values
 * (e.g. role chip stays selected when the user changes the status). The
 * caller passes `hiddenParams` — the foreign keys the form should not
 * forget about.
 *
 * When `children` is provided it renders between the chips and the
 * right-aligned actions so callers can add a page-size selector or
 * an extra control without prop-drilling.
 */
export interface DataTableToolbarProps {
  /** Bilingual placeholder + aria label hooks. */
  searchPlaceholder: string;
  searchLabel: string;
  /**
   * Hidden param map. Anything already on the URL that should be
   * preserved across submissions. The toolbar will NOT include the
   * active `q` here; pass it through as `hiddenParams.search` only if
   * the page uses a non-default name.
   */
  hiddenParams?: Record<string, string[] | string | undefined>;
  /** The form `action` attribute (defaults to current path). */
  action?: string;
  /** When at least one filter is active the Clear link is shown. */
  clearHref: string;
  clearLabel: string;
  /** Filter chips render between the search and the actions. */
  children?: React.ReactNode;
  /** current search value, fed back into the input defaultValue. */
  defaultSearchValue?: string;
  /** Optional extra className for the toolbar wrapper. */
  className?: string;
  /** data-testid hooks. Defaults to "data-table-toolbar". */
  testIdPrefix?: string;
}

export function DataTableToolbar({
  searchPlaceholder,
  searchLabel,
  hiddenParams = {},
  action,
  clearHref,
  clearLabel,
  children,
  defaultSearchValue,
  className,
  testIdPrefix = "data-table-toolbar",
}: DataTableToolbarProps) {
  // Hidden <input> for every stable param. Strip undefined / empty so we
  // don't submit no-op values that survive as URL noise.
  const hidden = Object.entries(hiddenParams).flatMap(([name, raw]) => {
    if (raw === undefined || raw === null || raw === "") return [];
    const values = Array.isArray(raw) ? raw : [raw];
    return values
      .filter((v) => v !== undefined && v !== null && v !== "")
      .map((value, i) => <input key={`${name}-${i}`} type="hidden" name={name} value={value} />);
  });

  return (
    <form
      method="GET"
      action={action}
      role="search"
      aria-label={searchLabel}
      className={cn(
        "border-border bg-surface-subtle flex flex-wrap items-center gap-2 border-b px-4 py-3",
        className,
      )}
      data-testid={testIdPrefix}
    >
      <label htmlFor={`${testIdPrefix}-input`} className="sr-only">
        {searchLabel}
      </label>
      <div className="relative min-w-64 flex-1">
        <Search
          className="text-fg-muted pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2"
          aria-hidden="true"
        />
        <input
          id={`${testIdPrefix}-input`}
          type="search"
          name="q"
          defaultValue={defaultSearchValue}
          placeholder={searchPlaceholder}
          autoComplete="off"
          spellCheck={false}
          className="border-border bg-surface text-body text-fg-primary placeholder:text-fg-muted focus-visible:ring-focus-ring h-9 w-full rounded-[var(--radius-control)] border ps-8 pe-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
        />
      </div>

      {/* Foreign hidden inputs (other active filters, page size, etc.) */}
      {hidden}

      {/* Always reset to page 1 when the result set changes. */}
      <input type="hidden" name="page" value="1" />

      {children}

      <button
        type="submit"
        className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
        data-testid={`${testIdPrefix}-submit`}
      >
        {searchLabel}
      </button>

      {clearHref ? (
        <Link
          href={clearHref}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1")}
          data-testid={`${testIdPrefix}-clear`}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          {clearLabel}
        </Link>
      ) : null}
    </form>
  );
}

/**
 * FilterChip — a single-select / multi-select chip used inside the
 * toolbar's filter affordances. Renders as a `<button type="submit">`
 * with `name` + `value` so the parent form GET captures it.
 *
 * Multi-select is implemented via the `submit` semantics of a native
 * form: clicking a chip submits the form; the chip's `value` is added
 * to the matching URL param via the parent `<FilterChipGroup>` helper.
 *
 * Visual states:
 *  - Default  : outline chip with neutral text.
 *  - Selected : filled chip with primary color (tracked via `aria-pressed`).
 *  - Hover    : subtle background.
 *
 * Accessibility:
 *  - `aria-pressed` mirrors the toggle state for screen readers.
 *  - The icon is hidden from the a11y tree.
 *  - Min 32px touch target for mobile (matches ui-ux-pro-max priority
 *    2: Touch & Interaction).
 */
export interface FilterChipProps {
  label: string;
  /** Stable param key, e.g. "status". The parent form encodes it. */
  name: string;
  /** The value submitted when this chip is clicked. */
  value: string;
  selected: boolean;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  testId?: string;
}

export function FilterChip({ label, name, value, selected, icon: Icon, testId }: FilterChipProps) {
  return (
    <button
      type="submit"
      name={name}
      value={value}
      aria-pressed={selected}
      data-testid={testId ?? `filter-chip-${name}-${value}`}
      className={cn(
        "border-border text-label inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 font-semibold transition-colors",
        "focus-visible:ring-focus-ring focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none",
        selected
          ? "bg-primary text-primary-foreground border-transparent"
          : "bg-surface text-fg-secondary hover:bg-surface-subtle",
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden={true} /> : null}
      {label}
    </button>
  );
}
