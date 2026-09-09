"use client";

import * as React from "react";
import { Check, Copy, Download, Loader2, Share2 } from "lucide-react";
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

export function MediaCollectionActions({
  assetIds,
  title,
  sourceType,
  sourceId,
  deliveryVersionId,
  compact = false,
  downloadLabelKey = "media.downloadZip",
  shareLabelKey = "media.shareCollection",
}: {
  assetIds?: string[];
  title: string;
  sourceType?: "delivery_version" | "library_selection";
  sourceId?: string;
  deliveryVersionId?: string;
  compact?: boolean;
  downloadLabelKey?: string;
  shareLabelKey?: string;
}) {
  const t = useLocaleT();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState<string | null>(null);
  const [shareId, setShareId] = React.useState<string | null>(null);
  const [expiresAt, setExpiresAt] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const ids = assetIds ?? [];
  const canAct = Boolean(deliveryVersionId || ids.length > 0);
  const nativeShareSupported =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function downloadZip() {
    if (!canAct) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/media/export/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/zip" },
        body: JSON.stringify(
          deliveryVersionId ? { deliveryVersionId } : { assetIds: ids, filenameBase: title },
        ),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { code?: string } | null;
        throw new Error(payload?.code === "media.zip_too_large" ? "too_large" : "failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${title.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "media-assets"}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === "too_large"
          ? t("media.zipTooLarge")
          : t("media.collectionActionError"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function createShare() {
    if (!sourceType || (!sourceId && sourceType === "delivery_version")) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/media/share-collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceType,
          ...(sourceId ? { sourceId } : {}),
          ...(sourceType === "library_selection" ? { assetIds: ids } : {}),
          title,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        id?: string;
        url?: string;
        expiresAt?: string;
      } | null;
      if (!response.ok || !payload?.url) throw new Error("failed");
      setShareUrl(payload.url);
      setShareId(payload.id ?? null);
      setExpiresAt(payload.expiresAt ?? null);
    } catch {
      setError(t("media.collectionActionError"));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(t("media.collectionActionError"));
    }
  }

  async function nativeShare() {
    if (!shareUrl || typeof navigator.share !== "function") return;
    try {
      await navigator.share({ title, text: t("media.collectionShareDescription"), url: shareUrl });
    } catch {
      /* dismissed */
    }
  }

  function shareWhatsApp() {
    if (shareUrl)
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`${title}: ${shareUrl}`)}`,
        "_blank",
        "noopener,noreferrer",
      );
  }

  async function revokeShare() {
    if (!shareId) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/media/share-collections/${encodeURIComponent(shareId)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("failed");
      setShareUrl(null);
      setShareId(null);
      setExpiresAt(null);
    } catch {
      setError(t("media.collectionActionError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2" data-testid="media-collection-actions">
        <Button
          type="button"
          size={compact ? "sm" : "default"}
          variant="outline"
          disabled={!canAct || busy}
          onClick={() => void downloadZip()}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          {t(downloadLabelKey)}
        </Button>
        {sourceType ? (
          <Button
            type="button"
            size={compact ? "sm" : "default"}
            variant="secondary"
            disabled={!canAct || busy}
            onClick={() => {
              setShareOpen(true);
              if (!shareUrl) void createShare();
            }}
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            {t(shareLabelKey)}
          </Button>
        ) : null}
        {error ? (
          <p className="text-label text-danger basis-full" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent closeAriaLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("media.shareCollection")}</DialogTitle>
            <DialogDescription>{t("media.collectionShareDescription")}</DialogDescription>
          </DialogHeader>
          {shareUrl ? (
            <div className="grid gap-3">
              <Input
                value={shareUrl}
                readOnly
                dir="ltr"
                aria-label={t("media.collectionShareUrl")}
              />
              <p className="text-label text-fg-muted">
                {expiresAt
                  ? t("media.publicLinkExpires", {
                      date: new Intl.DateTimeFormat("en-GB", {
                        dateStyle: "medium",
                        numberingSystem: "latn",
                      }).format(new Date(expiresAt)),
                    })
                  : null}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => void copyLink()}>
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
            </div>
          ) : (
            <p className="text-body text-fg-secondary" role="status">
              {t("media.creatingCollection")}
            </p>
          )}
          <DialogFooter>
            {shareId ? (
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => void revokeShare()}
              >
                {t("media.revokeCollection")}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={() => setShareOpen(false)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
