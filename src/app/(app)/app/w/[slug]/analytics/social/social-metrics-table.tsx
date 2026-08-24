"use client";

import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";

/**
 * M4 — exact-value table for the social growth chart.
 *
 * The chart is the visualization; the table is the source of truth.
 * Screen readers can navigate the table directly; the chart's
 * `aria-describedby` points to a hidden paragraph that names the
 * table.
 */

export type SocialMetricsRow = {
  metricDate: string;
  followerCount: number | null;
  reach: number | null;
  views: number | null;
  engagedAccounts: number | null;
  interactions: number | null;
  partial?: boolean | undefined;
};

function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : n.toLocaleString();
}

const columns: DataTableColumnDef<SocialMetricsRow>[] = [
  {
    key: "metricDate",
    header: "Date",
    cell: (row) => row.metricDate,
  },
  {
    key: "followerCount",
    header: "Followers",
    cell: (row) => fmt(row.followerCount),
  },
  {
    key: "reach",
    header: "Reach",
    hideOn: "md",
    cell: (row) => fmt(row.reach),
  },
  {
    key: "views",
    header: "Views",
    hideOn: "md",
    cell: (row) => fmt(row.views),
  },
  {
    key: "engagedAccounts",
    header: "Engaged",
    hideOn: "lg",
    cell: (row) => fmt(row.engagedAccounts),
  },
  {
    key: "interactions",
    header: "Interactions",
    hideOn: "lg",
    cell: (row) => fmt(row.interactions),
  },
];

export function SocialMetricsTable({
  rows,
  tableId,
}: {
  rows: SocialMetricsRow[];
  tableId: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-body text-fg-muted" data-testid="social-metrics-empty">
        No daily metrics yet. The first snapshot lands within 24 hours of connecting a provider; the
        chart and table will populate automatically.
      </p>
    );
  }
  return (
    <DataTable
      data-testid="social-metrics-table"
      getRowKey={(row) => row.metricDate}
      rows={rows}
      columns={columns}
      aria-label={tableId}
    />
  );
}
