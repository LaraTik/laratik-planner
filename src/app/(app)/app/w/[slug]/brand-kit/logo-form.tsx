"use client";
import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2, Upload, Link as LinkIcon, Image as ImageIcon } from "lucide-react";
import { createLogoAssetAction } from "./actions";
import { useSuccessReset } from "@/lib/brand/use-success-reset";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/forms/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * LogoForm — two-mode create form for the brand-kit Logo section.
 *
 *  - "Upload" — the user picks a local file, we POST to
 *    `/api/uploads/sign` for a signed URL, then `PUT` the file
 *    bytes to `/api/uploads` with the token. On success, we hand
 *    the returned `storagePath` to the server action which writes
 *    the brand_asset row.
 *  - "External URL" — the user pastes a `https://` URL directly
 *    and the action writes it as `externalUrl`.
 *
 * The form is a `useActionState` shell so the network roundtrip +
 * revalidation is owned by the server action; only the upload
 * presign step is a client fetch.
 */
type Mode = "upload" | "url";

const MAX_LOGO_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTS = ["png", "jpg", "jpeg", "svg", "webp", "gif"] as const;
type AllowedExt = (typeof ALLOWED_EXTS)[number];

function extOf(name: string): AllowedExt | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return (ALLOWED_EXTS as readonly string[]).includes(ext) ? (ext as AllowedExt) : null;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function uploadFile(args: {
  workspaceId: string;
  file: File;
}): Promise<{ storagePath: string; fileId: string; size: number }> {
  const ext = extOf(args.file.name);
  if (!ext) {
    throw new Error(`Unsupported file type. Allowed: ${ALLOWED_EXTS.join(", ")}`);
  }
  if (args.file.size > MAX_LOGO_BYTES) {
    throw new Error(`Logo too large. Max ${formatBytes(MAX_LOGO_BYTES)}.`);
  }

  const signRes = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: args.workspaceId,
      kind: "logo",
      ext,
      fileSize: args.file.size,
    }),
  });
  if (!signRes.ok) {
    const body = (await signRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Sign failed (${signRes.status})`);
  }
  const signed = (await signRes.json()) as { uploadUrl: string; fileId: string; expiresAt: number };

  const putRes = await fetch(signed.uploadUrl, {
    method: "PUT",
    body: args.file,
  });
  if (!putRes.ok) {
    const body = (await putRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Upload failed (${putRes.status})`);
  }
  return (await putRes.json()) as { storagePath: string; fileId: string; size: number };
}

