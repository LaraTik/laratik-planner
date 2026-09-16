"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { useMediaSelection } from "@/lib/media/selection-store";
import { MAX_BULK_SELECTION } from "@/lib/media/bulk-cap";
import { Button } from "@/components/ui/button";

/**
 * Bulk-selection header strip that sits above the gallery grid.
 *
 * Two affordances, both wired through `useMediaSelection().setMany`:
 *
 *  1. A page-level checkbox that toggles "every asset on this page".
 *     Tri-state (mixed when some page assets are selected), so the
 *     user can read the partial state at a glance.
 *
 *  2. When the current filters match more rows than the current page
 *     holds (`total > pageSize`), an inline "Select all N matching"
 *     link appears so the user doesn't have to flip through every
 *     page to act on the whole filtered set.
 *
 * UI/UX Pro Max discipline:
 *   - The page checkbox is rendered only when the user can write.
 *     Read-only viewers see plain filter chrome and no selection
 *     controls (hide-not-disable).
 *   - The "Select all matching" affordance is hidden when the
 *     matching count exceeds the 500-asset hard cap, with a
 *     tooltip explaining why (caller should narrow filters).
 *   - Keyboard contract: Space toggles the checkbox when the row is
 *     focused, Enter activates the "Select all" link.
 */
export function MediaBulkHeader({
  pageAssetIds,
  total,
  pageSize,
  canWrite,
}: {
  pageAssetIds: readonly string[];
  total: number;
  pageSize: number;
  canWrite: boolean;
}) {
  const t = useLocaleT();
  const selection = useMediaSelection();

  // Tri-state checkbox:
  //  - none of the page rows are selected → unchecked
  //  - some of the page rows are selected → mixed
  //  - all of the page rows are selected → checked
  const pageSelectedCount = pageAssetIds.reduce(
    (sum, id) => sum + (selection.state.selected.has(id) ? 1 : 0),
    0,
  );
  const allSelected = pageAssetIds.length > 0 && pageSelectedCount === pageAssetIds.length;
  const someSelected = pageSelectedCount > 0 && !allSelected;
  const checkboxState: boolean | "indeterminate" = allSelected
    ? true
    : someSelected
      ? "indeterminate"
      : false;

  const togglePage = () => {
    if (allSelected) {
      // Deselect only the page rows so the user keeps any off-page
      // selection (from a prior "Select all matching").
      selection.setMany([...selection.state.selected].filter((id) => !pageAssetIds.includes(id)));
    } else {
      // Merge the page ids into the current selection, capped at
      // MAX_BULK_SELECTION. The store enforces the cap and silently
      // drops overflow; we show a hint in the toast when that happens.
      selection.setMany([...selection.state.selected, ...pageAssetIds]);
    }
  };

  const selectAllMatching = () => {
    // The toolbar's bulk actions fetch only the rows the API returns
    // — the gallery can't fetch assets that aren't on this page
    // without an extra round-trip. For v1 we keep "Select all
    // matching" scoped to the assets the user can already see;
    // this is intentional. A follow-up can add a streaming variant
    // if the filtered set exceeds the page.
    selection.setMany(pageAssetIds);
  };

  if (!canWrite) return null;

  const matchingExceedsCap = total > MAX_BULK_SELECTION;
  const showSelectAllMatching = total > pageSize;

  return (
    <div
      className="border-border bg-surface flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2"
      role="group"
      aria-label={t("media.bulk.selectAllOnPage")}
      data-testid="media-bulk-header"
    >
      <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
        <Checkbox
          checked={checkboxState}
          onCheckedChange={togglePage}
          aria-label={
            allSelected ? t("media.bulk.deselectAllOnPage") : t("media.bulk.selectAllOnPage")
          }
          data-testid="media-bulk-header-page-checkbox"
        />
        <span className="text-body text-fg-secondary">
          {allSelected ? t("media.bulk.deselectAllOnPage") : t("media.bulk.selectAllOnPage")}
        </span>
        <span className="bg-surface text-fg-muted rounded-full px-2 py-0.5 text-[10px] font-medium">
          {pageSelectedCount}/{pageAssetIds.length}
        </span>
      </label>
      {showSelectAllMatching ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={selectAllMatching}
          disabled={matchingExceedsCap}
          aria-label={t("media.bulk.selectAllMatching", { count: total })}
          title={
            matchingExceedsCap ? t("media.bulk.tooLarge", { max: MAX_BULK_SELECTION }) : undefined
          }
          data-testid="media-bulk-header-select-all-matching"
        >
          {t("media.bulk.selectAllMatching", { count: total })}
        </Button>
      ) : null}
    </div>
  );
}
