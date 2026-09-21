/**
 * Pure parser for `https://drive.google.com/drive/folders/<id>` HTML.
 *
 * Drive's folder page is a large HTML document with two useful anchors:
 *
 *   1. `<div ... data-id="<fileId>">` blocks scattered through the body.
 *      The data-id is the canonical file id and is stable across versions.
 *
 *   2. `AF_initDataCallback(...)` JSON blobs near the top of the page
 *      carry the full file list as an array of arrays. The blob shape is
 *      stable but the index of the "files" array inside it has shifted
 *      historically; we walk a couple of common shapes.
 *
 * This parser does not execute anything — it only matches anchored regex
 * patterns on the bounded HTML prefix. It's deliberately tolerant of
 * inline `<script>`, `<!-- -->`, and minor markup changes: if no entries
 * are found, the adapter can surface `unsupported_type` rather than
 * silently swallowing the failure.
 *
 * Drive-only shortcuts and Drive-native formats (Docs/Sheets/Slides/Forms)
 * are filtered out — they aren't direct downloads. Subfolders are skipped
 * and reported via the returned `warnings`.
 */

import { MAX_FOLDER_ITEMS, type MediaFolderItem, type MediaFolderItemStatus } from "./types";

/** Common Drive-only / native MIME types we never import directly. */
const DRIVE_NATIVE_MIME = new Set<string>([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.form",
  "application/vnd.google-apps.drawing",
  "application/vnd.google-apps.site",
  "application/vnd.google-apps.folder",
  "application/vnd.google-apps.shortcut",
  "application/vnd.google-apps.script",
]);

/** File extension helpers for shortcut / native detection. */
const SHORTCUT_EXT = ".shortcut";
const FOLDER_EXT = ".folder";

const ENTRY_MIME = new Set<string>([
  ...DRIVE_NATIVE_MIME,
  // Conservative allowlist — anything else gets we DNAT-check the extension.
]);

/**
 * Stable 2.0 era Drive folders used `[aria-label="..."]` next to the
 * thumbnail; modern Drive uses `[data-id]` blocks. We try both.
 */
const DATA_ID_PATTERN = /data-id="([A-Za-z0-9_-]{20,})"/g;
const ARIA_LABEL_PATTERN = /aria-label="([^"]{1,160})"/g;

type RawEntry = {
  id: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type ParseFolderHtmlResult = {
  items: MediaFolderItem[];
  warnings: string[];
};

export function parseDriveFolderHtml(html: string): ParseFolderHtmlResult {
  const warnings: string[] = [];

  const entries = extractEntries(html);

  if (entries.length === 0) {
    return { items: [], warnings: ["no_entries_found"] };
  }

  // Drop sub-folders and Drive-native types up front; record why.
  const items: MediaFolderItem[] = [];
  let skippedFolders = 0;
  let skippedNative = 0;
  let skippedShortcut = 0;
  for (const entry of entries) {
    const lowerName = entry.name.toLowerCase();
    // Drive encodes sub-folders in three different ways: the .folder
    // extension on the entry name, the .folder mime, or the
    // application/vnd.google-apps.folder mime. All three should
    // contribute to the same warning so the operator's audit is
    // accurate.
    const mimeIsFolder = entry.mimeType === "application/vnd.google-apps.folder";
    if (lowerName.endsWith(FOLDER_EXT) || mimeIsFolder) {
      skippedFolders += 1;
      continue;
    }
    if (lowerName.endsWith(SHORTCUT_EXT)) {
      skippedShortcut += 1;
      continue;
    }
    if (entry.mimeType && DRIVE_NATIVE_MIME.has(entry.mimeType)) {
      skippedNative += 1;
      continue;
    }
    items.push(toMediaFolderItem(entry));
    if (items.length >= MAX_FOLDER_ITEMS) {
      warnings.push("listing_truncated");
      break;
    }
  }

  if (skippedFolders > 0) warnings.push("subfolders_skipped");
  if (skippedNative > 0) warnings.push("native_apps_skipped");
  if (skippedShortcut > 0) warnings.push("shortcuts_skipped");

  items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return { items, warnings };
}

function toMediaFolderItem(entry: RawEntry): MediaFolderItem {
  const status: MediaFolderItemStatus = "importable";
  return {
    id: entry.id,
    name: entry.name,
    mimeType: entry.mimeType ?? "application/octet-stream",
    sizeBytes: entry.sizeBytes,
    thumbnailUrl: `https://drive.google.com/thumbnail?id=${encodeURIComponent(entry.id)}&sz=w120`,
    sourceUrl: `https://drive.google.com/file/d/${encodeURIComponent(entry.id)}/view?usp=drivesdk`,
    status,
    reason: null,
  };
}

/**
 * Pull entries from the HTML. We try the AF_initDataCallback JSON
 * first (more complete + structured); fall back to the data-id +
 * aria-label scrape if it's missing or malformed.
 */
function extractEntries(html: string): RawEntry[] {
  const fromJson = extractEntriesFromAfInit(html);
  if (fromJson.length > 0) return fromJson;
  return extractEntriesFromMarkup(html);
}

function extractEntriesFromAfInit(html: string): RawEntry[] {
  const entries: RawEntry[] = [];
  const seen = new Set<string>();
  // AF_initDataCallback({key: 'ds:0', ... data: [...] ...); — we accept any
  // shape that contains a JSON-ish array, then walk known fields. Drive
  // re-rolls these keys often so we lean on field names instead of paths.
  const callbackRegex = /AF_initDataCallback\s*\(\s*\{[\s\S]*?\}\s*\)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = callbackRegex.exec(html)) !== null) {
    const block = match[0];
    if (!block) continue;
    // Drive encodes each file row as one of:
    //   [id, name, mimeType, size, hash, ...] — most common
    //   [id, mimeType, name, size, hash, ...] — older builds
    // Both share the property that exactly ONE of the second and
    // third strings contains a "/" (the mime). Use that to decide
    // which is which.
    const rowRegex =
      /\[?\s*"([A-Za-z0-9_-]{20,})"\s*,\s*"([^"\\]{1,200})"\s*,\s*"([^"\\]{1,200})"\s*,/g;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRegex.exec(block)) !== null) {
      const id = rowMatch[1] ?? "";
      const second = rowMatch[2] ?? "";
      const third = rowMatch[3] ?? "";
      if (!id || seen.has(id) || !second) continue;
      let name: string;
      let mimeType: string | null;
      if (second.includes("/")) {
        // [id, mime, name, ...]
        name = third || second;
        mimeType = second;
      } else if (third.includes("/")) {
        // [id, name, mime, ...]
        name = second;
        mimeType = third || null;
      } else {
        // Neither is a mime — keep both as the name, no mime.
        name = second;
        mimeType = null;
      }
      seen.add(id);
      entries.push({
        id,
        name: decodeHtmlEntities(name),
        mimeType,
        sizeBytes: null,
      });
      if (entries.length >= MAX_FOLDER_ITEMS) return entries;
    }
  }
  return entries;
}