export function LogoForm({ slug, workspaceId }: { slug: string; workspaceId: string }) {
  const [state, action] = useActionState(
    createLogoAssetAction.bind(null, slug),
    {} as { error?: string; success?: boolean },
  );
  const [mode, setMode] = React.useState<Mode>("upload");
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [uploadedPath, setUploadedPath] = React.useState<string | null>(null);
  const [urlValue, setUrlValue] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  // Round 5: reset the form on success so the user can add a
  // second logo without manually clearing the name + URL.
  useSuccessReset(state, formRef);

  // Reset upload state when the user switches mode.
  function onModeChange(next: Mode) {
    setMode(next);
    setUploadError(null);
    setFile(null);
    setUploadedPath(null);
  }

  // Read selected file as a data URL for the preview thumbnail.
  // We compute the object URL synchronously (via useMemo) so we
  // don't trigger a setState-in-effect cascade. The cleanup runs
  // when the memo invalidates on the next render.
  const previewUrl = React.useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0] ?? null;
    setFile(next);
    setUploadedPath(null);
    setUploadError(null);
    if (next) {
      setUploading(true);
      try {
        const result = await uploadFile({ workspaceId, file: next });
        setUploadedPath(result.storagePath);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
        setUploadedPath(null);
      } finally {
        setUploading(false);
      }
    }
  }

  return (
    <Card padding="md" className="mb-3">
      <form ref={formRef} action={action} className="grid gap-3">
        <fieldset className="flex flex-wrap items-center gap-2" aria-label="Logo source">
          <legend className="sr-only">Logo source</legend>
          <ModeButton
            current={mode}
            value="upload"
            onClick={() => onModeChange("upload")}
            icon={<Upload className="h-4 w-4" aria-hidden="true" />}
            label="Upload"
          />
          <ModeButton
            current={mode}
            value="url"
            onClick={() => onModeChange("url")}
            icon={<LinkIcon className="h-4 w-4" aria-hidden="true" />}
            label="External URL"
          />
        </fieldset>

        {mode === "upload" ? (
          <div className="grid gap-2">
            <FormField
              id="logo-file"
              label="Logo file"
              hint="PNG, JPG, SVG, WebP, or GIF up to 10 MB."
              required
              className="border-border bg-surface-subtle rounded-[var(--radius-control)] border-2 border-dashed p-3"
            >
              <input
                ref={fileInputRef}
                id="logo-file"
                name="logo-file"
                type="file"
                accept={ALLOWED_EXTS.map((e) => `.${e}`).join(",")}
                onChange={onFileChange}
                className="text-body file:border-border file:bg-surface file:text-fg-primary file:mr-3 file:rounded-[var(--radius-control)] file:border file:px-3 file:py-1.5 file:font-semibold"
                disabled={uploading}
                aria-describedby="logo-file-status"
              />
            </FormField>
            <div id="logo-file-status" className="text-label text-fg-muted" aria-live="polite">
              {uploading ? (
                <span>Uploading…</span>
              ) : file ? (
                <span>
                  {file.name} ({formatBytes(file.size)})
                </span>
              ) : (
                <span>PNG, JPG, SVG, WebP, or GIF up to 10 MB.</span>
              )}
            </div>
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt=""
                width={40}
                height={40}
                className="border-border bg-surface-subtle h-10 w-10 rounded border object-contain"
              />
            ) : null}
            {uploadError ? (
              <p role="alert" className="text-label text-danger font-semibold">
                {uploadError}
              </p>
            ) : null}
            {/* Hidden field populated by the upload step. The form
                submits the storagePath to the server action. */}
            <input
              type="hidden"
              name="storagePath"
              value={uploadedPath ?? ""}
              data-testid="logo-storage-path"
            />
          </div>
        ) : (
          <FormField id="logo-external-url" label="HTTPS URL" required>
            <Input
              id="logo-external-url"
              className="mt-0"
              type="url"
              name="externalUrl"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              placeholder="https://cdn.example.com/logo.svg"
              // Tighter pattern (Round 5): the old https://.* matched
              // 'https:// ' (whitespace) and 'https://-invalid'. The
              // new pattern enforces https:// + a domain-like host.
              // The server-side Zod schema (.url().refine(...)) is
              // the real source of truth; the pattern is a UX hint.
              pattern="https://[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}.*"
              required
              maxLength={500}
            />
          </FormField>
        )}

        <FormField id="logo-name" label="Logo name" required>
          <Input
            id="logo-name"
            className="mt-0"
            name="name"
            required
            maxLength={120}
            placeholder="Wordmark, Icon, Dark variant…"
          />
        </FormField>

        <div className="flex items-center justify-end">
          <SubmitButton mode={mode} uploaded={!!uploadedPath} uploading={uploading} />
        </div>
        {state?.error ? (
          <p role="alert" className="text-label text-danger font-semibold">
            {state.error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}

function ModeButton({
  current,
  value,
  onClick,
  icon,
  label,
}: {
  current: Mode;
  value: Mode;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  const active = current === value;
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      aria-pressed={active}
      data-testid={`logo-mode-${value}`}
    >
      {icon}
      {label}
    </Button>
  );
}

/**
 * Submit button with two disabled states: the server action is
 * in flight (useFormStatus) OR the upload hasn't completed (so the
 * storagePath is empty). We can't use `FormSubmitButton` here
 * because the upload step happens in a separate client fetch, not
 * in the form's React server action.
 */
function SubmitButton({
  mode,
  uploaded,
  uploading,
}: {
  mode: Mode;
  uploaded: boolean;
  uploading: boolean;
}) {
  const { pending } = useFormStatus();
  const uploadIncomplete = mode === "upload" && (!uploaded || uploading);
  const disabled = pending || uploadIncomplete;
  return (
    <Button
      type="submit"
      size="default"
      variant="default"
      disabled={disabled}
      aria-busy={pending || undefined}
      data-testid="logo-submit"
    >
      {pending ? "Adding…" : "Add logo"}
    </Button>
  );
}

// Export the storage-path-clear helper so tests can call it via
// the `data-testid` on the hidden input.
export const __testIds = {
  storagePath: "logo-storage-path",
  uploadMode: "logo-mode-upload",
  urlMode: "logo-mode-url",
};

// Re-export the upload helper to keep it testable from the unit
// suite without exposing it through a separate module path.
export { uploadFile };

// Convenience export for the trash button on the asset list so the
// page can import the same icon (kept here to avoid an extra import
// in page.tsx).
export { Trash2 };
