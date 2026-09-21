/**
 * Folder-source adapter contract.
 *
 * The "From link" picker detects Google Drive **folder** URLs in addition
 * to single file links. This module describes the shared types every
 * adapter returns; concrete adapters live alongside (drive-html for v1,
 * drive-service-account as a v2 seam).
 *
 * Security stance (same as the single-file flow):
 *   - A pasted URL is never authorization.
 *   - Storage credentials never reach the browser.
 *   - The HTML adapter only works for "Anyone with the link can view"
 *     folders; private folders surface `provider_connection_required`.
 */

export const MAX_FOLDER_ITEMS = 500;
/** Hard cap on items a single user can submit for batch import. */
export const MAX_FOLDER_BATCH_IMPORT = 25;
/** Server-side fan-out parallelism for batch imports. */
export const FOLDER_IMPORT_CONCURRENCY = 4;
/** Per-item timeout when probing / downloading folder items. */
export const FOLDER_IMPORT_TIMEOUT_MS = 30_000;

/** Status of a single folder item returned by an adapter. */
export type MediaFolderItemStatus =
  /** Publicly downloadable — the wizard can preselect and import. */
  | "importable"
  /** Drive-native (Docs/Sheets/Slides/Forms) — needs Drive export. */
  | "unsupported"
  /** Drive returned 401/403 — same shape as single-file error. */
  | "provider_connection_required";

export type MediaFolderItem = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number | null;
  thumbnailUrl?: string | null;
  /** Canonical file URL the existing single-file import understands. */
  sourceUrl: string;
  status: MediaFolderItemStatus;
  /** Non-fatal per-item reason (e.g. "skipped: hidden shortcut"). */
  reason?: string | null;
};

export type MediaFolderListing = {
  ok: true;
  provider: "google_drive";
  folderId: string;
  folderName: string;
  items: MediaFolderItem[];
  warnings: string[];
};

export type MediaFolderErrorCode =
  | "invalid_url"
  | "unsafe_host"
  | "fetch_failed"
  | "provider_connection_required"
  | "not_found"
  | "empty"
  | "too_large"
  | "unsupported_type"
  | "not_implemented";

export type MediaFolderError = {
  ok: false;
  code: MediaFolderErrorCode;
  message: string;
};

export type MediaFolderInspectResult = MediaFolderListing | MediaFolderError;

export interface MediaFolderSourceAdapter {
  /** Provider identifier the adapter serves. */
  readonly provider: "google_drive";
  /**
   * Inspect a folder URL and return a listing or a typed error.
   * Must be side-effect free — no storage writes, no audit events.
   * The route is responsible for rate limiting and audit logging.
   */
  inspect(input: {
    folderUrl: string;
    signal?: AbortSignal | null;
  }): Promise<MediaFolderInspectResult>;
}

/**
 * Class form of `MediaFolderError` so adapters can `throw` and the
 * route can `instanceof` without re-declaring the union. The class
 * doubles as a tagged object — callers can read `.message` and `.code`.
 */
export class FolderSourceError extends Error {
  public readonly code: MediaFolderErrorCode;
  constructor(code: MediaFolderErrorCode, message: string) {
    super(message);
    this.name = "FolderSourceError";
    this.code = code;
  }
}

export function folderListingFromAdapter(
  adapter: MediaFolderSourceAdapter,
  input: {
    folderUrl: string;
    signal?: AbortSignal;
  },
): Promise<MediaFolderInspectResult> {
  return adapter.inspect(input);
}
