export type PublicationRecordStatus = "pending" | "published" | "failed" | "skipped";
export type PublicationAggregateStatus = "ready_to_publish" | "partially_published" | "published";

export function derivePublicationAggregate(
  selectedChannelCount: number,
  recordedStatuses: readonly PublicationRecordStatus[],
): PublicationAggregateStatus {
  if (selectedChannelCount < 1) throw new Error("At least one selected channel is required");
  if (recordedStatuses.length > selectedChannelCount) {
    throw new Error("Publication record count exceeds selected channel count");
  }
  const closedCount = recordedStatuses.filter(
    (status) => status === "published" || status === "skipped",
  ).length;
  if (closedCount === selectedChannelCount && recordedStatuses.length === selectedChannelCount) {
    return "published";
  }
  if (closedCount > 0) return "partially_published";
  return "ready_to_publish";
}
