import "server-only";

import { inspectExternalMediaUrl } from "../contract";

import { GoogleDriveHtmlAdapter } from "./drive-html";
import { GoogleDriveServiceAccountAdapter } from "./drive-service-account";
import {
  FolderSourceError,
  type MediaFolderInspectResult,
  type MediaFolderSourceAdapter,
} from "./types";

/**
 * Single entry point used by the route. Returns the right adapter for
 * the provider; falls through to `not_implemented` for unknown providers.
 *
 * v1 always returns the HTML adapter. The service-account adapter is
 * wired in here only when `GOOGLE_DRIVE_FOLDER_ADAPTER=service-account`
 * is set, so the seam is real without forcing the operator to set up
 * a service account today.
 */
export function selectMediaFolderAdapter(): MediaFolderSourceAdapter {
  const override = process.env.GOOGLE_DRIVE_FOLDER_ADAPTER;
  if (override === "service-account") {
    return new GoogleDriveServiceAccountAdapter();
  }
  return new GoogleDriveHtmlAdapter();
}

export async function inspectMediaFolder(input: {
  folderUrl: string;
  signal?: AbortSignal | null;
  adapter?: MediaFolderSourceAdapter;
}): Promise<MediaFolderInspectResult> {
  const inspected = inspectExternalMediaUrl(input.folderUrl);
  if (!inspected.ok) {
    return {
      ok: false,
      code: "invalid_url",
      message: "This is not a valid folder link.",
    };
  }
  if (inspected.kind !== "folder" || inspected.provider !== "google_drive") {
    return {
      ok: false,
      code: "invalid_url",
      message: "Only Google Drive folder links are supported in this build.",
    };
  }
  const adapter = input.adapter ?? selectMediaFolderAdapter();
  try {
    const inspectInput: { folderUrl: string; signal?: AbortSignal } = {
      folderUrl: inspected.url,
    };
    if (input.signal) inspectInput.signal = input.signal;
    return await adapter.inspect(inspectInput);
  } catch (error) {
    if (error instanceof FolderSourceError) {
      return { ok: false, code: error.code, message: error.message };
    }
    return {
      ok: false,
      code: "fetch_failed",
      message: "The folder could not be browsed right now. Please retry.",
    };
  }
}

export { FolderSourceError };
export type { MediaFolderInspectResult, MediaFolderSourceAdapter } from "./types";
