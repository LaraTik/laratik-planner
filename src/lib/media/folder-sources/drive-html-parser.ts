/**
 * Pure parser for `https://drive.google.com/drive/folders/<id>` HTML.
 *
 * Drive's folder page is a large HTML document with three useful anchors:
 *
 *   1. `<div ... data-id="<fileId>">` (or modern `<tr ... data-id="<fileId>">`)
 *      blocks. The data-id is the canonical file id and is stable across
 *      versions. The nearest `aria-label` carries the filename.
 *
 *   2. `AF_initDataCallback(...)` JSON blobs near the top of the page
 *      carry the full file list as nested arrays. The blob shape has
 *      shifted across Drive versions:
 *
 *        - **Legacy** (pre-2024): `[id, name, mimeType, size, hash, ...]`
 *          OR `[id, mimeType, name, size, hash, ...]`.
 *        - **Modern** (post-2024): `[null, id], null, null, null, mime, ...`
 *          with the file metadata (including filename + size) buried inside
 *          a deeply-nested "row meta" array.
 *
 *      This parser walks both shapes and combines the best signal for
 *      each entry: ID + mime from the AF block (when parseable), name +
 *      size from the data-id + aria-label scrape.
 *
 *   3. Per-row `aria-label="Size: 2,2 MB"` on the size cell — used only
 *      as a fallback when neither AF nor size-from-meta yield a value.
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

import { contentTypeFromFilename } from "../contract";
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

/**
 * Stable 2.0 era Drive folders used `[aria-label="..."]` next to the
 * thumbnail; modern Drive uses `[data-id]` blocks. We try both.
 */
const DATA_ID_PATTERN = /data-id="([A-Za-z0-9_-]{20,})"/g;
const ARIA_LABEL_PATTERN = /aria-label="([^"]{1,160})"/g;

/**
 * Modern Drive AF_initDataCallback row shape (post-2024):
 *   `[null, "<fileId>"], null, null, null, "<mime>", null, ...`
 *
 * We anchor on the `[null,"<id>"]` opener and read the mime from the
 * fixed offset (index 4 after the opener). This is more reliable than
 * trying to JSON.parse the surrounding JS, because the surrounding
 * context is plain text with embedded `\u003d`-style escapes that
 * confuse generic JSON parsers.
 *
 * The mime field accepts the IANA "type/subtype" shape with a tolerant
 * charset so future subtypes (e.g. `image/avif`) don't need a parser
 * change.
 */
const MODERN_ROW_PATTERN =
  /\[null,"([A-Za-z0-9_-]{20,})"\],[a-z]+,[a-z]+,[a-z]+,"([a-z]+\/[a-z0-9.+\-]{1,80})"/g;

/**
 * Legacy Drive AF_initDataCallback row shape (pre-2024):
 *   `["<fileId>", "<a>", "<b>", ...]`
 * where one of `<a>` / `<b>` contains "/" (the mime) and the other is the
 * filename. Anchored on the leading string id so we don't match the
 * modern shape.
 */
const LEGACY_ROW_PATTERN =
  /(?<!\[null,)"([A-Za-z0-9_-]{20,})"\s*,\s*"([^"\\]{1,200})"\s*,\s*"([^"\\]{1,200})"\s*,/g;

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

  const { entries, warnings: extractWarnings } = extractEntries(html);

  if (entries.length === 0) {
    return { items: [], warnings: [...extractWarnings, "no_entries_found"] };
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
  // Drive sometimes lists files with `application/octet-stream` when it
  // can't sniff the type itself (especially for items uploaded via the
  // mobile app, or files renamed away from their original extension).
  // Fall back to the filename extension so the wizard displays the
  // correct kind badge (image vs video vs document) and the import
  // route doesn't have to second-guess.
  const mimeType = pickMimeType(entry.mimeType, entry.name);
  const status: MediaFolderItemStatus = "importable";
  return {
    id: entry.id,
    name: entry.name,
    mimeType,
    sizeBytes: entry.sizeBytes,
    thumbnailUrl: `https://drive.google.com/thumbnail?id=${encodeURIComponent(entry.id)}&sz=w120`,
    sourceUrl: `https://drive.google.com/file/d/${encodeURIComponent(entry.id)}/view?usp=drivesdk`,
    status,
    reason: null,
  };
}

/**
 * Pick the best mime type to display in the listing. Prefers an explicit
 * listing mime (when it's not the generic `application/octet-stream`),
 * falls back to a filename-extension lookup. The import path validates
 * the real bytes via `validateMediaSignature`, so a misleading listing
 * mime is a display problem, never a security one.
 */
function pickMimeType(listingMime: string | null, name: string): string {
  if (
    listingMime &&
    listingMime !== "application/octet-stream" &&
    !listingMime.startsWith("application/octet-stream;")
  ) {
    return listingMime;
  }
  const fromName = contentTypeFromFilename(name);
  if (fromName) return fromName;
  return listingMime ?? "application/octet-stream";
}

/**
 * Pull entries from the HTML. We try the modern AF_initDataCallback row
 * shape first (Drive's post-2024 default), then the legacy shape (older
 * builds), then fall back to the data-id + aria-label scrape that handles
 * markup-only pages.
 *
 * Entries are merged by file id, with later sources filling in fields
 * the earlier sources missed. This means the modern AF block supplies
 * the mime when it's available, and the markup scrape always supplies
 * the human-friendly filename.
 */
function extractEntries(html: string): { entries: RawEntry[]; warnings: string[] } {
  const warnings: string[] = [];
  const merged = new Map<string, RawEntry>();

  // 1. Modern AF row shape: ID + mime at a known offset.
  const modernEntries = extractEntriesFromModernAf(html);
  if (modernEntries.length > 0) {
    for (const entry of modernEntries) merged.set(entry.id, entry);
  } else {
    // 2. Legacy AF row shape: [id, name, mime, ...] / [id, mime, name, ...].
    const legacyEntries = extractEntriesFromLegacyAf(html);
    if (legacyEntries.length > 0) {
      for (const entry of legacyEntries) merged.set(entry.id, entry);
    } else {
      warnings.push("af_init_data_unparsed");
    }
  }

  // 3. Markup scrape: ID + filename + (best-effort) size.
  const markupEntries = extractEntriesFromMarkup(html);
  for (const entry of markupEntries) {
    const existing = merged.get(entry.id);
    if (!existing) {
      merged.set(entry.id, entry);
      continue;
    }
    merged.set(entry.id, mergeEntries(existing, entry));
  }

  return { entries: [...merged.values()], warnings };
}

/**
 * Modern Drive row shape: `[null, "<id>"], null, null, null, "<mime>", ...`
 * Returns entries with id + mime populated, name + size left null for
 * the markup scrape to fill in.
 */
function extractEntriesFromModernAf(html: string): RawEntry[] {
  const entries: RawEntry[] = [];
  const seen = new Set<string>();
  MODERN_ROW_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MODERN_ROW_PATTERN.exec(html)) !== null) {
    const id = match[1] ?? "";
    const mime = match[2] ?? "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    entries.push({ id, name: id, mimeType: mime, sizeBytes: null });
    if (entries.length >= MAX_FOLDER_ITEMS) break;
  }
  return entries;
}

