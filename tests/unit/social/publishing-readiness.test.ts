import { describe, expect, it } from "vitest";
import { evaluateMetaPublishingReadiness } from "@/lib/social/publishing-readiness";

const enabledConfig = {
  providerConfigured: true,
  providerEnabled: true,
  publishingEnabled: true,
  appReviewStatus: "approved" as const,
  businessVerificationStatus: "not_required" as const,
  platformEnabled: true,
  workspaceEnabled: true,
};

describe("evaluateMetaPublishingReadiness", () => {
  it("keeps publishing disabled by default even when analytics is connected", () => {
    const result = evaluateMetaPublishingReadiness(
      { ...enabledConfig, platformEnabled: false },
      [{ operation: "analytics_read", status: "active", lastCheckedAt: null, lastErrorCode: null }],
      true,
    );

    expect(result.status).toBe("not_enabled");
    expect(result.canQueue).toBe(false);
    expect(result.blockers).toContain("meta_publishing_disabled");
  });

  it("distinguishes analytics-only access from publishing access", () => {
    const result = evaluateMetaPublishingReadiness(
      enabledConfig,
      [{ operation: "analytics_read", status: "active", lastCheckedAt: null, lastErrorCode: null }],
      true,
    );

    expect(result.status).toBe("analytics_only");
    expect(result.canQueue).toBe(false);
    expect(result.blockers).toContain("meta_publish_capability_missing");
  });

  it("blocks a destination that needs reauthorization", () => {
    const result = evaluateMetaPublishingReadiness(
      enabledConfig,
      [
        {
          operation: "instagram_content_publish",
          status: "needs_reauth",
          lastCheckedAt: null,
          lastErrorCode: "token_expired",
        },
      ],
      true,
    );

    expect(result.status).toBe("needs_reauth");
    expect(result.canQueue).toBe(false);
  });

  it("is queue-ready only when a publish capability is active", () => {
    const result = evaluateMetaPublishingReadiness(
      enabledConfig,
      [
        {
          operation: "facebook_page_publish",
          status: "active",
          lastCheckedAt: new Date("2026-09-04T10:00:00.000Z"),
          lastErrorCode: null,
        },
      ],
      true,
    );

    expect(result.status).toBe("ready");
    expect(result.canQueue).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("requires a connected destination after provider approval", () => {
    const result = evaluateMetaPublishingReadiness(enabledConfig, [], false);

    expect(result.status).toBe("no_destinations");
    expect(result.canQueue).toBe(false);
  });
});
