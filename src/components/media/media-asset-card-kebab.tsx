"use client";

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreVertical } from "lucide-react";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * Per-asset-card kebab menu (UI/UX Pro Max §3.9 rule 2).
 *
 * Capability-aware: destructive items (Trash, Move) are hidden (not
 * disabled) when the actor lacks write permission.
 */
export function MediaAssetCardKebab({
  canWrite,
  isTrashed,
  onMove,
  onTrash,
  onRestore,
  onDuplicate,
}: {
  assetId: string;
  canWrite: boolean;
  isTrashed: boolean;
  onMove?: () => void;
  onTrash?: () => void;
  onRestore?: () => void;
  onDuplicate?: () => void;
}) {
  const t = useLocaleT();
  if (!canWrite && !isTrashed) {
    // Hide entirely for read-only viewers — they have nothing to act on.
    return null;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t("media.kebab.label")}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!isTrashed && canWrite ? (
          <>
            <DropdownMenuItem onSelect={() => onMove?.()}>{t("media.kebab.move")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDuplicate?.()}>
              {t("media.kebab.duplicate")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onTrash?.()}
              className="text-danger focus:text-danger"
            >
              {t("media.kebab.trash")}
            </DropdownMenuItem>
          </>
        ) : null}
        {isTrashed && canWrite ? (
          <DropdownMenuItem onSelect={() => onRestore?.()}>
            {t("media.kebab.restore")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