/**
 * Legacy AF row shape. Tries both `[id, name, mime, ...]` and
 * `[id, mime, name, ...]` orderings by detecting which of the second
 * and third fields contains "/" (the mime).
 */
function extractEntriesFromLegacyAf(html: string): RawEntry[] {
  const entries: RawEntry[] = [];
  const seen = new Set<string>();
  LEGACY_ROW_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LEGACY_ROW_PATTERN.exec(html)) !== null) {
    const id = match[1] ?? "";
    const second = match[2] ?? "";
    const third = match[3] ?? "";
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
    if (entries.length >= MAX_FOLDER_ITEMS) break;
  }
  return entries;
}

/**
 * Merge a markup-scrape entry into an AF-derived one. AF wins for mime
 * (it's the authoritative source); markup wins for name (it's the
 * human-friendly label); size comes from whichever side has it.
 */
function mergeEntries(af: RawEntry, markup: RawEntry): RawEntry {
  return {
    id: af.id,
    name: markup.name && markup.name !== markup.id ? markup.name : af.name,
    mimeType: af.mimeType ?? markup.mimeType,
    sizeBytes: af.sizeBytes ?? markup.sizeBytes,
  };
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
    let chosenSizeLabel: string | undefined;
    let bestLabelDistance = Number.POSITIVE_INFINITY;
    let bestSizeDistance = Number.POSITIVE_INFINITY;
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
      // Drive puts the filename in a label near the row's data-id
      // and the size in a separate "Size: <n> MB" label. We track
      // them as independent nearest-neighbour lookups so a "Size: …"
      // label further from the data-id than the filename label can
      // still win for the size slot.
      if (label.startsWith("Size:")) {
        if (distance < bestSizeDistance) {
          bestSizeDistance = distance;
          chosenSizeLabel = label;
        }
      } else if (distance < bestLabelDistance) {
        bestLabelDistance = distance;
        chosenLabel = label;
      }
    }
    entries.push({
      id,
      name: decodeHtmlEntities(chosenLabel ?? id),
      mimeType: null,
      sizeBytes: chosenSizeLabel ? parseSizeLabel(chosenSizeLabel) : null,
    });
    if (entries.length >= MAX_FOLDER_ITEMS) break;
  }
  return entries;
}

/**
 * Parse a "Size: 2,2 MB\nStorage used: 2,2 MB" aria-label into bytes.
 * Returns null when the value can't be parsed — better to leave the
 * size unknown than to display a wrong number. Drive uses European
 * decimal notation (comma) in non-en locales, so we accept both.
 */
function parseSizeLabel(label: string): number | null {
  // Strip the "Size:" prefix and any "Storage used:" tail so we only
  // look at the first measurement.
  const firstLine = label.split(/\r?\n/, 1)[0] ?? label;
  const match = firstLine.match(/([\d.,]+)\s*(B|KB|MB|GB|TB)\b/i);
  if (!match) return null;
  const raw = match[1] ?? "";
  // Normalise European "2,2" → "2.2" while keeping US "2.2" intact.
  const normalized = /,\d{1,2}$/.test(raw) ? raw.replace(",", ".") : raw.replace(/,/g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  const unit = (match[2] ?? "").toUpperCase();
  const multiplier =
    unit === "B"
      ? 1
      : unit === "KB"
        ? 1024
        : unit === "MB"
          ? 1024 * 1024
          : unit === "GB"
            ? 1024 * 1024 * 1024
            : unit === "TB"
              ? 1024 * 1024 * 1024 * 1024
              : 0;
  if (multiplier === 0) return null;
  const bytes = Math.round(value * multiplier);
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : null;
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
