"use client";

import * as React from "react";
import { Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { uploadFailureMessage, uploadMediaFile } from "@/components/media/client-upload";
import { MEDIA_SIZE_LIMITS, classifyMediaKind, titleFromFilename } from "@/lib/media/contract";

/**
 * A reference image the planner uploaded for this post.
 *
 * `id` is the media-asset id; `title` is the file the planner picked, kept
 * beside the id so the field can label the thumbnail without a second round
 * trip for asset metadata on every render.
 */
export type ReferenceImage = { id: string; title: string };

type QueueEntry = {
  id: string;
  file: File;
  previewUrl: string;
  status: "uploading" | "ready" | "failed";
  progress: number;
  error?: string | undefined;
};

/**
 * Release a local object URL.
 *
 * `URL.revokeObjectURL` is absent in some non-browser test environments, and
 * a cleanup path must never be the thing that throws.
 */
function releaseObjectUrl(url: string) {
  if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
}

/**
 * The thumbnail source for a stored asset.
 *
 * The `preview` route serves the 480px WebP variant when one exists and
 * 404s when it does not (a legacy asset, or a variant generator that never
 * ran). The original object is the fallback, so a reference image is never
 * reduced to a broken-image glyph.
 */
function ReferenceThumbnail({ id, title }: { id: string; title: string }) {
  const [useOriginal, setUseOriginal] = React.useState(false);
  const src = useOriginal
    ? `/api/media/assets/${encodeURIComponent(id)}`
    : `/api/media/assets/${encodeURIComponent(id)}/preview`;
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- served by the
       session-gated media proxy; the next/image loader cannot carry that
       auth boundary. */
    <img
      src={src}
      alt={title}
      loading="lazy"
      onError={() => setUseOriginal(true)}
      className="size-full object-contain"
    />
  );
}

/**
 * Upload affordance for the "Required image / design reference" field.
 *
 * The field accepts two kinds of reference — a URL and an uploaded file — and
 * this component owns the uploaded half. It is intentionally NOT the full
 * `MediaUploadForm` card: that component is a page-level intake surface with
 * a queue, a workspace picker, and a folder picker, which would drown a
 * single field inside a dense form. Here the rules are narrower and
 * immediate: images only, uploaded on selection, with a thumbnail per file.
 *
 * State lives in the parent (the format payload is the source of truth, and
 * the editor autosaves it), so this component is fully controlled.
 */
