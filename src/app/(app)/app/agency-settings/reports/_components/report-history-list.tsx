"use client";

import * as React from "react";
import Link from "next/link";
import { Download, History as HistoryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ReportRequestRow } from "@/lib/reports/storage";

// Inline translator type — kept local so this component has no
// dependency on `tForActive()` (it only needs to format a string).
interface Translator {
  (key: string, params?: Record<string, string | number>): string;
}

interface Translator {
  (key: string, params?: Record<string, string | number>): string;
}

export function ReportHistoryList({
  entries,
  translator: t,
}: {
  entries: ReadonlyArray<ReportRequestRow>;
  translator: Translator;
}) {
  if (entries.length === 0) {
    return (
      <div
        className="text-body text-fg-muted border-border bg-surface-subtle rounded-[var(--radius-control)] border p-6"
        data-testid="reports-history-empty"
      >
        <HistoryIcon className="text-fg-muted mb-2 h-6 w-6" aria-hidden={true} />
        <p className="font-medium">{t("reports.historyEmpty")}</p>
        <p className="text-label text-fg-muted mt-1">{t("reports.historyEmptyBody")}</p>
      </div>
    );
  }
  return (
    <ul className="divide-border divide-y" data-testid="reports-history-list">
      {entries.slice(0, 20).map((row) => (
        <li
          key={row.id}
          data-testid={`reports-history-row-${row.id}`}
          className="flex flex-wrap items-center gap-3 px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-body text-fg-primary font-semibold">
              {t(`reports.templates.${row.templateId}.label`)}
            </p>
            <p className="text-label text-fg-muted">
              {t("reports.historyLine", {
                from: row.from.slice(0, 10),
                to: row.to.slice(0, 10),
                count: row.workspaceIds.length,
              })}
            </p>
          </div>
          <Badge variant="outline" className="ms-auto">
            {Math.round(row.bytes / 1024)} KB
          </Badge>
          <Button asChild size="sm" variant="secondary">
            <Link
              href={`/api/reports/${row.id}/pdf`}
              data-testid={`reports-history-download-${row.id}`}
            >
              <Download className="h-4 w-4" aria-hidden={true} />
              {t("reports.downloadCta")}
            </Link>
          </Button>
        </li>
      ))}
    </ul>
  );
}
