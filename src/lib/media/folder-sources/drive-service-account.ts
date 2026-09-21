import "server-only";

import {
  FolderSourceError,
  type MediaFolderInspectResult,
  type MediaFolderSourceAdapter,
} from "./types";

/**
 * Future-seam adapter for permissioned Drive folders via a Google Cloud
 * service account. v1 does not enable this — it ships as a stub so the
 * router has a stable second implementation point and so the contract
 * stays honest.
 *
 * To enable: provision a service account JSON via
 * `GOOGLE_SERVICE_ACCOUNT_JSON`, share the folder with the SA email,
 * and select this adapter from `folder-sources/index.ts` when the env
 * var is set.
 */
export class GoogleDriveServiceAccountAdapter implements MediaFolderSourceAdapter {
  readonly provider = "google_drive" as const;

  async inspect(): Promise<MediaFolderInspectResult> {
    throw new FolderSourceError(
      "not_implemented",
      "Service-account Drive folder browsing is not enabled in this build.",
    );
  }
}
