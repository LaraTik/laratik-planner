"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Eye, Images, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocaleT } from "@/components/i18n/locale-provider";

export type MediaGalleryAsset = {
  id: string;
  url: string;
  label: string;
  kind: "image" | "video";
};

export function MediaAssetGallery({
  title,
  assets,
}: {
  title: string;
  assets: MediaGalleryAsset[];
}) {
  const t = useLocaleT();
  const [open, setOpen] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  const active = assets[index];

  React.useEffect(() => {
    if (!open || assets.length < 2) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((current) => (current - 1 + assets.length) % assets.length);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((current) => (current + 1) % assets.length);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [assets.length, open]);

  if (!active || assets.length === 0) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setIndex(0);
          setOpen(true);
        }}
        data-testid="media-asset-gallery-trigger"
      >
        <Images className="h-3.5 w-3.5" aria-hidden="true" />
        {t("contentDetail.deliveries.openAssets")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-5xl"
          closeAriaLabel={t("common.close")}
          data-testid="media-asset-gallery"
        >
          <DialogHeader>
            <DialogTitle dir="auto">{title}</DialogTitle>
            <DialogDescription>
              {t("contentDetail.deliveries.galleryCounter", {
                current: index + 1,
                count: assets.length,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="bg-surface-subtle relative flex min-h-[min(62dvh,680px)] items-center justify-center overflow-hidden rounded-[var(--radius-control)] p-3">
              {assets.length > 1 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute start-3 z-10 shadow-sm"
                  aria-label={t("contentDetail.deliveries.galleryPrevious")}
                  onClick={() =>
                    setIndex((current) => (current - 1 + assets.length) % assets.length)
                  }
                >
                  <ChevronLeft className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
                </Button>
              ) : null}
              {active.kind === "image" ? (
                // The private media route authenticates with the browser session.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={active.url}
                  alt={active.label}
                  className="max-h-[58dvh] max-w-full object-contain"
                  decoding="async"
                />
              ) : (
                <video
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[58dvh] max-w-full"
                  aria-label={active.label}
                >
                  <source src={active.url} />
                </video>
              )}
              {assets.length > 1 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute end-3 z-10 shadow-sm"
                  aria-label={t("contentDetail.deliveries.galleryNext")}
                  onClick={() => setIndex((current) => (current + 1) % assets.length)}
                >
                  <ChevronRight className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
            {assets.length > 1 ? (
              <ol className="flex max-w-full gap-2 overflow-x-auto pb-1" aria-label={title}>
                {assets.map((asset, assetIndex) => (
                  <li key={asset.id} className="shrink-0">
                    <button
                      type="button"
                      className={`border-border focus-visible:ring-focus-ring relative flex h-16 w-20 items-center justify-center overflow-hidden rounded-[var(--radius-control)] border focus:outline-none focus-visible:ring-2 ${assetIndex === index ? "ring-primary ring-2" : ""}`}
                      aria-label={`${asset.label} (${assetIndex + 1} / ${assets.length})`}
                      aria-current={assetIndex === index ? "true" : undefined}
                      onClick={() => setIndex(assetIndex)}
                    >
                      {asset.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={asset.url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Video className="text-fg-muted h-5 w-5" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                ))}
              </ol>
            ) : null}
            <p className="text-label text-fg-muted inline-flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              {t("contentDetail.deliveries.galleryKeyboardHint")}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
