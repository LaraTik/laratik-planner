"use client";

import * as React from "react";
import { FilePlus2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TaskAttachmentUpload({
  taskId,
  label,
  uploadingLabel,
  errorLabel,
  onUploaded,
}: {
  taskId: string;
  label: string;
  uploadingLabel: string;
  errorLabel: string;
  onUploaded?: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function upload(file: File) {
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
        requiredHeaders?: Record<string, string>;
      };
      const uploaded = await fetch(payload.uploadUrl, {
        method: "PUT",
        ...(payload.requiredHeaders ? { headers: payload.requiredHeaders } : {}),
        body: file,
      });
      if (!uploaded.ok) throw new Error("upload");
      const complete = await fetch(`/api/tasks/${taskId}/attachments/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attachmentId: payload.attachmentId }),
      });
      if (!complete.ok) throw new Error("complete");
      onUploaded?.();
    } catch {
      setError(errorLabel);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }
  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <FilePlus2 className="h-4 w-4" aria-hidden="true" />
        )}
        {busy ? uploadingLabel : label}
      </Button>
      {error ? (
        <p className="text-label text-danger mt-2" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
