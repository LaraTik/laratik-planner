/** Pure contracts shared by browser preflight, API validation, and tests. */

export const MEDIA_KINDS = ["image", "video", "document"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_ZIP_MAX_BYTES = 500 * 1024 * 1024;

export const MEDIA_SIZE_LIMITS: Record<MediaKind, number> = {
  image: 50 * 1024 * 1024,
  video: 1024 * 1024 * 1024,
  document: 25 * 1024 * 1024,
};

export const MEDIA_MIME_TYPES: Record<MediaKind, readonly string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
  document: [
    "application/pdf",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
};

export type MediaSourceType =
  "browser_file" | "external_url" | "google_drive" | "onedrive" | "legacy";

export type MediaDimensions = { width: number; height: number };

const PROVIDER_HOSTS = {
  google_drive: new Set(["drive.google.com", "docs.google.com"]),
  onedrive: new Set(["1drv.ms", "onedrive.live.com"]),
} as const;

export function extensionFromFilename(filename: string): string {
  const clean = filename.split(/[\\/]/).pop() ?? filename;
  const dot = clean.lastIndexOf(".");
  return dot > 0 ? clean.slice(dot + 1).toLowerCase() : "";
}

/** Best-effort browser fallback when a File object has an empty MIME type. */
export function contentTypeFromFilename(filename: string): string | null {
  const extension = extensionFromFilename(filename);
  const byExtension: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    pdf: "application/pdf",
    txt: "text/plain",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return byExtension[extension] ?? null;
}

export function titleFromFilename(filename: string): string {
  const clean = (filename.split(/[\\/]/).pop() ?? filename).replace(/\.[^.]+$/, "");
  return sanitizeAssetTitle(clean);
}

/** Preserve a useful source filename without retaining paths or controls. */
export function sanitizeOriginalFilename(value: string): string | null {
  const basename = value.split(/[\\/]/).pop() ?? value;
  const sanitized = basename
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255)
    .trim();
  return sanitized || null;
}

export function sanitizeAssetTitle(value: string): string {
  const sanitized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\\/]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/-{2,}/g, "-")
    .trim()
    .slice(0, 160)
    .trim();
  return sanitized || "Untitled media";
}

/**
 * Keep provenance useful without persisting signed-download credentials.
 * Imported bytes are the durable source of truth, so a redacted URL must
 * never be used as an authorization or re-fetch token.
 */
export function redactMediaSourceUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/(token|secret|signature|sig|auth|credential|expires|expiry|key|policy)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return "";
  }
}

export function classifyMediaKind(contentType: string): MediaKind | null {
  for (const kind of MEDIA_KINDS) {
    if (MEDIA_MIME_TYPES[kind].includes(contentType)) return kind;
  }
  return null;
}

export function validateMediaUpload(input: {
  kind: MediaKind;
  contentType: string;
  byteSize: number;
}): { ok: true } | { ok: false; code: "invalid_size" | "unsupported_type" } {
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 1) {
    return { ok: false, code: "invalid_size" };
  }
  if (input.byteSize > MEDIA_SIZE_LIMITS[input.kind]) {
    return { ok: false, code: "invalid_size" };
  }
  if (!MEDIA_MIME_TYPES[input.kind].includes(input.contentType)) {
    return { ok: false, code: "unsupported_type" };
  }
  return { ok: true };
}

export function extensionForContentType(contentType: string): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  if (contentType === "video/mp4") return "mp4";
  if (contentType === "video/quicktime") return "mov";
  if (contentType === "video/webm") return "webm";
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "text/plain") return "txt";
  if (contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return "docx";
  }
  return "bin";
}

export function validateMediaSignature(
  contentType: string,
  bytes: Uint8Array,
): { ok: true } | { ok: false; code: "invalid_signature" } {
  const startsWith = (...expected: number[]) =>
    expected.every((value, index) => bytes[index] === value);
  const asciiAt = (offset: number, value: string) =>
    [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));

  if (contentType === "image/jpeg" && startsWith(0xff, 0xd8, 0xff)) return { ok: true };
  if (contentType === "image/png" && startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return { ok: true };
  }
  if (contentType === "image/gif" && (asciiAt(0, "GIF87a") || asciiAt(0, "GIF89a"))) {
    return { ok: true };
  }
  if (contentType === "image/webp" && asciiAt(0, "RIFF") && asciiAt(8, "WEBP")) {
    return { ok: true };
  }
  if ((contentType === "video/mp4" || contentType === "video/quicktime") && asciiAt(4, "ftyp")) {
    return { ok: true };
  }
  if (contentType === "video/webm" && startsWith(0x1a, 0x45, 0xdf, 0xa3)) return { ok: true };
  if (contentType === "application/pdf" && asciiAt(0, "%PDF-")) return { ok: true };
  if (
    contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
    startsWith(0x50, 0x4b, 0x03, 0x04)
  ) {
    return { ok: true };
  }
  if (contentType === "text/plain" && !bytes.includes(0)) return { ok: true };
  return { ok: false, code: "invalid_signature" };
}

