import { describe, expect, it } from "vitest";
import {
  advertisingSignalFeedbackKey,
  advertisingSignalFeedbackMutationSchema,
} from "@/lib/advertising/signal-feedback";

describe("advertising signal feedback", () => {
  it("creates stable keys for the same signal entity", () => {
    expect(advertisingSignalFeedbackKey("campaign", "cmp-1", "campaign_underperforming")).toBe(
      "campaign:cmp-1:campaign_underperforming",
    );
  });

  it("requires a reason when a signal is dismissed", () => {
    const result = advertisingSignalFeedbackMutationSchema.safeParse({
      signalKey: "campaign_underperforming",
      entityType: "campaign",
      entityId: "cmp-1",
      state: "dismissed",
    });
    expect(result.success).toBe(false);
  });

  it("requires a future snooze timestamp in the mutation contract", () => {
    const result = advertisingSignalFeedbackMutationSchema.safeParse({
      signalKey: "creative_fatigue",
      entityType: "creative",
      entityId: "ad-1",
      state: "snoozed",
    });
    expect(result.success).toBe(false);
  });

  it("accepts reviewed and reasoned dismissal states", () => {
    expect(
      advertisingSignalFeedbackMutationSchema.safeParse({
        signalKey: "campaign_underperforming",
        entityType: "campaign",
        entityId: "cmp-1",
        state: "reviewed",
      }).success,
    ).toBe(true);
    expect(
      advertisingSignalFeedbackMutationSchema.safeParse({
        signalKey: "campaign_underperforming",
        entityType: "campaign",
        entityId: "cmp-1",
        state: "dismissed",
        reason: "already_handled",
      }).success,
    ).toBe(true);
  });
});
