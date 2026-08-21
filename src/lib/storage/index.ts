import "server-only";
import { mkdir, readFile as fsReadFile, writeFile as fsWriteFile } from "node:fs/promises";
import { normalize, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import {
  signDownloadPath,
  signUploadPath,
  verifyDownloadToken,
  verifyUploadToken,
  type SignedDownloadPayload,
  type SignedUploadPayload,
} from "./signed-url";

/**
 * High-level storage helpers (STUDIOFLOW_MASTER_PROMPT.md §11.2).
 *
 * The local-volume adapter writes uploaded files under `UPLOADS_DIR`
 * (env var, defaults to `/data/uploads`) using a per-workspace layout:
 *
 *   ${UPLOADS_DIR}/${workspaceId}/${fileId}.${ext}
 *
 * Public read access is mediated by signed URLs (`/api/uploads/[id]`)
 * whose tokens are bound to (workspaceId, fileId) and short-lived
 * (default 300s). Public write access is mediated by signed uploads
 * (`/api/uploads/sign` + `PUT /api/uploads`) so the server can enforce
 * size limits before the bytes hit disk.
 *
 * Path-traversal hardening: every read/write/resolve call runs the
 * requested path through `resolve` and asserts it stays within
 * `UPLOADS_DIR`. A `..` or absolute-path request fails fast with a
 * typed error instead of writing outside the volume.
 */

const DEFAULT_UPLOADS_DIR = "/data/uploads";

function getUploadsDir(): string {
  return process.env.UPLOADS_DIR || DEFAULT_UPLOADS_DIR;
}

/**
 * Strip a leading dot, lowercase, and reject anything that isn't
 * alnum/underscore so a malicious ext can't smuggle path separators.
 * The allowed length is 1-8 chars, which covers every common web
 * file extension (svg, png, jpg, webp, pdf, doc, docx, mp4, …).
 */
function normaliseExt(ext: string): string {
  const cleaned = ext.replace(/^\./, "").toLowerCase().trim();
  if (!/^[a-z0-9_]{1,8}$/.test(cleaned)) {
    throw new StoragePathError(`Invalid file extension: ${ext}`);
  }
  return cleaned;
}

/**
 * Reject any path that resolves outside `root`. `candidate` may be
 * absolute or relative; `root` must be absolute. Uses platform-native
 * path separators so the check works on Linux (the production
 * target) without false positives on Windows test runners.
 */
export function assertWithinRoot(root: string, candidate: string): string {
  const rootAbs = resolve(root);
  const fullAbs = resolve(rootAbs, candidate);
  // `resolve` normalises `..` and absolute paths, so any escape
  // attempt will be flattened. The trailing-separator trick stops
  // `/data/uploads` from matching `/data/uploads-evil`.
  const rootWithSep = rootAbs.endsWith(sep) ? rootAbs : `${rootAbs}${sep}`;
  if (fullAbs !== rootAbs && !fullAbs.startsWith(rootWithSep)) {
    throw new StoragePathError(`Path escapes storage root: ${candidate}`);
  }
  return fullAbs;
}

export class StoragePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoragePathError";
  }
}

export class StorageNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageNotFoundError";
  }
}

export type UploadKind = "logo" | "color" | "font" | "image" | "document" | "other";

export const UPLOAD_SIZE_LIMITS: Record<UploadKind, number> = {
  logo: 10 * 1024 * 1024,
  color: 10 * 1024 * 1024,
  font: 10 * 1024 * 1024,
  image: 10 * 1024 * 1024,
  document: 25 * 1024 * 1024,
  other: 5 * 1024 * 1024,
};

export type WriteFileResult = {
  fileId: string;
  storagePath: string;
  size: number;
};

export async function writeFile(
  workspaceId: string,
  kind: UploadKind,
  ext: string,
  buffer: Buffer,
): Promise<WriteFileResult> {
  const fileId = randomUUID();
  const safeExt = normaliseExt(ext);
  const relative = `${workspaceId}/${fileId}.${safeExt}`;
  const absPath = assertWithinRoot(getUploadsDir(), relative);
  await mkdir(/* turbopackIgnore: true */ assertWithinRoot(getUploadsDir(), workspaceId), {
    recursive: true,
  });
  await fsWriteFile(/* turbopackIgnore: true */ absPath, buffer);
  return { fileId, storagePath: relative, size: buffer.byteLength };
}

export async function readFile(storagePath: string): Promise<Buffer> {
  const absPath = assertWithinRoot(getUploadsDir(), storagePath);
  try {
    // The `turbopackIgnore: true` comment opts this dynamic
    // filesystem call out of Turbopack's whole-project trace
    // analysis. The path is always relative to `UPLOADS_DIR` (an
    // env var resolved at runtime) so the build can't prove
    // statically that it stays under a specific subfolder, but
    // `assertWithinRoot` above guarantees it at runtime.
    return await fsReadFile(/* turbopackIgnore: true */ absPath);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      throw new StorageNotFoundError(`File not found: ${storagePath}`);
    }
    throw cause;
  }
}

export function getSignedUploadUrl(
  workspaceId: string,
  kind: UploadKind,
  ext: string,
): { url: string; fileId: string; expiresAt: number } {
  const { token, expiresAt, path } = signUploadPath(workspaceId, kind, normaliseExt(ext));
  // The browser PUTs the file to /api/uploads with the token in the
  // Authorization header (or `?token=` query). The path returned here
  // is informational — the API route doesn't currently route on it
  // because we resolve the fileId server-side.
  const url = `/api/uploads?token=${encodeURIComponent(token)}`;
  return { url, fileId: path, expiresAt };
}

export function getSignedDownloadUrl(storagePath: string): string {
  // The download token is bound to the storagePath (relative, not
  // absolute) so a leaked token cannot reveal the server filesystem.
  // The first path segment is the workspaceId (see writeFile), so we
  // can split it out for the signed payload.
  const normalised = normalize(storagePath);
  const slash = normalised.indexOf("/");
  if (slash < 0) {
    throw new StoragePathError(`Storage path missing workspace prefix: ${storagePath}`);
  }
  const workspaceId = normalised.slice(0, slash);
  const fileId = normalised.slice(slash + 1);
  const { token, expiresAt } = signDownloadPath(workspaceId, fileId);
  return `/api/uploads/${encodeURIComponent(fileId)}?token=${encodeURIComponent(token)}&expiresAt=${expiresAt}`;
}

export type { SignedUploadPayload, SignedDownloadPayload };

// Re-export the verify functions so route handlers can import them
// from a single module.
export { verifyUploadToken, verifyDownloadToken };
