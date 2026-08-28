"use client";

import { Download } from "lucide-react";
import { csvFilename, toCsv, type CsvRow } from "./social-csv";

/**
 * M5 — per-channel CSV export.
 *
 * Small client component that turns the per-channel daily-metric
 * rows into a CSV and triggers a browser download. The page
 * already has the rows server-rendered; this component is the
 * minimum-viable client island to wire up the Blob download.
 *
 * We do NOT add a server-side `/api/.../csv` route — the data
 * the operator wants to export is already on the page, and a
 * route would mean re-deriving the per-channel filtering that
 * the page does server-side. The client side is a
 * transformation, not a re-fetch.
 *
 * The pure CSV / filename helpers live in `./social-csv` so
 * they are unit-testable without a DOM. This component is the
 * thin DOM-binding layer.
 */
export type { CsvRow };

export function SocialCsvExport({ channelName, rows }: { channelName: string; rows: CsvRow[] }) {
  function handleClick() {
    if (rows.length === 0) return;
    const csv = toCsv(rows);
    // Prepend a UTF-8 BOM so Excel on Windows detects the
    // encoding correctly.
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFilename(channelName, rows[0]!.metricDate, rows[rows.length - 1]!.metricDate);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke after a tick so the download has a chance to start.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={rows.length === 0}
      data-testid="social-csv-export"
      className="border-border bg-surface text-fg-primary hover:bg-surface-subtle text-body inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Download className="h-3.5 w-3.5" aria-hidden={true} />
      Download CSV
    </button>
  );
}
