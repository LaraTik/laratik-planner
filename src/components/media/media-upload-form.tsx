"use client";

import * as React from "react";
import { FileText, Image as ImageIcon, Loader2, Upload, Video, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLocaleT } from "@/components/i18n/locale-provider";
import {
  classifyMediaKind,
  contentTypeFromFilename,
  extensionFromFilename,
  MEDIA_SIZE_LIMITS,
  sanitizeAssetTitle,
  titleFromFilename,
  type MediaKind,
} from "@/lib/media/contract";

type QueueStatus = "queued" | "uploading" | "verifying" | "processing" | "ready" | "failed";
type QueueItem = {
  id: string;
  file: File;
  kind: MediaKind;
  title: string;
  contentType: string;
  status: QueueStatus;
  progress?: number;
  error?: string | undefined;
  duplicates?: DuplicateHint[];
};

export type MediaUploadResult = {
  id: string;
  title: string;
  kind: MediaKind;
  byteSize: number;
};

type FolderOption = { id: string; name: string };

type DuplicateHint = {
  assetId: string;
  title: string;
  workspaceName: string;
  sameWorkspace: boolean;
};

type Translator = ReturnType<typeof useLocaleT>;

function uploadFailureMessage(t: Translator, code?: string): string {
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

async function uploadResponseError(response: Response, t: Translator): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as { code?: string } | null;
  return new Error(uploadFailureMessage(t, payload?.code));
}

