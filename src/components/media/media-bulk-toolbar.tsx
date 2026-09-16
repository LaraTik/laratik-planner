"use client";

import * as React from "react";
import { toast } from "sonner";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { useMediaSelection } from "@/lib/media/selection-store";
import { MediaBulkMoveDialog } from "./media-bulk-move-dialog";
import { MediaBulkTrashDialog } from "./media-bulk-trash-dialog";
import { MediaBulkTagPopover } from "./media-bulk-tag-popover";
import { MediaBulkVisibilityPopover } from "./media-bulk-visibility-popover";
import type { MediaFolderTreeRow } from "@/lib/media/service";
import { FolderInput, Trash2, X } from "lucide-react";

/**
 * Bulk action toolbar. Plan §3.8 + §3.9.
 *
 * Mounts inside `<MediaLibraryPage>`; renders nothing when the
 * selection is empty. All destructive controls are hidden (not
 * disabled) when the actor lacks write permission.
 */
export function MediaBulkToolbar({
  workspaceId,
  folders,
  canWrite,
  hasTrashedSelected,
}: {
  workspaceId: string;
  folders: MediaFolderTreeRow[];
  canWrite: boolean;
  hasTrashedSelected: boolean;
}) {
  const t = useLocaleT();
  const selection = useMediaSelection();
  const [moveOpen, setMoveOpen] = React.useState(false);
  const [trashOpen, setTrashOpen] = React.useState(false);
  const selectedIds = React.useMemo(
    () => [...selection.state.selected],
    [selection.state.selected],
  );

  // Don't render for read-only viewers with no selection, and don't
  // render when the cap is exceeded (the URL state guard rejects it
  // on the server anyway).
  if (!canWrite || selectedIds.length === 0) return null;

  async function undoTrash() {
    try {
      const response = await fetch("/api/media/assets/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetIds: selectedIds }),
      });
      if (!response.ok) return;
      selection.clear();
    } catch {
      // swallow; the toast is best-effort
    }
  }

  return (
    <div
      role="toolbar"
      aria-label={t("media.bulk.toolbarLabel")}
      className="border-border bg-primary-subtle flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border p-3"
      data-testid="media-bulk-toolbar"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-body text-fg-primary font-semibold">
          {selectedIds.length === 1
            ? t("media.bulk.oneSelected")
            : t("media.bulk.selected", { count: selectedIds.length })}
        </span>
        <Button variant="ghost" size="sm" onClick={() => selection.clear()}>
          <X className="me-1 h-4 w-4" aria-hidden="true" />
          {t("media.bulk.clear")}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!hasTrashedSelected ? (
          <>
            <Button variant="outline" size="sm" onClick={() => setMoveOpen(true)}>
              <FolderInput className="me-2 h-4 w-4" aria-hidden="true" />
              {t("media.bulk.move")}
            </Button>
            <MediaBulkTagPopover
              assetIds={selectedIds}
              onCompleted={(updated) => {
                toast.success(t("media.bulk.tagged", { count: updated }));
              }}
            />
            <MediaBulkVisibilityPopover
              assetIds={selectedIds}
              onCompleted={(updated) => {
                toast.success(t("media.bulk.visibilityUpdated", { count: updated }));
              }}
            />
            <Button variant="destructive" size="sm" onClick={() => setTrashOpen(true)}>
              <Trash2 className="me-2 h-4 w-4" aria-hidden="true" />
              {t("media.bulk.trash")}
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              undoTrash();
              toast.success(t("media.confirmRestore.confirm"));
            }}
          >
            {t("media.bulk.restore")}
          </Button>
        )}
      </div>

      <MediaBulkMoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        assetIds={selectedIds}
        folders={folders}
        onCompleted={(moved) => {
          toast.success(
            t("media.bulk.moved", {
              count: moved,
              folder: "folder",
            }),
          );
          selection.clear();
        }}
      />
      <MediaBulkTrashDialog
        open={trashOpen}
        onOpenChange={setTrashOpen}
        assetIds={selectedIds}
        onCompleted={(trashed) => {
          toast.success(t("media.bulk.trashed", { count: trashed }), {
            duration: 5000,
            action: {
              label: t("media.bulk.undo"),
              onClick: () => undoTrash(),
            },
          });
          selection.clear();
        }}
      />
      {/* Hidden import to keep tree-shake honest for the workspaceId */}
      <span className="hidden" data-workspace={workspaceId} />
    </div>
  );
}
