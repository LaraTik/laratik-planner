import "server-only";

import { importPublicMediaAsset, MediaPermissionError } from "./service";
import { MediaSourceError } from "./source";
import { canWriteToWorkspace, type Actor } from "@/lib/auth/policy";
import {
  FOLDER_IMPORT_CONCURRENCY,
  MAX_FOLDER_BATCH_IMPORT,
  type MediaFolderItem,
} from "./folder-sources/types";

export type FolderImportItemStatus = "imported" | "skipped" | "failed" | "canceled";

export type FolderImportItemReport = {
  id: string;
  status: FolderImportItemStatus;
  /** Original Drive filename (sanitized). Echoed back so the UI can rename on retry. */
  title?: string;
  /** Override the title the user typed in the wizard. */
  titleOverride?: string;
  /** On success. */
  assetId?: string;
  /** On failure, the existing MediaSourceError / MediaPermissionError code. */
  code?:
    | "fetch_failed"
    | "unsupported_type"
    | "missing_length"
    | "too_large"
    | "unsafe_host"
    | "provider_connection_required"
    | "invalid_url"
    | "permission_denied"
    | "canceled";
  /** On failure, the raw message for the "Copy error code" affordance. */
  message?: string;
};

export type FolderImportReport = {
  items: FolderImportItemReport[];
  imported: number;
  skipped: number;
  failed: number;
  canceled: number;
};

export type FolderImportInput = {
  actor: Actor;
  agencyId: string;
  workspaceId: string;
  folderId: string;
  items: Array<Pick<MediaFolderItem, "id" | "name"> & { titleOverride?: string }>;
  contentItemId?: string;
  visibility?: "workspace" | "agency";
  signal?: AbortSignal;
};

/**
 * Fan out `importPublicMediaAsset` across `FOLDER_IMPORT_CONCURRENCY`
 * workers. Each item runs independently — there is no whole-batch
 * abort. A failed/skipped/canceled item never poisons the rest.
 *
 * The single-file service already handles:
 *   - storage-intent abort on failure (no orphan rows)
 *   - permission errors (MediaPermissionError → caught here)
 *   - provider errors (MediaSourceError → caught here)
 *   - SHA-256 capture for duplicate detection
 */
export async function runMediaFolderBatch(input: FolderImportInput): Promise<FolderImportReport> {
  if (input.items.length === 0) {
    return { items: [], imported: 0, skipped: 0, failed: 0, canceled: 0 };
  }
  if (input.items.length > MAX_FOLDER_BATCH_IMPORT) {
    throw new Error(`batch_too_large: ${input.items.length} > ${MAX_FOLDER_BATCH_IMPORT}`);
  }
  if (!(await canWriteToWorkspace(input.actor, input.workspaceId))) {
    // The route already checked write authority; this is defense in
    // depth so a direct service call from a future script can't bypass.
    throw new MediaPermissionError("Read-only users cannot import media.");
  }

  const results: FolderImportItemReport[] = new Array(input.items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < input.items.length) {
      if (input.signal?.aborted) {
        // Mark remaining slots as canceled so the report stays coherent.
        while (cursor < input.items.length) {
          const i = cursor++;
          results[i] = {
            id: input.items[i]!.id,
            title: input.items[i]!.titleOverride ?? input.items[i]!.name,
            status: "canceled",
            code: "canceled",
          };
        }
        return;
      }
      const index = cursor++;
      const item = input.items[index]!;
      results[index] = await importOne(input, item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(FOLDER_IMPORT_CONCURRENCY, input.items.length) }, worker),
  );

  const imported = results.filter((r) => r.status === "imported").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const canceled = results.filter((r) => r.status === "canceled").length;
  return { items: results, imported, skipped, failed, canceled };
}

async function importOne(
  input: FolderImportInput,
  item: { id: string; name: string; titleOverride?: string },
): Promise<FolderImportItemReport> {
  const title = item.titleOverride ?? item.name;
  if (input.signal?.aborted) {
    return { id: item.id, title, status: "canceled", code: "canceled" };
  }
  try {
    const asset = await importPublicMediaAsset({
      actor: input.actor,
      agencyId: input.agencyId,
      workspaceId: input.workspaceId,
      url: `https://drive.google.com/file/d/${encodeURIComponent(item.id)}/view?usp=drivesdk`,
      ...(item.titleOverride ? { title } : {}),
      ...(input.contentItemId ? { contentItemId: input.contentItemId } : {}),
      ...(input.visibility ? { visibility: input.visibility } : {}),
    });
    return { id: item.id, title, status: "imported", assetId: asset.id };
  } catch (error) {
    if (error instanceof MediaPermissionError) {
      return {
        id: item.id,
        title,
        status: "failed",
        code: "permission_denied",
        message: error.message,
      };
    }
    if (error instanceof MediaSourceError) {
      return {
        id: item.id,
        title,
        status: "failed",
        code: error.code,
        message: error.message,
      };
    }
    return {
      id: item.id,
      title,
      status: "failed",
      code: "fetch_failed",
      message: error instanceof Error ? error.message : "Import failed.",
    };
  }
}
