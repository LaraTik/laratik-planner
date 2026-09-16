/**
 * Hard cap on the number of media assets a single bulk action may operate
 * on at once. Enforced in every bulk service (`bulkMoveMediaAssets`,
 * `bulkTrashMediaAssets`, etc.) and surfaced in the UI as
 * `bulk_selection_too_large`.
 *
 * Why 500:
 *   - `mediaAssetLinks` rows per asset are typically 1–4; the bulk
 *     transaction touches O(cap × fanout) rows.
 *   - 500 keeps the average batch write inside the ~5 s server-action
 *     budget even on a cold connection.
 *   - Selection beyond 500 should fall back to folder-level actions
 *     ("act on the whole folder") rather than expand the cap.
 */
export const MAX_BULK_SELECTION = 500;

/**
 * Reason emitted by every bulk service when the actor exceeds the cap.
 * Kept as a const so the API route, the bulk-action UI, and the tests
 * share one source of truth.
 */
export const BULK_SELECTION_TOO_LARGE = "bulk_selection_too_large" as const;

/**
 * Throw a structured `Error` if the input exceeds `MAX_BULK_SELECTION`.
 * The message embeds the reason code so callers can introspect it.
 */
export function assertWithinBulkCap(assetIds: readonly string[]): void {
  if (assetIds.length > MAX_BULK_SELECTION) {
    throw new Error(`${BULK_SELECTION_TOO_LARGE}: ${assetIds.length} > ${MAX_BULK_SELECTION}`);
  }
}

/**
 * Predicate form for non-throwing call sites (e.g. the bulk toolbar
 * wants to disable a button when the cap is exceeded, not throw).
 */
export function isWithinBulkCap(assetIds: readonly string[]): boolean {
  return assetIds.length <= MAX_BULK_SELECTION;
}

/** Number of assets the selection can still grow by before hitting the cap. */
export function bulkSelectionHeadroom(selectedCount: number): number {
  return Math.max(0, MAX_BULK_SELECTION - selectedCount);
}

/** Maximum number of tags a media asset may carry. Mirrors the schema CHECK. */
export const MAX_TAGS_PER_ASSET = 32;

/** Maximum length of a single media tag. */
export const MAX_TAG_LENGTH = 64;
