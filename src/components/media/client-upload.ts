"use client";

/**
 * Browser-side media upload transport.
 *
 * One implementation of the four-step upload contract every intake surface
 * uses:
 *
 *   1. `POST /api/uploads/sign`      → a short-lived upload URL + intent id
 *   2. `PUT  <uploadUrl>`            → the raw bytes (direct to object storage)
 *   3. `POST /api/uploads/complete`  → verify the object, return its id
 *   4. `POST /api/media/assets`      → register it in the media catalogue
 *
 * The contract is deliberately NOT duplicated per surface. Each step has
 * real edge cases — a missing bucket CORS rule surfaces as a browser network
 * failure, and a stored-but-unvalidated object comes back as `processing` —
 * and a second copy of the sequence is how those edge cases drift apart.
 *
 * WHY THIS LIVES UNDER `components/` AND NOT `lib/`: it is browser
 * transport, and it maps transport error codes to user-facing copy through
 * the locale translator, which is a presentation concern. `lib/` modules must
 * not depend on `components/` (see the module-ownership guard).
 */

import {
  classifyMediaKind,
  contentTypeFromFilename,
  extensionFromFilename,
  sanitizeAssetTitle,
  titleFromFilename,
  type MediaKind,
} from "@/lib/media/contract";
import type { ClientTranslator } from "@/components/i18n/locale-provider";

/**
 * Bounded backoff for re-reading an asset that registered as `processing`.
 * Storage read blips are short, so ~11s of in-session polling resolves the
 * overwhelming majority without the user touching anything. Anything still
 * pending after this is recovered by the cron `processPendingMediaAssets`
 * sweep; the upload itself is never lost.
 */
export const REGISTER_POLL_DELAYS_MS = [400, 1000, 2000, 3000, 5000] as const;

/** A registered, ready-to-serve media asset. */
export type UploadedMediaAsset = {
  id: string;
  title: string;
  kind: MediaKind;
  byteSize: number;
};

/**
 * The outcome of the registration step.
 *
 * `processing` is a real, recoverable state — the bytes are stored and
 * catalogued, only content validation is outstanding, because storage was
 * briefly unreadable during registration. `failed` is a definitive verdict
 * from the validator. Both are outcomes, not transport errors.
 */
export type MediaUploadOutcome =
  | { status: "ready"; asset: UploadedMediaAsset }
  | { status: "processing"; assetId: string }
  | { status: "failed"; assetId: string };

/** Which stage of the contract the upload is currently in. */
export type MediaUploadPhase = "uploading" | "verifying" | "processing";

/** Translate a transport error code into copy the user can act on. */
export function uploadFailureMessage(t: ClientTranslator, code?: string): string {
  switch (code) {
    case "media.file_too_large":
      return t("media.fileTooLarge");
    case "media.permission_denied":
      return t("media.uploadPermissionDenied");
    case "storage.quota_exceeded":
      return t("media.storageQuotaExceeded");
    case "storage.unavailable":
      return t("media.storageUnavailable");
    case "storage.object_verification_failed":
      return t("media.verificationFailed");
    case "storage.intent_expired":
    case "storage.intent_not_found":
      return t("media.uploadExpired");
    case "upload_failed":
      return t("media.transferFailed");
    case "upload_aborted":
      return t("media.uploadCanceled");
    default:
      return t("media.uploadError");
  }
}

/**
 * Turn a failed response into an error carrying the transport error CODE.
 *
 * The code is what `uploadFailureMessage` maps to copy; the raw server
 * message is not user-facing and would leak storage internals into the UI.
 */
async function responseErrorCode(response: Response): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as { code?: string } | null;
  return new Error(payload?.code ?? "upload_failed");
}

/**
 * SHA-256 of the file bytes, used only for advisory duplicate detection.
 *
 * The upload is valid without it and the server treats its absence as
 * normal, so digesting must never fail the upload — a large-file read error
 * degrades to "no checksum", not to a raw runtime message.
 */
export async function checksumFor(file: File): Promise<string | undefined> {
  if (file.size > 100 * 1024 * 1024 || !globalThis.crypto?.subtle) return undefined;
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return btoa(String.fromCharCode(...new Uint8Array(digest)));
  } catch {
    return undefined;
  }
}

/**
 * PUT the bytes, reporting progress.
 *
 * `XMLHttpRequest` is used rather than `fetch` because `fetch` cannot report
 * upload progress; that progress is what keeps a multi-megabyte image from
 * looking like a frozen UI.
 */
export function putFileWithProgress(
  url: string,
  file: File,
  headers: Record<string, string> | undefined,
  onProgress: (percent: number) => void,
  onRequest: (request: XMLHttpRequest) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    onRequest(request);
    request.open("PUT", url);
    Object.entries(headers ?? {}).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable)
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error("upload_failed"));
      }
    });
    request.addEventListener("error", () => reject(new Error("upload_failed")));
    request.addEventListener("abort", () => reject(new Error("upload_aborted")));
    request.send(file);
  });
}

