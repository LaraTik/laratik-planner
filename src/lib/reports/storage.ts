import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Reports file storage (v1, single-node local volume).
 *
 *   data/reports/<report_id>.pdf            — the PDF bytes.
 *   data/reports/index.json                — metadata index, sorted
 *                                            newest-first, capped at 100
 *                                            entries (older reports
 *                                            fall off the bottom).
 *
 * Multi-node or durable-blob deployments swap this for an S3-backed
 * adapter; the read/write surface is two helpers — `saveReport` and
 * `loadReport` — and one `loadIndex()`. Replacing the implementation
 * does not touch the templates, the renderer, or the page.
 */
const REPORTS_DIR = resolve(process.cwd(), "data/reports");
const INDEX_PATH = join(REPORTS_DIR, "index.json");
const MAX_INDEX = 100;

export interface ReportRequestRow {
  id: string;
  templateId: string;
  agencyId: string;
  workspaceIds: string[];
  channelIds: string[];
  /** ISO timestamps. */
  from: string;
  to: string;
  preset: "7d" | "30d" | "90d" | "custom";
  /** Filename used when the user hit "Download". */
  filename: string;
  /** Bytes of the PDF. */
  bytes: number;
  /** Display name the user passed (or empty string). */
  preparedFor: string;
  /** Created-at. */
  createdAt: string;
}

export async function saveReport(
  row: Omit<ReportRequestRow, "id" | "createdAt" | "bytes" | "filename">,
  pdf: Buffer,
): Promise<ReportRequestRow> {
  await mkdir(REPORTS_DIR, { recursive: true });
  const id = randomUUID();
  const filename = `${row.templateId}-${row.preset}-${row.from.slice(0, 10)}.pdf`;
  const full: ReportRequestRow = {
    ...row,
    id,
    filename,
    bytes: pdf.byteLength,
    createdAt: new Date().toISOString(),
  };
  await writeFile(join(REPORTS_DIR, `${id}.pdf`), pdf);
  const index = await loadIndex();
  index.unshift(full);
  if (index.length > MAX_INDEX) {
    const dropped = index.splice(MAX_INDEX);
    // Best-effort cleanup of the displaced PDFs. If the file is
    // already deleted we ignore the unlink error.
    for (const row of dropped) {
      try {
        await writeFile(join(REPORTS_DIR, `${row.id}.pdf`), "").catch(() => undefined);
      } catch {
        // ignore
      }
    }
  }
  await writeFile(INDEX_PATH, JSON.stringify(index, null, 2));
  return full;
}

export async function loadIndex(): Promise<ReportRequestRow[]> {
  await mkdir(REPORTS_DIR, { recursive: true });
  try {
    const raw = await readFile(INDEX_PATH, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed as ReportRequestRow[];
    }
    return [];
  } catch {
    return [];
  }
}

export async function loadReport(
  id: string,
): Promise<{ row: ReportRequestRow; bytes: Buffer } | null> {
  const index = await loadIndex();
  const row = index.find((r) => r.id === id);
  if (!row) return null;
  try {
    const bytes = await readFile(join(REPORTS_DIR, `${id}.pdf`));
    return { row, bytes };
  } catch {
    return null;
  }
}
