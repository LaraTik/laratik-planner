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
 *   />
 *
 * `hideOn` collapses a column below the named breakpoint — uses CSS
 * `hidden <breakpoint>:table-cell` so the column is removed from the
 * table layout on small screens (rather than just being 0-width).
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
  className,
  "data-testid": dataTestId,
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto" data-testid={`${dataTestId ?? "data-table"}-wrapper`}>
      <table className={cn("w-full border-collapse text-left", className)} data-testid={dataTestId}>
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
          {rows.map((row) => (
            <tr
              key={getRowKey(row)}
              data-testid={getRowTestId?.(row)}
              className="hover:bg-surface-subtle transition-colors"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "px-4 py-3",
                    c.hideOn ? HIDE_CLASS[c.hideOn] : null,
                    c.cellClassName,
                  )}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
