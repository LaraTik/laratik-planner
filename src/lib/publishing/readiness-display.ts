export type PublishingReadinessStatus = "ready" | "warning" | "danger" | "neutral";

export function getPublishingReadinessStatus(input: {
  unavailable: boolean;
  blockerCount: number;
  channelCount: number;
  configuredChannelCount: number;
}): PublishingReadinessStatus {
  if (input.unavailable) return "neutral";
  if (input.blockerCount > 0) return "danger";
  if (input.channelCount === 0) return "neutral";
  if (input.configuredChannelCount < input.channelCount) return "warning";
  return "ready";
}
