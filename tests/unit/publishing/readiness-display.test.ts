import { describe, expect, it } from "vitest";
import { getPublishingReadinessStatus } from "@/lib/publishing/readiness-display";

describe("getPublishingReadinessStatus", () => {
  it("keeps readiness neutral when evaluation is unavailable", () => {
    expect(
      getPublishingReadinessStatus({
        unavailable: true,
        blockerCount: 0,
        channelCount: 2,
        configuredChannelCount: 2,
      }),
    ).toBe("neutral");
  });

  it("reports ready only when evaluation succeeds and every channel is configured", () => {
    expect(
      getPublishingReadinessStatus({
        unavailable: false,
        blockerCount: 0,
        channelCount: 2,
        configuredChannelCount: 2,
      }),
    ).toBe("ready");
  });
});
