"use client";

import * as React from "react";
import { FilePlus2, FileText, ImageIcon, Link as LinkIcon, Loader2, Play, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Props = {
  taskId: string;
  label: string;
  uploadingLabel: string;
  errorLabel: string;
  sourceDeviceLabel: string;
  sourceLinkLabel: string;
  linkPlaceholder: string;
  addLinkLabel: string;
  previewLabel: string;
  retryLabel: string;
  removeLabel: string;
  onUploaded?: () => void;
};

export function TaskAttachmentUpload({
  taskId,
  label,
  uploadingLabel,
  errorLabel,
  sourceDeviceLabel,
  sourceLinkLabel,
  linkPlaceholder,
  addLinkLabel,
  previewLabel,
  retryLabel,
  removeLabel,
  onUploaded,
}: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<"device" | "link">("device");
  const previewUrl = React.useMemo(
    () => (file && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null),
    [file],
  );

  React.useEffect(() => {
    return () => {
      if (previewUrl && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function reset() {
    setFile(null);
    setUrl("");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function uploadSelectedFile() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const sign = await fetch(`/api/tasks/${taskId}/attachments/sign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          originalName: file.name,
          contentType: file.type || "application/octet-stream",
          byteSize: file.size,
        }),
      });
      if (!sign.ok) throw new Error("sign");
      const payload = (await sign.json()) as {
        attachmentId: string;
        uploadUrl: string;
        proxyUploadUrl?: string;
        requiredHeaders?: Record<string, string>;
      };
      try {
        const uploaded = await fetch(payload.uploadUrl, {
          method: "PUT",
          ...(payload.requiredHeaders ? { headers: payload.requiredHeaders } : {}),
          body: file,
        });
        if (!uploaded.ok) throw new Error("upload");
      } catch (uploadError) {
        if (!payload.proxyUploadUrl) throw uploadError;
        const proxied = await fetch(payload.proxyUploadUrl, { method: "PUT", body: file });
        if (!proxied.ok) throw new Error("upload");
      }
      const complete = await fetch(`/api/tasks/${taskId}/attachments/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attachmentId: payload.attachmentId }),
      });
      if (!complete.ok) throw new Error("complete");
      onUploaded?.();
      reset();
      router.refresh();
    } catch {
      setError(errorLabel);
    } finally {
      setBusy(false);
    }
  }

  async function addLink() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}/attachments/link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) throw new Error("link");
      onUploaded?.();
      reset();
      router.refresh();
    } catch {
      setError(errorLabel);
    } finally {
      setBusy(false);
    }
  }

  const canRetry = source === "device" ? file !== null : url.trim().length > 0;
  return (
    <div className="min-w-[min(100%,22rem)]">
      <Tabs value={source} onValueChange={(value) => setSource(value as "device" | "link")}>
        <TabsList className="h-auto w-full">
          <TabsTrigger value="device" className="min-h-11 flex-1">
            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
            {sourceDeviceLabel}
          </TabsTrigger>
          <TabsTrigger value="link" className="min-h-11 flex-1">
            <LinkIcon className="h-4 w-4" aria-hidden="true" />
            {sourceLinkLabel}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="device" className="mt-3 space-y-3">
          {file ? (
            <div className="border-border bg-surface-subtle flex items-center gap-3 rounded-[var(--radius-control)] border p-3">
              <AttachmentPreview file={file} src={previewUrl} label={previewLabel} />
              <div className="min-w-0 flex-1">
                <p className="text-body truncate font-semibold">{file.name}</p>
                <p className="text-label text-fg-muted">{previewLabel}</p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={removeLabel}
                disabled={busy}
                onClick={reset}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ) : null}
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <FilePlus2 className="h-4 w-4" aria-hidden="true" />
              {label}
            </Button>
            {file ? (
              <Button type="button" disabled={busy} onClick={() => void uploadSelectedFile()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {busy ? uploadingLabel : label}
              </Button>
            ) : null}
          </div>
        </TabsContent>
        <TabsContent value="link" className="mt-3 flex gap-2">
          <Input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={linkPlaceholder}
            aria-label={linkPlaceholder}
            className="mt-0 min-h-11"
            disabled={busy}
          />
          <Button type="button" disabled={busy || !url.trim()} onClick={() => void addLink()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {addLinkLabel}
          </Button>
        </TabsContent>
      </Tabs>
      {error ? (
        <div className="mt-2 flex items-center gap-2" role="alert">
          <p className="text-label text-danger">{error}</p>
          {canRetry ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void (source === "device" ? uploadSelectedFile() : addLink())}
            >
              {retryLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AttachmentPreview({
  file,
  src,
  label,
}: {
  file: File;
  src: string | null;
  label: string;
}) {
  if (src && file.type.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={label} className="h-14 w-14 rounded object-cover" />;
  }
  if (src && file.type.startsWith("video/")) {
    return (
      <video
        src={src}
        muted
        playsInline
        className="h-14 w-14 rounded object-cover"
        aria-label={label}
      />
    );
  }
  return file.type.startsWith("video/") ? (
    <Play className="text-primary h-7 w-7" aria-hidden="true" />
  ) : file.type.startsWith("image/") ? (
    <ImageIcon className="text-primary h-7 w-7" aria-hidden="true" />
  ) : (
    <FileText className="text-primary h-7 w-7" aria-hidden="true" />
  );
}
