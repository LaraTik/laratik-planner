"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { MediaLinkImporter } from "./media-link-importer";
import { MediaUploadForm } from "./media-upload-form";

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
}: {
  workspaceOptions: { id: string; name: string }[];
  folderOptionsByWorkspace: Record<
    string,
    { id: string; name: string; parentId?: string | null }[]
  >;
  initialSource?: "device" | "link";
  contentItemId?: string;
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
          />
        </TabsContent>
        <TabsContent value="link">
          <MediaLinkImporter
            workspaceOptions={workspaceOptions}
            {...(contentItemId ? { contentItemId } : {})}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
