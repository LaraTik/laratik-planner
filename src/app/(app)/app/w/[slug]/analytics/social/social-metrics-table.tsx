"use client";

import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { useLocaleT } from "@/components/i18n/locale-provider";

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

export function SocialMetricsTable({
  rows,
  tableId,
}: {
  rows: SocialMetricsRow[];
  tableId: string;
}) {
  const t = useLocaleT();
  const columns: DataTableColumnDef<SocialMetricsRow>[] = [
    {
      key: "metricDate",
      header: t("analytics.tableDate"),
      cell: (row) => row.metricDate,
    },
    {
      key: "followerCount",
      header: t("analytics.tableFollowers"),
      cell: (row) => fmt(row.followerCount),
    },
    {
      key: "reach",
      header: t("analytics.tableReach"),
      hideOn: "md",
      cell: (row) => fmt(row.reach),
    },
    {
      key: "views",
      header: t("analytics.tableViews"),
      hideOn: "md",
      cell: (row) => fmt(row.views),
    },
    {
      key: "engagedAccounts",
      header: t("analytics.tableEngaged"),
      hideOn: "lg",
      cell: (row) => fmt(row.engagedAccounts),
    },
    {
      key: "interactions",
      header: t("analytics.tableInteractions"),
      hideOn: "lg",
      cell: (row) => fmt(row.interactions),
    },
  ];
  if (rows.length === 0) {
    return (
      <p className="text-body text-fg-muted" data-testid="social-metrics-empty">
        {t("analytics.tableEmpty")}
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
