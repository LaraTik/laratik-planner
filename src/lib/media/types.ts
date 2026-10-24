import type { contentItems, mediaAssets, storageObjects } from "@/lib/db/schema";

/** Client-safe projection contract for the media library query. */
export type MediaLibraryItem = {
  asset: typeof mediaAssets.$inferSelect;
  object: Pick<
    typeof storageObjects.$inferSelect,
    | "id"
    | "originalName"
    | "mimeType"
    | "byteSize"
    | "width"
    | "height"
    | "durationMs"
    | "kind"
    | "status"
  > & { previewStorageObjectId: string | null };
  workspaceName: string;
  workspaceSlug: string;
  workspaceAgencySlug: string;
  folder: { id: string; name: string } | null;
  relatedContentItems: Array<{
    assetId: string;
    contentItemId: string;
    title: string;
    format: typeof contentItems.$inferSelect.format;
    plannedPublishAt: Date;
    workspaceSlug: string;
    workspaceAgencySlug: string;
  }>;
};
