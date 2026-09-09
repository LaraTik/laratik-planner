import "server-only";
import { buildZip, type ZipEntry } from "@/lib/utils/zip";
import { downloadFilename, MEDIA_ZIP_MAX_BYTES } from "@/lib/media/contract";

export class MediaZipTooLargeError extends Error {
  constructor(public readonly totalBytes: number) {
    super("The selected media is larger than the 500 MiB ZIP limit.");
    this.name = "MediaZipTooLargeError";
  }
}

export type MediaZipSource = {
  id: string;
  title: string;
  originalName: string | null;
  mimeType: string;
  byteSize: number;
  read: () => Promise<Buffer>;
};

export async function exportMediaAssetsZip(
  assets: MediaZipSource[],
  filenameBase = "media-assets",
): Promise<{ buffer: Buffer; filename: string }> {
  const totalBytes = assets.reduce((sum, asset) => sum + asset.byteSize, 0);
  if (totalBytes > MEDIA_ZIP_MAX_BYTES) throw new MediaZipTooLargeError(totalBytes);

  const entries: ZipEntry[] = [];
  const usedNames = new Set<string>();
  for (const asset of assets) {
    const preferred = downloadFilename(asset.title, asset.originalName, asset.mimeType);
    const name = uniqueName(preferred, usedNames);
    const bytes = await asset.read();
    if (bytes.byteLength > MEDIA_ZIP_MAX_BYTES) throw new MediaZipTooLargeError(bytes.byteLength);
    entries.push({ name, data: bytes });
  }
  if (entries.length === 0) throw new Error("No media assets are available for export.");
  const safeBase =
    filenameBase.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "media-assets";
  return {
    buffer: buildZip(entries),
    filename: `${safeBase.slice(0, 80)}.zip`,
  };
}

function uniqueName(preferred: string, used: Set<string>): string {
  const base =
    preferred
      .replace(/[\\/\u0000-\u001f\u007f]/g, "-")
      .replace(/\.\.+/g, "-")
      .replace(/^\.+/, "")
      .slice(0, 180) || "asset.bin";
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let index = 2;
  let candidate = `${stem}-${index}${ext}`;
  while (used.has(candidate)) candidate = `${stem}-${++index}${ext}`;
  used.add(candidate);
  return candidate;
}