function formatBytes(value: number) {
  if (value < 1024 ** 2) return `${Math.max(1, Math.round(value / 1024))} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

async function checksumFor(file: File): Promise<string | undefined> {
  if (file.size > 100 * 1024 * 1024 || !globalThis.crypto?.subtle) return undefined;
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

function putFileWithProgress(
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

export function MediaUploadForm({
  workspaceOptions,
  folderOptionsByWorkspace,
  compact = false,
  onAssetReady,
}: {
  workspaceOptions: { id: string; name: string }[];
  folderOptionsByWorkspace?: Record<string, FolderOption[]>;
  compact?: boolean;
  onAssetReady?: (asset: MediaUploadResult) => void;
}) {
  const t = useLocaleT();
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = React.useState(workspaceOptions[0]?.id ?? "");
  const [folderId, setFolderId] = React.useState("");
  const [items, setItems] = React.useState<QueueItem[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const activeRequests = React.useRef(new Map<string, XMLHttpRequest>());
  const inputId = `media-file-input-${workspaceId}`;

  React.useEffect(
    () => () => {
      for (const request of activeRequests.current.values()) request.abort();
      activeRequests.current.clear();
    },
    [],
  );

  const update = (id: string, patch: Partial<QueueItem>) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  function addFiles(files: FileList | File[]) {
    const next = Array.from(files).map((file) => {
      const contentType = file.type || contentTypeFromFilename(file.name) || "";
      const kind = classifyMediaKind(contentType);
      if (!kind) {
        return {
          id: crypto.randomUUID(),
          file,
          kind: "document" as const,
          title: titleFromFilename(file.name),
          contentType,
          status: "failed" as const,
          error: t("media.unsupportedType"),
        };
      }
      const tooLarge = file.size > MEDIA_SIZE_LIMITS[kind];
      return {
        id: crypto.randomUUID(),
        file,
        kind,
        title: titleFromFilename(file.name),
        contentType,
        status: tooLarge ? ("failed" as const) : ("queued" as const),
        ...(tooLarge ? { error: t("media.fileTooLarge") } : {}),
      };
    });
    setItems((current) => [...current, ...next]);
  }

  async function uploadItem(item: QueueItem) {
    update(item.id, { status: "uploading", progress: 0, error: undefined });
    try {
      const checksumSha256 = await checksumFor(item.file);
      if (checksumSha256) {
        // Duplicate detection is advisory. A failed or throttled lookup must
        // never prevent a valid upload from continuing.
        try {
          const duplicateResponse = await fetch("/api/media/duplicates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspaceId, checksumSha256, kind: item.kind }),
          });
          if (duplicateResponse.ok) {
            const duplicateResult = (await duplicateResponse.json()) as {
              duplicates?: DuplicateHint[];
            };
            if (duplicateResult.duplicates?.length) {
              update(item.id, { duplicates: duplicateResult.duplicates });
            }
          }
        } catch {
          // The upload remains authoritative when the advisory is unavailable.
        }
      }
      const sign = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          kind: item.kind,
          ext: extensionFromFilename(item.file.name),
          fileSize: item.file.size,
          contentType: item.contentType,
          originalName: item.file.name,
          ...(checksumSha256 ? { checksumSha256 } : {}),
        }),
      });
      if (!sign.ok) throw await uploadResponseError(sign, t);
      const signed = (await sign.json()) as {
        uploadUrl: string;
        proxyUploadUrl?: string;
        uploadIntentId: string;
        requiredHeaders?: Record<string, string>;
      };
      try {
        await putFileWithProgress(
          signed.uploadUrl,
          item.file,
          signed.requiredHeaders,
          (progress) => update(item.id, { progress }),
          (request) => activeRequests.current.set(item.id, request),
        );
      } catch (error) {
        // A missing/stale R2 CORS rule presents as a browser network failure,
        // even though the server-side upload contract is healthy. Retry the
        // same intent through the same-origin streaming transport so the user
        // gets a recoverable upload instead of a misleading connection error.
        if (error instanceof Error && error.message === "upload_failed" && signed.proxyUploadUrl) {
          await putFileWithProgress(
            signed.proxyUploadUrl,
            item.file,
            signed.requiredHeaders,
            (progress) => update(item.id, { progress }),
            (request) => activeRequests.current.set(item.id, request),
          );
        } else {
          throw error;
        }
      }
      update(item.id, { status: "verifying" });
      const complete = await fetch("/api/uploads/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intentId: signed.uploadIntentId, workspaceId }),
      });
      if (!complete.ok) throw await uploadResponseError(complete, t);
      const result = (await complete.json()) as { objectId: string };
      const register = await fetch("/api/media/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          storageObjectId: result.objectId,
          title: sanitizeAssetTitle(item.title),
          ...(folderId ? { folderId } : {}),
        }),
      });
      if (!register.ok) throw await uploadResponseError(register, t);
      const registered = (await register.json()) as {
        asset?: { id?: string; status?: string };
      };
      const status = registered.asset?.status === "ready" ? "ready" : "processing";
      update(item.id, { status });
      if (status === "ready" && registered.asset?.id) {
        onAssetReady?.({
          id: registered.asset.id,
          title: sanitizeAssetTitle(item.title),
          kind: item.kind,
          byteSize: item.file.size,
        });
      }
    } catch (error) {
      update(item.id, {
        status: "failed",
        error:
          error instanceof Error
            ? error.message === "upload_failed" || error.message === "upload_aborted"
              ? uploadFailureMessage(t, error.message)
              : error.message
            : t("media.uploadError"),
      });
    } finally {
      activeRequests.current.delete(item.id);
    }
  }

  async function uploadAll() {
    setBusy(true);
    for (const item of items.filter((candidate) => candidate.status === "queued")) {
      await uploadItem(item);
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <Card padding={compact ? "md" : "lg"} data-testid="media-upload-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{t("media.uploadTitle")}</CardTitle>
          <CardDescription>
            {compact ? t("media.inlineUploadDescription") : t("media.uploadDescription")}
          </CardDescription>
        </div>
        {items.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={busy}
              onClick={() => setItems([])}
            >
              {t("media.clearSelected")}
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={busy || !items.some((i) => i.status === "queued")}
              onClick={() => void uploadAll()}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="h-4 w-4" aria-hidden="true" />
              )}
              {busy ? t("media.uploading") : t("media.uploadSelected")}
            </Button>
          </div>
        ) : null}
      </div>
      {workspaceOptions.length > 1 ? (
        <label
          className="text-body text-fg-primary mt-5 block font-semibold"
          htmlFor={`${inputId}-workspace`}
        >
          {t("media.workspace")}
          <select
            id={`${inputId}-workspace`}
            value={workspaceId}
            onChange={(event) => {
              setWorkspaceId(event.target.value);
              setFolderId("");
            }}
            className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block min-h-11 w-full rounded-[var(--radius-control)] border px-3 font-normal focus-visible:ring-2 sm:max-w-sm"
          >
            <option value="" disabled>
              {t("media.workspace")}
            </option>
            {workspaceOptions.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {folderOptionsByWorkspace ? (
        <label
          className="text-body text-fg-primary mt-5 block font-semibold"
          htmlFor={`${inputId}-folder`}
        >
          {t("media.folder")}
          <select
            id={`${inputId}-folder`}
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
            className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring mt-1 block min-h-11 w-full rounded-[var(--radius-control)] border px-3 font-normal focus-visible:ring-2 sm:max-w-sm"
          >
            <option value="">{t("media.unfiled")}</option>
            {(folderOptionsByWorkspace[workspaceId] ?? []).map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label
        htmlFor={inputId}
        className={`border-border bg-surface-subtle mt-5 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-[var(--radius-card)] border-2 border-dashed px-4 py-6 text-center transition-colors ${dragging ? "border-primary bg-primary-subtle" : "hover:border-primary"}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
        }}
      >
        <Upload className="text-primary h-8 w-8" aria-hidden="true" />
        <span className="text-body text-fg-primary mt-2 font-semibold">{t("media.dropFiles")}</span>
        <span className="text-label text-fg-muted mt-1">{t("media.dropHint")}</span>
        <span className="bg-primary text-button mt-4 inline-flex min-h-11 items-center rounded-[var(--radius-control)] px-4 font-semibold text-white">
          {t("media.chooseFiles")}
        </span>
        <input
          id={inputId}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
      </label>
      {items.length > 0 ? (
        <div
          className="mt-5 grid gap-2"
          aria-label={t("media.selectedFiles")}
          aria-live="polite"
          aria-busy={busy}
        >
          {items.map((item) => (
            <UploadRow
              key={item.id}
              item={item}
              onTitleChange={(title) => update(item.id, { title })}
              onRemove={() => {
                activeRequests.current.get(item.id)?.abort();
                setItems((current) => current.filter((candidate) => candidate.id !== item.id));
              }}
              onRetry={() => void uploadItem(item)}
              t={t}
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function UploadRow({
  item,
  onTitleChange,
  onRemove,
  onRetry,
  t,
}: {
  item: QueueItem;
  onTitleChange: (title: string) => void;
  onRemove: () => void;
  onRetry: () => void;
  t: ReturnType<typeof useLocaleT>;
}) {
  const Icon = item.kind === "image" ? ImageIcon : item.kind === "video" ? Video : FileText;
  const status =
    item.status === "uploading"
      ? t("media.uploading")
      : item.status === "verifying"
        ? t("media.verifying")
        : item.status === "processing"
          ? t("media.processing")
          : item.status === "ready"
            ? t("media.ready")
            : item.status === "failed"
              ? t("media.failed")
              : t("media.selectedFiles");
  return (
    <div className="border-border bg-surface flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border p-3">
      <Icon className="text-fg-secondary h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <Input
          value={item.title}
          aria-label={t("media.titleLabel")}
          disabled={item.status === "ready"}
          onChange={(event) => onTitleChange(event.target.value)}
          className="mt-0 h-9"
        />
        <div className="text-label text-fg-muted mt-1 flex flex-wrap gap-x-2">
          <span className="truncate">{item.file.name}</span>
          <span>{formatBytes(item.file.size)}</span>
          <span>{status}</span>
        </div>
        {item.status === "uploading" ? (
          <div className="mt-2 flex items-center gap-2">
            <div
              className="bg-surface-subtle h-2 min-w-24 flex-1 overflow-hidden rounded-full"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={item.progress ?? 0}
              aria-label={t("media.uploadProgress", { percent: item.progress ?? 0 })}
            >
              <div
                className="bg-primary h-full rounded-full transition-[width] duration-150"
                style={{ width: `${item.progress ?? 0}%` }}
              />
            </div>
            <span className="text-label text-fg-secondary tabular-nums">{item.progress ?? 0}%</span>
          </div>
        ) : null}
        {item.error ? (
          <p className="text-label text-danger mt-1" role="alert">
            {item.error}
          </p>
        ) : null}
        {item.duplicates?.length ? (
          <p className="text-label text-fg-secondary mt-1" role="status">
            {t("media.duplicateDetected", {
              workspace: item.duplicates[0]?.workspaceName ?? "",
            })}
          </p>
        ) : null}
      </div>
      {item.status === "failed" ? (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          {t("media.retry")}
        </Button>
      ) : null}
      {item.status !== "ready" ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t("media.remove")}
          onClick={onRemove}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
