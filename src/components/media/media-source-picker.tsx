"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { MediaLinkImporter } from "./media-link-importer";
import { MediaUploadForm, type MediaUploadResult } from "./media-upload-form";

/**
 * One media-intake surface with interchangeable source adapters. The tabs
 * only choose the source UI; validation, destination, storage, and catalog
 * registration remain provider-neutral underneath.
 */
export function MediaSourcePicker({
  workspaceOptions,
  folderOptionsByWorkspace,
  initialSource = "device",
  contentItemId,
  defaultFolderId,
  onAssetReady,
}: {
  workspaceOptions: { id: string; name: string }[];
  folderOptionsByWorkspace: Record<
    string,
    { id: string; name: string; parentId?: string | null }[]
  >;
  initialSource?: "device" | "link";
  contentItemId?: string;
  /**
   * Folder to preselect in the device-upload dropdown. The link importer
   * doesn't surface a folder picker — the server resolves the folder from
   * `contentItemId` — so this prop is intentionally forwarded only to the
   * device child. When omitted, the dropdown defaults to "Unfiled", which
   * is the same UX as before this prop existed.
   */
  defaultFolderId?: string;
  /**
   * Fired by every source (device upload, single-file link, folder
   * batch) once an asset has finished registering. Carries the canonical
   * `MediaUploadResult` shape so the parent can add the new asset to its
   * in-memory list and pre-select it without waiting for a full page
   * refresh. The link flow historically only called `router.refresh()`,
   * which left parents whose picker reads from `useState` with a stale
   * asset list until the user hard-refreshed; this prop closes that gap.
   */
  onAssetReady?: (asset: MediaUploadResult) => void;
}) {
  const t = useLocaleT();
  return (
    <section aria-labelledby="media-add-heading" data-testid="media-source-picker">
      <div className="mb-3">
        <h2 id="media-add-heading" className="text-title-card text-fg-primary font-semibold">
          {t("media.addMediaTitle")}
        </h2>
        <p className="text-body text-fg-secondary mt-1 max-w-3xl">
          {t("media.addMediaDescription")}
        </p>
      </div>
      <Tabs defaultValue={initialSource}>
        <TabsList
          aria-label={t("media.addMediaTitle")}
          className="h-auto w-full flex-wrap sm:w-auto"
        >
          <TabsTrigger value="device" className="min-h-11 flex-1 sm:flex-none">
            {t("media.sourceDevice")}
          </TabsTrigger>
          <TabsTrigger value="link" className="min-h-11 flex-1 sm:flex-none">
            {t("media.sourceLink")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="device">
          <MediaUploadForm
            workspaceOptions={workspaceOptions}
            folderOptionsByWorkspace={folderOptionsByWorkspace}
            {...(contentItemId ? { contentItemId } : {})}
            {...(defaultFolderId ? { defaultFolderId } : {})}
            {...(onAssetReady ? { onAssetReady } : {})}
          />
        </TabsContent>
        <TabsContent value="link">
          <MediaLinkImporter
            workspaceOptions={workspaceOptions}
            {...(contentItemId ? { contentItemId } : {})}
            {...(onAssetReady ? { onAssetReady } : {})}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
