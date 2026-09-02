import { describe, expect, it } from "vitest";
import {
  getSupportedSocialMetrics,
  getUniversalSocialMetrics,
  isSocialMetricSupported,
  resolveSocialMetric,
  type SocialMetric,
} from "@/lib/social/metrics";

describe("social metric capabilities", () => {
  it("keeps the cross-platform metric set limited to comparable metrics", () => {
    expect(getUniversalSocialMetrics()).toEqual([
      "followerCount",
      "reach",
      "views",
      "interactions",
    ]);
  });

  it("exposes only metrics supported by each platform", () => {
    expect(getSupportedSocialMetrics("facebook")).toEqual([
      "followerCount",
      "reach",
      "views",
      "interactions",
    ]);
    expect(getSupportedSocialMetrics("instagram")).toEqual([
      "followerCount",
      "reach",
      "views",
      "interactions",
      "engagedAccounts",
    ]);
    expect(getSupportedSocialMetrics("tiktok")).toEqual(["followerCount"]);
  });

  it("does not expose Instagram-only metrics on Facebook", () => {
    expect(isSocialMetricSupported("facebook", "engagedAccounts")).toBe(false);
    expect(isSocialMetricSupported("instagram", "engagedAccounts")).toBe(true);
  });

  it("resolves an invalid or platform-incompatible metric to a safe fallback", () => {
    expect(resolveSocialMetric("engagedAccounts", "facebook")).toBe("followerCount");
    expect(resolveSocialMetric("unknown" as SocialMetric, "instagram")).toBe("followerCount");
    expect(resolveSocialMetric("interactions", "tiktok")).toBe("followerCount");
  });
});
