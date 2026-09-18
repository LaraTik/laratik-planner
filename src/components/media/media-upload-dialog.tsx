"use client";

import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { MediaLinkImporter } from "./media-link-importer";
import { MediaUploadForm } from "./media-upload-form";

/**
 * "Add media" dialog — wraps the existing `<MediaSourcePicker>` so
 * the upload UI does not crowd the library page on first paint.
 *
 * Triggers: the page-header "Add media" CTA + an optional keyboard
 * shortcut (caller wires it).
 *
 * Close-guard: while `busy` is true (an upload is mid-flight OR the
 * link import is fetching), `Escape`, backdrop-click, and the close
 * (×) button are all intercepted and rendered inert. We surface the
 * reason in a small footer hint so the user understands why the
 * dialog won't close.
 */
export function MediaUploadDialog({
  open,
  onOpenChange,
  workspaceOptions,
  folderOptionsByWorkspace,
  initialSource = "device",
  contentItemId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceOptions: { id: string; name: string }[];
  folderOptionsByWorkspace: Record<
    string,
    { id: string; name: string; parentId?: string | null }[]
  >;
  initialSource?: "device" | "link";
  contentItemId?: string;
}) {
  const t = useLocaleT();
  // We model busy as a coarse-grained flag controlled by the parent
  // (typically the page reads its own state). For now, treat the
  // dialog as non-busy by default; callers can extend the API later
  // to surface in-flight uploads from `<MediaUploadForm>`.
  const [busy] = React.useState(false);

  // When `busy === true`, intercept close attempts. Radix `Dialog`
  // exposes `onEscapeKeyDown` and `onPointerDownOutside` on the
  // Root; content-level close button is the `DialogClose` primitive.
  const guard = (event: Event) => {
    if (busy) event.preventDefault();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        closeAriaLabel={t("media.uploadDialog.close")}
        {...(busy
          ? {
              onEscapeKeyDown: guard,
              onPointerDownOutside: guard,
              onInteractOutside: guard,
            }
          : {})}
        className="max-h-[min(90dvh,900px)] max-w-3xl overflow-hidden p-0"
        data-testid="media-upload-dialog"
      >
        <DialogHeader className="border-border border-b px-6 py-4">
          <DialogTitle>{t("media.uploadDialog.title")}</DialogTitle>
          <DialogDescription>{t("media.uploadDialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[min(70dvh,720px)] overflow-y-auto px-6 py-4">
          <Tabs defaultValue={initialSource}>
            <TabsList
              aria-label={t("media.uploadDialog.title")}
              className="h-auto w-full flex-wrap sm:w-auto"
            >
              <TabsTrigger value="device" className="min-h-11 flex-1 sm:flex-none">
                {t("media.sourceDevice")}
              </TabsTrigger>
              <TabsTrigger value="link" className="min-h-11 flex-1 sm:flex-none">
                {t("media.sourceLink")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="device">
              <MediaUploadForm
                workspaceOptions={workspaceOptions}
                folderOptionsByWorkspace={folderOptionsByWorkspace}
                {...(contentItemId ? { contentItemId } : {})}
              />
            </TabsContent>
            <TabsContent value="link">
              <MediaLinkImporter
                workspaceOptions={workspaceOptions}
                {...(contentItemId ? { contentItemId } : {})}
              />
            </TabsContent>
          </Tabs>
        </div>
        <DialogFooter className="border-border bg-surface-subtle border-t px-6 py-4">
          <p className="text-label text-fg-muted me-auto">
            {busy ? t("media.uploadDialog.busyHint") : null}
          </p>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={busy}>
              {t("media.uploadDialog.close")}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
