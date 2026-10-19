export type AdvertisingSyncStatus =
  "succeeded" | "partial" | "failed" | "dead_letter" | "running" | null;

export type DataHealthState = "complete" | "partial" | "delayed" | "unavailable";

export type DataHealthSummary = {
  readonly state: DataHealthState;
  readonly coverage: "complete" | "partial" | "unavailable";
  readonly syncStatus: AdvertisingSyncStatus;
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly lastSuccessfulSyncAt: string | null;
  readonly since: string;
  readonly until: string;
  readonly timezone: string | null;
  readonly currency: string | null;
  readonly issues: readonly string[];
};

export function buildDataHealthSummary(args: {
  syncStatus: AdvertisingSyncStatus;
  partial: boolean;
  freshness: "fresh" | "stale" | "unknown";
  lastSuccessfulSyncAt: string | null;
  since: string;
  until: string;
  timezone: string | null;
  currency: string | null;
}): DataHealthSummary {
  const issues: string[] = [];
  if (!args.lastSuccessfulSyncAt) issues.push("no_successful_sync");
  if (args.partial || args.syncStatus === "partial") issues.push("partial_coverage");
  if (args.syncStatus === "running") issues.push("sync_running");
  if (args.syncStatus === "failed") issues.push("sync_failed");
  if (args.syncStatus === "dead_letter") issues.push("sync_dead_letter");
  if (args.freshness === "stale") issues.push("stale_data");

  const unavailable = !args.lastSuccessfulSyncAt && args.syncStatus !== "running";
  const delayed =
    !unavailable &&
    (args.syncStatus === "running" || args.freshness === "stale" || args.syncStatus === "failed");
  const partial = !unavailable && !delayed && (args.partial || args.syncStatus === "partial");
  const state: DataHealthState = unavailable
    ? "unavailable"
    : delayed
      ? "delayed"
      : partial
        ? "partial"
        : "complete";

  return {
    state,
    coverage:
      unavailable || args.syncStatus === null
        ? "unavailable"
        : args.partial || args.syncStatus === "partial"
          ? "partial"
          : "complete",
    syncStatus: args.syncStatus,
    freshness: args.freshness,
    lastSuccessfulSyncAt: args.lastSuccessfulSyncAt,
    since: args.since,
    until: args.until,
    timezone: args.timezone,
    currency: args.currency,
    issues,
  };
}