export function ReferenceImageUploader({
  workspaceId,
  contentItemId,
  value,
  onChange,
  disabled = false,
}: {
  workspaceId: string;
  contentItemId?: string | undefined;
  value: ReferenceImage[];
  onChange: (next: ReferenceImage[]) => void;
  disabled?: boolean;
}) {
  const t = useLocaleT();
  const [queue, setQueue] = React.useState<QueueEntry[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const inputId = `reference-image-input-${contentItemId ?? "post"}`;
  const activeRequests = React.useRef(new Map<string, XMLHttpRequest>());
  // The uploaded list is owned by the parent, so a long upload must read the
  // LATEST list when it finishes rather than the one captured when it
  // started. A ref mirrors it without re-running the upload on every change.
  const listRef = React.useRef(value);
  React.useEffect(() => {
    listRef.current = value;
  }, [value]);
  // The queue is mirrored so the unmount cleanup can revoke the object URLs
  // it created; the state value captured at mount would be empty.
  const queueRef = React.useRef<QueueEntry[]>([]);
  const setQueueEntries = React.useCallback(
    (next: QueueEntry[] | ((current: QueueEntry[]) => QueueEntry[])) => {
      setQueue((current) => {
        const resolved = typeof next === "function" ? next(current) : next;
        queueRef.current = resolved;
        return resolved;
      });
    },
    [],
  );

  React.useEffect(
    () => () => {
      for (const request of activeRequests.current.values()) request.abort();
      activeRequests.current.clear();
      for (const entry of queueRef.current) releaseObjectUrl(entry.previewUrl);
    },
    [],
  );

  const updateEntry = React.useCallback(
    (id: string, patch: Partial<QueueEntry>) => {
      setQueueEntries((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
      );
    },
    [setQueueEntries],
  );

  /**
   * Add one reference to the payload.
   *
   * The list is read from `listRef` and written back into it SYNCHRONOUSLY,
   * so two uploads that finish in the same tick both land: the second reads
   * the first one's result instead of the list as it was when they started.
   */
  function commit(image: ReferenceImage) {
    const next = [...listRef.current, image];
    listRef.current = next;
    onChange(next);
  }

  async function runUpload(entry: QueueEntry) {
    try {
      const outcome = await uploadMediaFile({
        workspaceId,
        file: entry.file,
        kind: "image",
        title: titleFromFilename(entry.file.name),
        ...(contentItemId ? { contentItemId } : {}),
        onProgress: (progress) => updateEntry(entry.id, { progress }),
        registerRequest: (request) => activeRequests.current.set(entry.id, request),
      });

      if (outcome.status === "ready") {
        updateEntry(entry.id, { status: "ready", progress: 100 });
        commit({ id: outcome.asset.id, title: outcome.asset.title });
        return;
      }
      if (outcome.status === "processing" && outcome.assetId) {
        // The bytes are stored and catalogued; only content validation is
        // outstanding. The asset id is still a valid reference, so keep it —
        // the cron sweep promotes the row and the thumbnail resolves then.
        updateEntry(entry.id, { status: "ready", progress: 100 });
        commit({ id: outcome.assetId, title: titleFromFilename(entry.file.name) });
        return;
      }
      updateEntry(entry.id, {
        status: "failed",
        error: t("media.verificationFailed"),
      });
    } catch (error) {
      updateEntry(entry.id, {
        status: "failed",
        error:
          error instanceof Error ? uploadFailureMessage(t, error.message) : t("media.uploadError"),
      });
    } finally {
      activeRequests.current.delete(entry.id);
    }
  }

  function addFiles(files: FileList | File[]) {
    const next: QueueEntry[] = [];
    for (const file of Array.from(files)) {
      const contentType = file.type || "";
      const kind = classifyMediaKind(contentType);
      const entry: QueueEntry = {
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        status: "uploading",
        progress: 0,
        ...(kind === "image" ? {} : { status: "failed", error: t("media.unsupportedType") }),
        ...(kind === "image" && file.size > MEDIA_SIZE_LIMITS.image
          ? { status: "failed", error: t("media.fileTooLarge") }
          : {}),
      };
      next.push(entry);
    }
    if (next.length === 0) return;
    setQueueEntries((current) => [...current, ...next]);
    for (const entry of next) {
      if (entry.status === "uploading") void runUpload(entry);
    }
  }

  function removeImage(id: string) {
    const next = value.filter((image) => image.id !== id);
    // Keep the mirror in step so an upload that lands a moment later reads
    // the list as it is now, not the one the removal started from.
    listRef.current = next;
    onChange(next);
  }

  const busy = queue.some((entry) => entry.status === "uploading");

  return (
    <div className="space-y-3" data-testid="reference-image-uploader">
      <label
        htmlFor={inputId}
        data-testid="reference-image-dropzone"
        className={`border-border bg-surface-subtle flex min-h-20 cursor-pointer flex-col items-start justify-center gap-1 rounded-[var(--radius-control)] border-2 border-dashed px-4 py-3 transition-colors ${
          disabled
            ? "pointer-events-none opacity-50"
            : dragging
              ? "border-primary bg-primary-subtle"
              : "hover:border-primary"
        }`}
        onDragOver={(event) => {
          if (disabled) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (disabled) return;
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
        }}
      >
        <span className="text-body text-fg-primary flex items-center gap-2 font-semibold">
          <Upload className="text-primary h-4 w-4 shrink-0" aria-hidden="true" />
          {t("media.chooseFiles")}
        </span>
        <span className="text-label text-fg-muted">
          {t("formatEditor.fields.requiredImageUploadsHint")}
        </span>
        <input
          id={inputId}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.currentTarget.value = "";
          }}
        />
      </label>

      {queue.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-live="polite">
          {queue.map((entry) => (
            <li key={entry.id} className="space-y-1.5">
              <div
                className="border-border bg-surface-subtle relative aspect-square overflow-hidden rounded-[var(--radius-control)] border"
                data-testid={`reference-image-queue-${entry.id}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local
                    object URL for the in-flight preview. */}
                <img
                  src={entry.previewUrl}
                  alt={entry.file.name}
                  className="size-full object-contain"
                />{" "}
                {entry.status === "uploading" ? (
                  <span className="text-label text-fg-primary bg-surface/90 absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 py-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    {entry.progress}%
                  </span>
                ) : null}
              </div>
              <p className="text-label text-fg-muted truncate">{entry.file.name}</p>
              {entry.error ? (
                <p className="text-label text-danger" role="alert">
                  {entry.error}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        <p className="text-label text-fg-secondary font-semibold">
          {t("formatEditor.fields.requiredImageUploadsLabel")}
        </p>
        {value.length === 0 && !busy ? (
          <p className="text-label text-fg-muted mt-1">
            {t("formatEditor.fields.requiredImageUploadsEmpty")}
          </p>
        ) : null}
        {value.length > 0 ? (
          <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {value.map((image) => (
              <li key={image.id} className="space-y-1.5" data-testid="reference-image-item">
                <div className="border-border bg-surface-subtle relative aspect-square overflow-hidden rounded-[var(--radius-control)] border">
                  <ReferenceThumbnail id={image.id} title={image.title} />
                  {!disabled ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="absolute end-1 top-1 h-10 w-10"
                      onClick={() => removeImage(image.id)}
                      aria-label={t("formatEditor.fields.requiredImageRemove", {
                        title: image.title,
                      })}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
                <p className="text-label text-fg-muted truncate" title={image.title}>
                  {image.title}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
