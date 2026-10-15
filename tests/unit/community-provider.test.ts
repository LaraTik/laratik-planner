import { describe, expect, it } from "vitest";
import { supportsCommunityOperation, type CommunitySendResult } from "@/lib/community/provider";

describe("community provider boundary", () => {
  it("requires each messaging operation to be discovered independently", () => {
    expect(supportsCommunityOperation(["read_comments"], "read_comments")).toBe(true);
    expect(supportsCommunityOperation(["read_comments"], "reply_comments")).toBe(false);
  });

  it("keeps unknown delivery outcomes distinct from confirmed failures", () => {
    const result: CommunitySendResult = {
      outcome: "unknown",
      reconciliationKey: "send-123",
      reason: "provider-timeout",
    };

    expect(result.outcome).toBe("unknown");
    expect("retryable" in result).toBe(false);
  });
});
