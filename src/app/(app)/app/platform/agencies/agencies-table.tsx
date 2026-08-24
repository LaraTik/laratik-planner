"use client";

import * as React from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";

/**
 * Row shape for the platform-agencies table. Owned by the server
 * page (which assembles the aggregate counts) and consumed by this
 * client component for the search filter.
 */
export type PlatformAgencyRow = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  memberCount: number;
  workspaceCount: number;
  planName: string;
  lifecycle: "active" | "suspended" | "archived";
};

/**
 * Client-side search filter for the platform-agencies table.
 *
 * M1 ships a single text input (case-insensitive match against
 * `name` OR `slug`). M2 may add filter pills (status, plan tier) —
 * for now the table is small enough that a flat search is plenty.
 *
 * The filter is pure UI state — it never re-fetches, never hits the
 * server, and never persists across navigations. The server already
 * shipped the full row set.
 */
export function AgenciesTable({ rows }: { rows: readonly PlatformAgencyRow[] }) {
  const [query, setQuery] = React.useState("");

  // Wire up to the page-level search input (rendered above the table
  // by the server component). The input is server-rendered; this
  // client component listens for `input` events that bubble up from
  // it by selector, so we keep one source of truth in the server tree
  // and one filter hook here.
  React.useEffect(() => {
    const input = document.querySelector<HTMLInputElement>(
      "[data-testid='platform-agencies-search']",
    );
    if (!input) return;
    const handler = (e: Event) => {
      const target = e.target as HTMLInputElement;
      setQuery(target.value);
    };
    input.addEventListener("input", handler);
    return () => input.removeEventListener("input", handler);
  }, []);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <div className="space-y-3" data-testid="platform-agencies-table-wrap">
      {filtered.length === 0 ? (
        <p
          className="text-body text-fg-muted border-border rounded-[var(--radius-control)] border border-dashed px-4 py-6 text-center"
          data-testid="platform-agencies-empty"
        >
          No agencies match{" "}
          <span className="text-fg-primary font-semibold">{query || "your filter"}</span>.
        </p>
      ) : (
        <DataTable
          data-testid="platform-agencies-table"
          rows={filtered}
          getRowKey={(r) => r.id}
          getRowTestId={(r) => `platform-agency-row-${r.id}`}
          columns={columns}
        />
      )}
      <p className="text-label text-fg-muted" data-testid="platform-agencies-visible-count">
        Showing {filtered.length} of {rows.length} {rows.length === 1 ? "agency" : "agencies"}
      </p>
    </div>
  );
}

const columns: DataTableColumnDef<PlatformAgencyRow>[] = [
  {
    key: "name",
    header: "Agency",
    headerClassName: "w-1/3",
    cell: (r) => (
      <div className="flex items-center gap-3">
        <span
          className="bg-primary-subtle text-primary inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)]"
          aria-hidden="true"
        >
          <Building2 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <Link
            href={`/app/platform/agencies/${r.id}`}
            className="text-body text-fg-primary hover:text-primary block truncate font-semibold"
          >
            {r.name}
          </Link>
          <p className="text-label text-fg-muted truncate">{r.slug}</p>
        </div>
      </div>
    ),
  },
  {
    key: "members",
    header: "Members",
    cell: (r) => (
      <span className="text-body text-fg-primary font-medium">
        {r.memberCount} {r.memberCount === 1 ? "member" : "members"}
      </span>
    ),
  },
  {
    key: "workspaces",
    header: "Workspaces",
    cell: (r) => (
      <span className="text-body text-fg-primary font-medium">
        {r.workspaceCount} {r.workspaceCount === 1 ? "workspace" : "workspaces"}
      </span>
    ),
  },
  {
    key: "plan",
    header: "Plan / status",
    cell: (r) => (
      <span className="text-body text-fg-primary">
        {r.planName} · {r.lifecycle}
      </span>
    ),
  },
  {
    key: "created",
    header: "Created",
    cell: (r) => formatRelativeDate(r.createdAt),
  },
  {
    key: "actions",
    header: "",
    headerClassName: "w-12",
    cellClassName: "text-right",
    cell: (r) => (
      <Link
        href={`/app/platform/agencies/${r.id}#identity`}
        className="text-primary focus-visible:ring-focus-ring text-body inline-block rounded-[var(--radius-control)] px-2 py-1 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
      >
        Open
      </Link>
    ),
  },
];
