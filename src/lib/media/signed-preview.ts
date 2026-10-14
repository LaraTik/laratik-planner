/**
 * Attaches R2 signed preview URLs to media rows for the library grid.
 *
 * Why this exists: the library's image quality depends on whether the page
 * hands the browser a direct edge URL or a same-origin proxy path. Both the
 * agency route (`/app/media`) and the workspace route
 * (`/app/a/<agencySlug>/w/<slug>/media`) render the same `MediaLibraryPage`,
 * but only the workspace route used to call `getSignedPreviewUrls`. The agency
 * route passed raw rows straight through, so every thumbnail on the agency-wide
 * library fell back to `/api/media/assets/<id>/preview` and streamed through the
 * Next.js Node process. That is the defect users described as "images not
 * displaying correctly" — slow, saturated, and often blank on a cold cache.
 *
 * Keeping the call here means neither route can silently regress again: both
 * go through one function, and adding a third media route gets the behaviour by
 * construction.
 */

/**
 * The structural minimum `attachSignedPreviewUrls` needs from a
 * `listMediaAssets` row. Declared structurally rather than as the concrete row
 * type so the helper stays usable if the row projection grows columns.
 */
export type SignableMediaRow = {
  asset: {
    id: string;
    agencyId: string;
    ownerWorkspaceId: string;
  };
  object: {
    previewStorageObjectId: string | null;
  };
};

/**
 * SECURITY PRECONDITION — the caller must pass rows that an authorization
 * filter already approved for the current actor.
 *
 * `getSignedPreviewUrls` deliberately performs no per-asset permission check of
 * its own: it is a batch signer, and checking each row individually would
 * reintroduce the N-query cost the batch form exists to avoid. Authorization is
 * established upstream by `listMediaAssets` / `listMediaAssetsPage`, which apply
 * agency-membership and workspace-visibility rules before a row exists. Never
 * call this with asset ids assembled by other means — a signed URL grants
 * direct, unauthenticated read access to that one object for 15 minutes.
 *
 * The returned map only contains assets that actually have a preview variant.
 * Rows without one resolve to `null`, and the grid falls back to the
 * authenticated proxy route for those.
 */
export async function attachSignedPreviewUrls<T extends SignableMediaRow>(
  rows: readonly T[],
): Promise<Array<T & { signedPreviewUrl: string | null }>> {
  if (rows.length === 0) return [];

  // Imported dynamically so the signing/storage adapters stay out of the
  // server chunks for media routes that render no previews at all.
  const { getSignedPreviewUrls } = await import("@/lib/media/thumbnails");

  const signedPreviewUrls = await getSignedPreviewUrls(
    rows.map((row) => ({
      assetId: row.asset.id,
      agencyId: row.asset.agencyId,
      workspaceId: row.asset.ownerWorkspaceId,
      previewStorageObjectId: row.object.previewStorageObjectId,
    })),
  );

  return rows.map((row) => ({
    ...row,
    signedPreviewUrl: signedPreviewUrls.get(row.asset.id) ?? null,
  }));
}