export type UploadMediaFileOptions = {
  workspaceId: string;
  file: File;
  /** Media kind; derived from the file's MIME type when omitted. */
  kind?: MediaKind;
  /** MIME type; derived from the file when omitted. */
  contentType?: string;
  /** Asset title; derived from the file name when omitted. */
  title?: string;
  /** Links the finished asset to a post so it lands in that post's folder. */
  contentItemId?: string;
  /** Media folder to file the asset under; resolved from the post when omitted. */
  folderId?: string;
  checksumSha256?: string;
  onPhase?: (phase: MediaUploadPhase) => void;
  onProgress?: (percent: number) => void;
  /** Receives the in-flight request so the caller can abort it on unmount. */
  registerRequest?: (request: XMLHttpRequest) => void;
};

/**
 * Run one file through the whole upload contract.
 *
 * Throws an `Error` whose message is a transport error code (see
 * `uploadFailureMessage`) for anything that prevented the bytes from being
 * stored. Returns a `MediaUploadOutcome` for everything the server answered:
 * the asset is registered either way.
 */
export async function uploadMediaFile(
  options: UploadMediaFileOptions,
): Promise<MediaUploadOutcome> {
  const {
    workspaceId,
    file,
    contentItemId,
    folderId,
    checksumSha256,
    onPhase,
    onProgress,
    registerRequest,
  } = options;
  const contentType = options.contentType || file.type || contentTypeFromFilename(file.name) || "";
  const kind = options.kind ?? classifyMediaKind(contentType);
  if (!kind) throw new Error("media.unsupportedType");
  const title = options.title ?? titleFromFilename(file.name);

  const sign = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId,
      kind,
      ext: extensionFromFilename(file.name),
      fileSize: file.size,
      contentType,
      originalName: file.name,
      ...(contentItemId ? { contentItemId } : {}),
      ...(checksumSha256 ? { checksumSha256 } : {}),
    }),
  });
  if (!sign.ok) throw await responseErrorCode(sign);
  const signed = (await sign.json()) as {
    uploadUrl: string;
    proxyUploadUrl?: string;
    uploadIntentId: string;
    requiredHeaders?: Record<string, string>;
  };

  onPhase?.("uploading");
  try {
    await putFileWithProgress(
      signed.uploadUrl,
      file,
      signed.requiredHeaders,
      (progress) => onProgress?.(progress),
      (request) => registerRequest?.(request),
    );
  } catch (error) {
    // A missing/stale R2 CORS rule presents as a browser network failure,
    // even though the server-side upload contract is healthy. Retry the same
    // intent through the same-origin streaming transport so the user gets a
    // recoverable upload instead of a misleading connection error.
    if (error instanceof Error && error.message === "upload_failed" && signed.proxyUploadUrl) {
      await putFileWithProgress(
        signed.proxyUploadUrl,
        file,
        signed.requiredHeaders,
        (progress) => onProgress?.(progress),
        (request) => registerRequest?.(request),
      );
    } else {
      throw error;
    }
  }

  onPhase?.("verifying");
  const complete = await fetch("/api/uploads/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intentId: signed.uploadIntentId, workspaceId }),
  });
  if (!complete.ok) throw await responseErrorCode(complete);
  const result = (await complete.json()) as { objectId: string };

  // Registration is idempotent, so this POST doubles as the status probe
  // for an asset the server could not finish validating inline.
  const registerAsset = async () => {
    const response = await fetch("/api/media/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        storageObjectId: result.objectId,
        title: sanitizeAssetTitle(title),
        ...(folderId ? { folderId } : {}),
        ...(contentItemId ? { contentItemId } : {}),
      }),
    });
    if (!response.ok) throw await responseErrorCode(response);
    const body = (await response.json()) as { asset?: { id?: string; status?: string } };
    return body.asset ?? {};
  };

  let asset = await registerAsset();
  for (const delay of REGISTER_POLL_DELAYS_MS) {
    if (asset.status !== "processing") break;
    onPhase?.("processing");
    await new Promise((resolve) => setTimeout(resolve, delay));
    asset = await registerAsset();
  }

  if (asset.status === "failed") {
    return { status: "failed", assetId: asset.id ?? "" };
  }
  if (asset.status === "ready" && asset.id) {
    return {
      status: "ready",
      asset: { id: asset.id, title: sanitizeAssetTitle(title), kind, byteSize: file.size },
    };
  }
  // Still pending after the bounded poll: the row is committed and the cron
  // sweep will promote it. Leave the visible state honest.
  return { status: "processing", assetId: asset.id ?? "" };
}
