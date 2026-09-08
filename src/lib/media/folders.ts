export const MEDIA_FOLDER_NAME_MAX_LENGTH = 80;

export function normalizeMediaFolderName(value: string): string | null {
  const name = value.trim();
  return name.length >= 1 && name.length <= MEDIA_FOLDER_NAME_MAX_LENGTH ? name : null;
}
