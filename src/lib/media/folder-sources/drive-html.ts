import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { parseDriveFolderHtml } from "./drive-html-parser";
import {
  FOLDER_IMPORT_TIMEOUT_MS,
  MAX_FOLDER_ITEMS,
  FolderSourceError,
  type MediaFolderItem,
  type MediaFolderInspectResult,
  type MediaFolderItemStatus,
  type MediaFolderSourceAdapter,
} from "./types";

/**
 * v1 adapter: scrape the Drive folder HTML page.
 *
 * Works for any folder set to "Anyone with the link can view".
 * Private folders return 401/403 → we surface `provider_connection_required`
 * with a hint that the same fix used by the single-file flow applies.
 *
 * The adapter reuses the same safety guarantees as the single-file
 * `fetchPublicMedia` (source.ts):
 *   - HTTPS only
 *   - hosts allowlisted
 *   - no private IPs (we cannot test drive.google.com here because it
 *     resolves to multiple public IPs, so we accept any public IP).
 *
 * Per-item preflight: the adapter runs a bounded HEAD-equivalent fetch
 * against the canonical download URL (`drive.usercontent.google.com`)
 * to mark items that 401/403. This is the cheapest signal we can get
 * before the user clicks Import; the per-item import in `folder-import.ts`
 * still does the full signature check before storage.
 */

type Lookup = typeof lookup;

function isPrivateIp(address: string): boolean {
  if (isIP(address) === 4) {
    const octets = address.split(".").map(Number);
    const [a, b] = octets;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b !== undefined && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && b !== undefined && b >= 18 && b <= 19) ||
      (a !== undefined && a >= 224)
    );
  }
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9")) return true;
  if (normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIp(mapped[1]!) : false;
}

async function assertSafeHost(host: string, dnsLookup: Lookup = lookup): Promise<void> {
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new FolderSourceError("unsafe_host", "This host is not safe to fetch.");
  }
  if (isIP(host)) {
    if (isPrivateIp(host))
      throw new FolderSourceError("unsafe_host", "This host is not safe to fetch.");
    return;
  }
  const addresses = await dnsLookup(host, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new FolderSourceError("unsafe_host", "This host is not safe to fetch.");
  }
}

const FOLDER_HOSTS = new Set([
  "drive.google.com",
  "docs.google.com",
  "drive.usercontent.google.com",
]);

export class GoogleDriveHtmlAdapter implements MediaFolderSourceAdapter {
  readonly provider = "google_drive" as const;

  constructor(private readonly deps: { fetchImpl?: typeof fetch; dnsLookup?: Lookup } = {}) {}

