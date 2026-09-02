"use client";

import * as React from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { DataTable, type DataTableColumnDef } from "@/components/ui/data-table";
import { formatRelativeDate } from "@/lib/utils/format-relative-date";
import type { LocaleCode } from "@/lib/i18n/locales";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";

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
export function AgenciesTable({
  rows,
  relativeNow,
}: {
  rows: readonly PlatformAgencyRow[];
  relativeNow: string;
}) {
  const t = useLocaleT();
  const locale = useLocaleCode();
  const [query, setQuery] = React.useState("");
  const columns = React.useMemo(
    () => createColumns(new Date(relativeNow), t, locale),
    [relativeNow, t, locale],
  );

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
          {t("platform.tableEmpty")}{" "}
          <span className="text-fg-primary font-semibold">
            {query || t("platform.tableEmptyFallback")}
          </span>
          .
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
        {t("platform.tableVisibleCount", {
          visible: filtered.length,
          total: rows.length,
          agencyWord: t(rows.length === 1 ? "platform.tableAgencyOne" : "platform.tableAgencyMany"),
        })}
      </p>
    </div>
  );
}

function createColumns(
  relativeNow: Date,
  t: (key: string, params?: Record<string, string | number>) => string,
  locale: LocaleCode,
): DataTableColumnDef<PlatformAgencyRow>[] {
  return [
    {
      key: "name",
      header: t("platform.colAgency"),
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
      header: t("platform.colMembers"),
      cell: (r) => (
        <span className="text-body text-fg-primary font-medium">
          {r.memberCount} {r.memberCount === 1 ? t("platform.memberOne") : t("platform.memberMany")}
        </span>
      ),
    },
    {
      key: "workspaces",
      header: t("platform.colWorkspaces"),
      cell: (r) => (
        <span className="text-body text-fg-primary font-medium">
          {r.workspaceCount}{" "}
          {r.workspaceCount === 1 ? t("platform.workspaceOne") : t("platform.workspaceMany")}
        </span>
      ),
    },
    {
      key: "plan",
      header: t("platform.colPlanStatus"),
      cell: (r) => (
        <span className="text-body text-fg-primary">
          {r.planName} · {t(`platform.lifecycle.${r.lifecycle}`)}
        </span>
      ),
    },
    {
      key: "created",
      header: t("platform.colCreated"),
      cell: (r) => formatRelativeDate(r.createdAt, relativeNow, locale),
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-12",
      cellClassName: "text-end",
      cell: (r) => (
        <Link
          href={`/app/platform/agencies/${r.id}#identity`}
          className="text-primary focus-visible:ring-focus-ring text-body inline-block rounded-[var(--radius-control)] px-2 py-1 font-semibold underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
        >
          {t("platform.colOpen")}
        </Link>
      ),
    },
  ];
}
