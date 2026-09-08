"use client";

import * as React from "react";
import {
  Check,
  Copy,
  ExternalLink,
  FolderInput,
  Loader2,
  RotateCcw,
  Share2,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useLocaleT } from "@/components/i18n/locale-provider";

type FolderOption = { id: string; name: string };

export function MediaAssetActions({
  assetId,
  title,
  kind,
  trashed,
  visibility,
  folderId,
  folderOptions,
  canManage,
}: {
  assetId: string;
  title: string;
  kind: "image" | "video" | "document";
  trashed: boolean;
  visibility: "workspace" | "agency";
  folderId: string | null;
  folderOptions: FolderOption[];
  canManage: boolean;
}) {
  const t = useLocaleT();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [shared, setShared] = React.useState(visibility === "agency");
  const [currentFolderId, setCurrentFolderId] = React.useState(folderId ?? "");
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [publicUrl, setPublicUrl] = React.useState<string | null>(null);
  const [publicExpiresAt, setPublicExpiresAt] = React.useState<string | null>(null);
  const [publicActive, setPublicActive] = React.useState(false);
  const [publicBusy, setPublicBusy] = React.useState(false);
  const [publicError, setPublicError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const nativeShareSupported =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  if (!canManage) return null;

  function setFeedback(message: string) {
    setStatus(message);
    setError(null);
  }

  async function request(input: RequestInit, successMessage?: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/media/assets/${encodeURIComponent(assetId)}`, input);
      if (!response.ok) throw new Error("media action failed");
      if (successMessage) setFeedback(successMessage);
      router.refresh();
      return true;
    } catch {
      setError(t("media.manageError"));
      setStatus(null);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function updateVisibility(next: "workspace" | "agency") {
    const saved = await request(
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      },
      next === "agency" ? t("media.shareSuccess") : t("media.unshareSuccess"),
    );
    if (saved) setShared(next === "agency");
  }

  async function moveToFolder(nextFolderId: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/media/assets/${encodeURIComponent(assetId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: nextFolderId || null }),
      });
      if (!response.ok) throw new Error("move failed");
      setCurrentFolderId(nextFolderId);
      setFeedback(t("media.moved"));
      router.refresh();
    } catch {
      setError(t("media.moveError"));
    } finally {
      setBusy(false);
    }
  }

  async function loadPublicStatus() {
    setPublicBusy(true);
    setPublicError(null);
    try {
      const response = await fetch(`/api/media/assets/${encodeURIComponent(assetId)}/public-link`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("public link status failed");
      const payload = (await response.json()) as { active?: boolean; expiresAt?: string | null };
      setPublicActive(payload.active === true);
      setPublicExpiresAt(payload.expiresAt ?? null);
    } catch {
      setPublicError(t("media.publicLinkError"));
    } finally {
      setPublicBusy(false);
    }
  }

  async function createPublicLink() {
    setPublicBusy(true);
    setPublicError(null);
    try {
      const response = await fetch(`/api/media/assets/${encodeURIComponent(assetId)}/public-link`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("public link create failed");
      const payload = (await response.json()) as { url?: string; expiresAt?: string };
      if (!payload.url || !payload.expiresAt) throw new Error("public link response incomplete");
      setPublicUrl(payload.url);
      setPublicExpiresAt(payload.expiresAt);
      setPublicActive(true);
      setFeedback(t("media.publicLinkCreated"));
    } catch {
      setPublicError(t("media.publicLinkError"));
    } finally {
      setPublicBusy(false);
    }
  }

  async function revokePublicLink() {
    if (!window.confirm(t("media.revokePublicLinkConfirm"))) return;
    setPublicBusy(true);
    setPublicError(null);
    try {
      const response = await fetch(`/api/media/assets/${encodeURIComponent(assetId)}/public-link`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("public link revoke failed");
      setPublicUrl(null);
      setPublicActive(false);
      setPublicExpiresAt(null);
      setFeedback(t("media.publicLinkRevoked"));
    } catch {
      setPublicError(t("media.publicLinkError"));
    } finally {
      setPublicBusy(false);
    }
  }

  async function copyPublicLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setPublicError(t("media.publicLinkError"));
    }
  }

  function shareWhatsApp() {
    if (!publicUrl) return;
    const text = `${title}: ${publicUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  async function nativeShare() {
    if (!publicUrl || typeof navigator.share !== "function") return;
    try {
      await navigator.share({ title, text: t("media.publicShareDescription"), url: publicUrl });
    } catch {
      // Users can dismiss the native share sheet; that is not an error state.
    }
  }

  const expiryLabel = publicExpiresAt
    ? t("media.publicLinkExpires", {
        date: new Intl.DateTimeFormat("en-GB", {
          dateStyle: "medium",
          numberingSystem: "latn",
        }).format(new Date(publicExpiresAt)),
      })
    : null;

  return (
    <>
      <div className="border-border mt-2 grid gap-2 border-t pt-2">
        <form
          className="flex min-w-0 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const nextTitle = String(data.get("title") ?? "").trim();
            if (nextTitle)
              void request({
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: nextTitle }),
              });
          }}
        >
          <Input
            name="title"
            defaultValue={title}
            aria-label={t("media.titleLabel")}
            className="mt-0 h-9 min-w-0"
          />
          <Button type="submit" size="sm" variant="outline" disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              t("common.save")
            )}
          </Button>
        </form>

        {folderOptions.length > 0 || currentFolderId ? (
          <label
            className="text-label text-fg-secondary flex items-center gap-2"
            htmlFor={`media-folder-${assetId}`}
          >
            <FolderInput className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">{t("media.moveMedia")}</span>
            <select
              id={`media-folder-${assetId}`}
              value={currentFolderId}
              disabled={busy}
              onChange={(event) => void moveToFolder(event.target.value)}
              className="border-border bg-surface text-fg-primary focus-visible:ring-focus-ring min-h-10 min-w-0 flex-1 rounded-[var(--radius-control)] border px-2 focus-visible:ring-2"
            >
              <option value="">{t("media.moveUnfiled")}</option>
              {folderOptions.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {!trashed ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={shared ? "secondary" : "ghost"}
              disabled={busy}
              onClick={() => void updateVisibility(shared ? "workspace" : "agency")}
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              {busy ? t("media.sharing") : shared ? t("media.stopSharing") : t("media.share")}
            </Button>
            {kind === "image" ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setShareOpen(true);
                  void loadPublicStatus();
                }}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                {t("media.publicShare")}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (window.confirm(t("media.trashConfirm"))) void request({ method: "DELETE" });
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {t("media.trash")}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void request({
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "restore" }),
              })
            }
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t("media.restore")}
          </Button>
        )}
      </div>
      {status ? (
        <p className="text-label text-success" role="status" aria-live="polite">
          <Check className="me-1 inline h-3.5 w-3.5" aria-hidden="true" />
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="text-label text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent closeAriaLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("media.createPublicLink")}</DialogTitle>
            <DialogDescription>{t("media.publicLinkDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {publicActive && expiryLabel ? (
              <p className="text-label text-fg-secondary" role="status">
                {expiryLabel}
              </p>
            ) : null}
            {publicUrl ? (
              <>
                <Input value={publicUrl} readOnly dir="ltr" aria-label={t("media.publicShare")} />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => void copyPublicLink()}>
                    {copied ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    )}
                    {copied ? t("media.copied") : t("media.copyLink")}
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={shareWhatsApp}>
                    {t("media.shareWhatsApp")}
                  </Button>
                  {nativeShareSupported ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void nativeShare()}
                    >
                      {t("media.shareNative")}
                    </Button>
                  ) : null}
                </div>
              </>
            ) : null}
            {publicError ? (
              <p className="text-label text-danger" role="alert">
                {publicError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            {publicActive ? (
              <Button
                type="button"
                variant="destructive"
                disabled={publicBusy}
                onClick={() => void revokePublicLink()}
              >
                {publicBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                {t("media.revokePublicLink")}
              </Button>
            ) : null}
            <Button type="button" disabled={publicBusy} onClick={() => void createPublicLink()}>
              {publicBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {t("media.createPublicLink")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
