export const COMMUNITY_SYNC_KINDS = ["comments", "private_messages"] as const;

export type CommunitySyncKind = (typeof COMMUNITY_SYNC_KINDS)[number];

/**
 * Advance a sync cursor monotonically. The kind is part of the signature so
 * callers keep comment and private-message cursors distinct.
 */
export function advanceSyncCursor(
  _kind: CommunitySyncKind,
  previous: string | null | undefined,
  observed: readonly Date[],
): string | null {
  const previousTime = previous ? Date.parse(previous) : Number.NaN;
  const newestObserved = observed.reduce<number | null>((newest, value) => {
    const timestamp = value.getTime();
    if (!Number.isFinite(timestamp)) return newest;
    return newest === null ? timestamp : Math.max(newest, timestamp);
  }, null);

  const newest =
    newestObserved === null
      ? previousTime
      : Number.isFinite(previousTime)
        ? Math.max(previousTime, newestObserved)
        : newestObserved;

  return Number.isFinite(newest) ? new Date(newest).toISOString() : null;
}
