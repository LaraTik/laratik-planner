"use client";

import * as React from "react";
import { Archive, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { bulkArchiveDesignQueueAction } from "./actions";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * Bulk-action toolbar for the design queue (FEAT-14,
 * GAP-FULL-REVIEW-2026-08-25). The parent list owns the
 * selection state; this component just renders the row and
 * triggers the server action. Renders nothing when no items
 * are selected (the parent shows its own summary line below
 * the grid).
 */
export function DesignQueueBulkToolbar({
  workspaceId,
  itemIds,
  selected,
  onChange,
  onArchived,
  t: tProp,
}: {
  workspaceId: string;
  itemIds: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  onArchived: () => void;
  t?: (key: string, params?: Record<string, string | number>) => string;
}) {
  const localeT = useLocaleT();
  const t = tProp ?? localeT;
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const allChecked = itemIds.length > 0 && itemIds.every((id) => selected.has(id));
  const someChecked = !allChecked && itemIds.some((id) => selected.has(id));

  function toggleAll() {
    onChange(allChecked ? new Set() : new Set(itemIds));
  }

  async function onArchiveSelected() {
    if (selected.size === 0 || pending) return;
    setError(null);
    setPending(true);
    try {
      const result = await bulkArchiveDesignQueueAction({
        workspaceId,
        contentItemIds: [...selected],
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onArchived();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("sidebar.designQueuePage.archiveFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="border-border bg-surface flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border p-3"
      data-testid="design-queue-bulk-toolbar"
    >
      <div className="text-label text-fg-secondary inline-flex items-center gap-2 font-semibold">
        <Checkbox
          id="design-queue-select-all"
          aria-label={t("sidebar.designQueuePage.selectAll")}
          data-testid="design-queue-select-all"
          checked={allChecked ? true : someChecked ? "indeterminate" : false}
          onCheckedChange={toggleAll}
        />
        {allChecked || someChecked ? (
          <CheckSquare className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Square className="h-4 w-4" aria-hidden="true" />
        )}
        <label htmlFor="design-queue-select-all" className="cursor-pointer">
          {t("sidebar.designQueuePage.selectedCount", { count: selected.size })}
        </label>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onArchiveSelected}
        disabled={selected.size === 0 || pending}
        data-testid="design-queue-bulk-archive"
        aria-busy={pending}
      >
        <Archive className="h-4 w-4" aria-hidden="true" />
        {pending
          ? t("sidebar.designQueuePage.archiving")
          : selected.size > 0
            ? t("sidebar.designQueuePage.archiveCount", { count: selected.size })
            : t("sidebar.designQueuePage.archiveSelected")}
      </Button>
      {error ? (
        <p className="text-label text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