function extractEntriesFromMarkup(html: string): RawEntry[] {
  // Drive's HTML anchors are not 1:1 with data-ids because every
  // list item has many `[data-id="..."]` attributes (one per row,
  // one per icon, etc.). We bound the search for each data-id to its
  // own row — from just after the previous row's data-id (skipping
  // 100 chars of trailing markup) up to right before the next
  // row's data-id (stopping 50 chars early). This prevents cross-row
  // label leakage.
  const seen = new Set<string>();
  const entries: RawEntry[] = [];

  const dataIdMatches = [...html.matchAll(DATA_ID_PATTERN)];
  for (let i = 0; i < dataIdMatches.length; i += 1) {
    const idMatch = dataIdMatches[i]!;
    const id = idMatch[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const idAt = idMatch.index ?? 0;
    const nextIdAt = dataIdMatches[i + 1]?.index ?? html.length;
    // Walk the aria-label matches document-wide; only keep those that
    // belong to THIS row. Drive's modern markup places the label after
    // the data-id; older markup places it before. We accept either,
    // but require the label to be the nearest label to our data-id
    // (no other data-id between us and the label).
    const labelMatches = [...html.matchAll(ARIA_LABEL_PATTERN)];
    let chosenLabel: string | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const labelMatch of labelMatches) {
      const label = labelMatch[1] ?? "";
      if (!label || label === "select" || label === "selected") continue;
      const labelAt = labelMatch.index ?? 0;
      // Modern Drive markup places the aria-label AFTER the row's
      // data-id (inside the row's <div>). Older markup puts it before
      // — for that we allow a small backward tolerance (30 chars) so
      // a label that sits just before our data-id is still considered
      // ours. Anything further back belongs to a previous row.
      if (labelAt + 30 < idAt) continue;
      // Reject labels whose start lies past the next data-id —
      // those belong to the next row.
      if (labelAt >= nextIdAt) continue;
      // Reject labels that come after a different data-id that
      // appeared between this row's data-id and the label (would
      // belong to a later row). Skip past the leading data-id that
      // we own so we don't match ourselves.
      const searchStart = Math.min(idAt, labelAt);
      const searchEnd = Math.max(idAt, labelAt);
      const between = html.slice(searchStart, searchEnd);
      const afterOwnId = between.indexOf('"', between.indexOf('data-id="')) + 1;
      const tail = afterOwnId >= 1 ? between.slice(afterOwnId) : between;
      const otherId = tail.match(/data-id="([A-Za-z0-9_-]{20,})"/);
      if (otherId && otherId.index !== undefined) continue;
      const distance = Math.abs(labelAt - idAt);
      if (distance < bestDistance) {
        bestDistance = distance;
        chosenLabel = label;
      }
    }
    entries.push({
      id,
      name: decodeHtmlEntities(chosenLabel ?? id),
      mimeType: null,
      sizeBytes: null,
    });
    if (entries.length >= MAX_FOLDER_ITEMS) break;
  }
  return entries;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// Surface the constant so adapters can reference it.
export { MAX_FOLDER_ITEMS, ENTRY_MIME };