/**
 * Extract dimensions from a bounded image prefix. This is deliberately
 * best-effort: previews and full metadata jobs may need the complete object,
 * but the catalog can safely use these values when the header is available.
 */
export function extractMediaDimensions(
  contentType: string,
  bytes: Uint8Array,
): MediaDimensions | null {
  const valid = (width: number, height: number): MediaDimensions | null =>
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= 100_000 &&
    height <= 100_000
      ? { width, height }
      : null;

  if (contentType === "image/png" && bytes.length >= 24) {
    const isPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    );
    const isHeader =
      bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52;
    if (isPng && isHeader) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return valid(view.getUint32(16), view.getUint32(20));
    }
  }

  if (contentType === "image/gif" && bytes.length >= 10) {
    const isGif =
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x38 &&
      (bytes[4] === 0x37 || bytes[4] === 0x39) &&
      bytes[5] === 0x61;
    if (isGif) {
      return valid(bytes[6]! | (bytes[7]! << 8), bytes[8]! | (bytes[9]! << 8));
    }
  }

  if (contentType === "image/webp" && bytes.length >= 30) {
    const isWebp =
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50;
    const isExtended =
      bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58;
    if (isWebp && isExtended) {
      return valid(
        1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16),
        1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16),
      );
    }
  }

  if (
    contentType === "image/jpeg" &&
    bytes.length >= 10 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8
  ) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      if (offset >= bytes.length) break;
      const marker = bytes[offset++]!;
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue;
      if (offset + 1 >= bytes.length) break;
      const segmentLength = (bytes[offset]! << 8) | bytes[offset + 1]!;
      if (segmentLength < 2) break;
      const isStartOfFrame =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isStartOfFrame && offset + 7 < bytes.length) {
        return valid(
          (bytes[offset + 5]! << 8) | bytes[offset + 6]!,
          (bytes[offset + 3]! << 8) | bytes[offset + 4]!,
        );
      }
      offset += segmentLength;
    }
  }

  return null;
}

export function downloadFilename(
  title: string,
  originalName: string | null,
  contentType: string,
): string {
  const originalExtension = originalName ? extensionFromFilename(originalName) : "";
  const extension = isSafeExtensionForContentType(originalExtension, contentType)
    ? originalExtension
    : extensionForContentType(contentType);
  const base = sanitizeAssetTitle(title).replace(/["\r\n]/g, "-");
  return extension ? `${base}.${extension}` : base;
}

function isSafeExtensionForContentType(extension: string, contentType: string): boolean {
  const allowed =
    contentType === "image/jpeg"
      ? ["jpg", "jpeg"]
      : contentType === "image/png"
        ? ["png"]
        : contentType === "image/webp"
          ? ["webp"]
          : contentType === "image/gif"
            ? ["gif"]
            : contentType === "video/mp4"
              ? ["mp4"]
              : contentType === "video/quicktime"
                ? ["mov", "mp4"]
                : contentType === "video/webm"
                  ? ["webm"]
                  : contentType === "application/pdf"
                    ? ["pdf"]
                    : contentType === "text/plain"
                      ? ["txt"]
                      : contentType ===
                          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        ? ["docx"]
                        : [];
  return allowed.includes(extension);
}

export function inspectExternalMediaUrl(
  raw: string,
):
  | { ok: true; provider: "google_drive" | "onedrive" | "external_url"; url: string }
  | { ok: false; code: "invalid_url" | "unsupported_host" } {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return { ok: false, code: "invalid_url" };
  }
  if (parsed.protocol !== "https:") return { ok: false, code: "invalid_url" };
  const host = parsed.hostname.toLowerCase();
  if (PROVIDER_HOSTS.google_drive.has(host)) {
    return { ok: true, provider: "google_drive", url: parsed.toString() };
  }
  if (PROVIDER_HOSTS.onedrive.has(host) || host.endsWith(".sharepoint.com")) {
    return { ok: true, provider: "onedrive", url: parsed.toString() };
  }
  return { ok: true, provider: "external_url", url: parsed.toString() };
}
