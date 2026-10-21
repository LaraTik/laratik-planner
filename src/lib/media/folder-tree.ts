import { ALL_FORMATS } from "@/lib/content/formats";

export type MediaFolderKind = "system" | "user";

export type MediaFolderTreeRow = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  assetCount: number;
  descendantAssetCount: number;
  kind: MediaFolderKind;
  isBrandRoot: boolean;
  isPostsRoot: boolean;
  isYearFolder: boolean;
  isMonthFolder: boolean;
};

export type MediaFolderTreeInput = Pick<
  MediaFolderTreeRow,
  "id" | "name" | "parentId" | "sortOrder"
>;

export const BRAND_KIT_FOLDER_NAME = "Brand Kit";
export const POSTS_FOLDER_NAME = "Posts";

const systemFormatNames = new Set(ALL_FORMATS.map(mediaFormatFolderName));
const systemYearPattern = /^\d{4}$/;
const systemMonthPattern = /^\d{2}$/;

export function mediaFormatFolderName(format: string): string {
  return format
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Build the display rows for an already-authorized folder list and count map. */
export function buildMediaFolderTree(
  folders: readonly MediaFolderTreeInput[],
  assetCountById: ReadonlyMap<string, number>,
): MediaFolderTreeRow[] {
  if (folders.length === 0) return [];

  const byParent = new Map<string | null, MediaFolderTreeInput[]>();
  for (const folder of folders) {
    const children = byParent.get(folder.parentId) ?? [];
    children.push(folder);
    byParent.set(folder.parentId, children);
  }
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));

  const isFormatFolder = (folder: MediaFolderTreeInput) => {
    if (!folder.parentId || !systemFormatNames.has(folder.name)) return false;
    return folderById.get(folder.parentId)?.name === POSTS_FOLDER_NAME;
  };
  const isYearFolder = (folder: MediaFolderTreeInput) => {
    if (!folder.parentId || !systemYearPattern.test(folder.name)) return false;
    const parent = folderById.get(folder.parentId);
    return !!parent && isFormatFolder(parent);
  };
  const isMonthFolder = (folder: MediaFolderTreeInput) => {
    if (!folder.parentId || !systemMonthPattern.test(folder.name)) return false;
    const parent = folderById.get(folder.parentId);
    return !!parent && isYearFolder(parent);
  };

  const descendantCount = new Map<string, number>();
  const visiting = new Set<string>();
  const computeDescendant = (folderId: string): number => {
    const cached = descendantCount.get(folderId);
    if (cached !== undefined) return cached;
    if (visiting.has(folderId)) return 0;
    visiting.add(folderId);
    const children = byParent.get(folderId) ?? [];
    const self = assetCountById.get(folderId) ?? 0;
    const total = children.reduce((sum, child) => sum + computeDescendant(child.id), self);
    visiting.delete(folderId);
    descendantCount.set(folderId, total);
    return total;
  };

  return folders.map((folder) => {
    const isPostsRoot = folder.parentId === null && folder.name === POSTS_FOLDER_NAME;
    const isBrandRoot = folder.parentId === null && folder.name === BRAND_KIT_FOLDER_NAME;
    const kind: MediaFolderKind =
      isPostsRoot ||
      isBrandRoot ||
      isFormatFolder(folder) ||
      isYearFolder(folder) ||
      isMonthFolder(folder)
        ? "system"
        : "user";
    return {
      ...folder,
      assetCount: assetCountById.get(folder.id) ?? 0,
      descendantAssetCount: computeDescendant(folder.id),
      kind,
      isBrandRoot,
      isPostsRoot,
      isYearFolder: isYearFolder(folder),
      isMonthFolder: isMonthFolder(folder),
    };
  });
}
