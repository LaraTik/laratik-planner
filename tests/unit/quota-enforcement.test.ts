import { describe, expect, it } from "vitest";
import { assertWithinLimit, LimitExceededError } from "@/lib/entitlements";

describe("M2 transactional quota contract", () => {
  it("allows an allocation at the exact limit", () => {
    expect(() => assertWithinLimit("workspaces", 4, 5, 1)).not.toThrow();
  });

  it("allows unlimited resources", () => {
    expect(() => assertWithinLimit("storage_bytes", 1_000_000, null, 1_000_000)).not.toThrow();
  });

  it("returns a structured error when an allocation exceeds the limit", () => {
    try {
      assertWithinLimit("social_profiles:instagram", 3, 3, 1);
      expect.fail("expected quota rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(LimitExceededError);
      const quotaError = error as LimitExceededError;
      expect(quotaError.details).toEqual({
        resource: "social_profiles:instagram",
        currentUsage: 3,
        limit: 3,
        requestedIncrease: 1,
        userMessage: "Your plan allows 3 social profiles on Instagram. Archive one or request a limit change.",
      });
    }
  });
});