  async inspect(input: {
    folderUrl: string;
    signal?: AbortSignal | null;
  }): Promise<MediaFolderInspectResult> {
    const fetcher = this.deps.fetchImpl ?? fetch;
    const dnsLookup = this.deps.dnsLookup;

    let parsed: URL;
    try {
      parsed = new URL(input.folderUrl);
    } catch {
      return err("invalid_url", "The folder link is not a valid URL.");
    }
    if (parsed.protocol !== "https:") {
      return err("invalid_url", "Only HTTPS folder links are supported.");
    }
    const host = parsed.hostname.toLowerCase();
    if (!FOLDER_HOSTS.has(host)) {
      return err("invalid_url", "Only Google Drive folder links are supported.");
    }

    // Folder id is the last non-empty path segment after /folders/ or
    // /drive/u/<int>/folders/. We re-derive it from the URL so the
    // adapter is robust to callers that pass the URL but not the id.
    const folderId = extractFolderId(parsed);
    if (!folderId) {
      return err("invalid_url", "This is not a Google Drive folder link.");
    }

    try {
      await assertSafeHost(host, dnsLookup);
    } catch (error) {
      if (error instanceof FolderSourceError) {
        return err(error.code, error.message);
      }
      return err("unsafe_host", "This host is not safe to fetch.");
    }

    const folderPageUrl = `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;

    let response: Response;
    try {
      response = await fetcher(folderPageUrl, {
        method: "GET",
        redirect: "follow",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent":
            "Mozilla/5.0 (compatible; laratik-planner-folder-import/1.0; +https://laratik.com)",
        },
        signal: input.signal ?? AbortSignal.timeout(FOLDER_IMPORT_TIMEOUT_MS),
      });
    } catch {
      return err("fetch_failed", "The folder page could not be reached securely.");
    }

    if (response.status === 401 || response.status === 403) {
      return err(
        "provider_connection_required",
        "Connect Google Drive or make this folder 'Anyone with the link can view'.",
      );
    }
    if (response.status === 404) {
      return err("not_found", "This folder does not exist or has been deleted.");
    }
    if (!response.ok || !response.body) {
      return err("fetch_failed", "The folder page could not be reached securely.");
    }

    const html = await response.text();
    const { items: parsedItems, warnings } = parseDriveFolderHtml(html);

    if (parsedItems.length === 0) {
      if (warnings.includes("no_entries_found")) {
        // Could be an empty folder, OR a markup change broke the parser.
        // Distinguish by looking at the raw HTML for any data-id markers.
        const anyIds = /\bdata-id="[A-Za-z0-9_-]{20,}"/.test(html);
        if (!anyIds) {
          return err("empty", "This Drive folder has no importable files.");
        }
        // Markup shift — surface as unsupported so operators notice.
        return err(
          "unsupported_type",
          "We could not list this folder. The Drive markup may have changed; please retry later.",
        );
      }
      // Parse yielded only subfolders / Drive-native / etc.
      return err(
        "unsupported_type",
        "This folder contains no files that can be imported directly.",
      );
    }

    // Per-item preflight. We mark items that 401/403 with
    // `provider_connection_required` so the wizard can warn up-front.
    // Each preflight is bounded with a 4-way concurrency cap.
    const marked = await this.preflightItems(parsedItems, {
      fetcher,
      signal: input.signal ?? null,
    });

    if (marked.length > MAX_FOLDER_ITEMS) {
      return err(
        "too_large",
        `This folder has ${marked.length} items; the limit is ${MAX_FOLDER_ITEMS}.`,
      );
    }

    return {
      ok: true,
      provider: "google_drive",
      folderId,
      // Folder name is not reliably extractable from the public HTML;
      // we show the folder id and let the UI surface the URL.
      folderName: folderId,
      items: marked,
      warnings,
    };
  }

  private async preflightItems(
    items: MediaFolderItem[],
    opts: { fetcher: typeof fetch; signal?: AbortSignal | null },
  ): Promise<MediaFolderItem[]> {
    const concurrency = 4;
    const results: MediaFolderItem[] = new Array(items.length);
    let cursor = 0;

    const worker = async () => {
      while (cursor < items.length) {
        const index = cursor++;
        const item = items[index]!;
        const status = await this.preflightOne(item, opts);
        results[index] = { ...item, status };
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return results;
  }

  private async preflightOne(
    item: MediaFolderItem,
    opts: { fetcher: typeof fetch; signal?: AbortSignal | null },
  ): Promise<MediaFolderItemStatus> {
    // Preflight hits `drive.usercontent.google.com/download?id=<id>` with
    // a HEAD; we abort the body. The role of this preflight is narrow:
    // detect folders that aren't actually publicly downloadable, so the
    // wizard can surface the friendly "Connect Drive or make this folder
    // 'Anyone with the link can view'" message up front. It is NOT a
    // classification gate for whether the file is importable — the
    // single-file import path validates mime + signature on the real
    // download response and emits a precise error code if anything
    // actually goes wrong.
    //
    // Concretely:
    //   - 401 / 403 → the folder or file isn't publicly accessible.
    //     Mark `provider_connection_required` so the wizard surfaces the
    //     "needs Drive connection" hint.
    //   - 30x redirect to a sign-in wall → same as above. Common on
    //     private folders where Drive serves an HTML sign-in page
    //     instead of the file.
    //   - 2xx → file is publicly downloadable; let the wizard pre-select
    //     it and the actual import flow do the full validation.
    //   - Any other status (4xx other than 401/403, 5xx, or a network
    //     exception) → leave as `importable` so the user can still try.
    //     Marking these as `unsupported` would hide legitimate files
    //     behind a transient signal — the import endpoint will reject
    //     them with the right code if they're truly broken.
    try {
      const url = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(
        item.id,
      )}&export=download`;
      const preflightSignal = opts.signal ?? AbortSignal.timeout(FOLDER_IMPORT_TIMEOUT_MS);
      const response = await opts.fetcher(url, {
        method: "HEAD",
        redirect: "manual",
        signal: preflightSignal,
      });
      if (response.status === 401 || response.status === 403) return "provider_connection_required";
      if (response.status >= 200 && response.status < 300) return "importable";
      // 30x redirect to a sign-in wall is common — treat as connection-required.
      if (response.status >= 300 && response.status < 400) return "provider_connection_required";
      // Any other status (404, 429, 5xx, …) is treated as a transient
      // signal. The real import GET will validate properly.
      return "importable";
    } catch {
      // Network errors (DNS, connection reset, etc.) are transient too.
      // Same rationale as above: don't hide the file behind a hard
      // "unsupported" verdict the user can't override.
      return "importable";
    }
  }
}

export function extractFolderId(parsed: URL): string | null {
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments[0] === "folders" && segments[1]) return segments[1];
  if (segments[0] === "drive" && segments[1] === "folders" && segments[2]) return segments[2];
  if (
    segments[0] === "drive" &&
    segments[1] === "u" &&
    /^\d+$/.test(segments[2] ?? "") &&
    segments[3] === "folders" &&
    segments[4]
  ) {
    return segments[4];
  }
  // Some share links carry `?id=<id>` with no path indicator. The caller
  // is responsible for re-validating that the original URL was a folder URL.
  return null;
}

function err(
  code: import("./types").MediaFolderErrorCode,
  message: string,
): MediaFolderInspectResult {
  return { ok: false, code, message };
}
