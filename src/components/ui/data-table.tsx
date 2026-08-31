import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * DataTable — typed, styled table for the Stitch-aligned admin lists
 * (channels, team, users, etc.). Centralises the shared thead/tbody
 * className soup so every list page renders the same row hover,
 * uppercase header label, and table-dense typography.
 *
 * Usage:
 *   <DataTable<ChannelRow>
 *     data-testid="channels-table"
 *     columns={[
 *       { key: "platform", header: "Platform", cell: (r) => ... },
 *       { key: "owner",    header: "Owner",    cell: (r) => ..., hideOn: "md" },
 *     ]}
 *     rows={rows}
 *     getRowKey={(r) => r.id}
 *     getRowTestId={(r) => `channel-row-${r.id}`}
 *     getRowHref={(r) => `/app/w/${r.slug}`}     // optional — turns the row into a link
 *   />
 *
 * `hideOn` collapses a column below the named breakpoint — uses CSS
 * `hidden <breakpoint>:table-cell` so the column is removed from the
 * table layout on small screens (rather than just being 0-width).
 *
 * When `getRowHref` is supplied, the first cell of every row becomes
 * a link to that href and the row is keyboard-navigable: Enter
 * activates the link, the link is focusable, and a clear focus ring
 * is rendered. Action buttons / kebab menus in other cells stop
 * their own click propagation in their own onClick handlers (see
 * e.g. `WorkspaceRowActions`), so they stay interactive without
 * needing a row-level click suppressor.
 *
 * Note: `DataTable` is a Server Component (no "use client" — it has
 * to stay a Server Component so the page can pass per-row data like
 * `Map<string, …>` aggregates from a DB query through `columns[i].cell`
 * closures). It therefore CANNOT attach a row-level onClick handler:
 * inline function props on Server-Component-rendered DOM elements
 * are serialised into the RSC payload as function references, and
 * when the client hydrates the closure can't resolve the captured
 * server-side locals — Next.js + React surface this as
 * "Minified React error #441: more hooks than during the previous
 * render" (the orphan function prop makes the reconciler treat the
 * `<td>` as a different component on the second pass, so the hook
 * count diverges). If a future variant needs row-level click
 * handling, mark the component `"use client"` AND refactor the
 * column-def `cell` signature to take serialisable data instead of
 * closing over server-side Maps.
 */
export interface DataTableColumnDef<T> {
  /** Stable key — also used as the React key for the header cell. */
  key: string;
  /** Header label. Rendered in uppercase via thead styling. */
  header: React.ReactNode;
  /** Renders the cell content for one row. */
  cell: (row: T) => React.ReactNode;
  /** Extra classes on the <th>. */
  headerClassName?: string;
  /** Extra classes on every <td> in this column. */
  cellClassName?: string;
  /** Hide the column below the named breakpoint. */
  hideOn?: "sm" | "md" | "lg" | "xl" | "2xl";
}

export interface DataTableProps<T> {
  /** Test id forwarded to the <table> element. */
  "data-testid"?: string;
  columns: DataTableColumnDef<T>[];
  rows: readonly T[];
  getRowKey: (row: T) => string;
  getRowTestId?: (row: T) => string;
  /**
   * If supplied, every row becomes a link to the resolved href
   * and the row is keyboard-navigable. Hover state is preserved.
   */
  getRowHref?: (row: T) => string;
  /** Optional className forwarded to the <table>. */
  className?: string;
}

const HIDE_CLASS: Record<NonNullable<DataTableColumnDef<unknown>["hideOn"]>, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
  "2xl": "hidden 2xl:table-cell",
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  getRowTestId,
  getRowHref,
  className,
  "data-testid": dataTestId,
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto" data-testid={`${dataTestId ?? "data-table"}-wrapper`}>
      <table
        className={cn("w-full border-collapse text-start", className)}
        data-testid={dataTestId}
      >
        <thead>
          <tr className="bg-surface-subtle border-border border-b">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "text-label text-fg-secondary px-4 py-3 font-semibold tracking-wide uppercase",
                  c.hideOn ? HIDE_CLASS[c.hideOn] : null,
                  c.headerClassName,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-border text-table-dense divide-y">
          {rows.map((row) => {
            const href = getRowHref ? getRowHref(row) : undefined;
            return (
              <tr
                key={getRowKey(row)}
                data-testid={getRowTestId?.(row)}
                className={cn(
                  "transition-colors",
                  href
                    ? "hover:bg-surface-subtle focus-within:bg-surface-subtle"
                    : "hover:bg-surface-subtle",
                )}
              >
                {columns.map((c, idx) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-4 py-3",
                      c.hideOn ? HIDE_CLASS[c.hideOn] : null,
                      c.cellClassName,
                    )}
                  >
                    {href && idx === 0 ? (
                      // First cell anchors the row click target via
                      // the inline <a>; interactive children in other
                      // cells (e.g. WorkspaceRowActions) handle their
                      // own click stopPropagation.
                      <RowLink href={href} row={row} cell={c.cell} />
                    ) : (
                      c.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * First-cell row link. Wraps the first cell content in an anchor
 * that is the row's keyboard-navigable activator. The link
 * includes `aria-describedby`-style row info via the visible
 * content (the brand / row label).
 */
function RowLink<T>({
  href,
  row: _row,
  cell,
}: {
  href: string;
  row: T;
  cell: (row: T) => React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="text-fg-primary focus-visible:ring-focus-ring hover:text-primary -m-1 inline-flex max-w-full items-center gap-2 rounded-[var(--radius-control)] p-1 font-semibold focus:outline-none focus-visible:ring-2"
    >
      {cell(_row)}
    </a>
  );
}
