import { describe, expect, it } from "vitest";
import {
  COMMUNITY_OPERATIONS,
  capabilityAvailability,
  type CommunityCapability,
} from "@/lib/community/capabilities";

describe("community capability discovery", () => {
  it("keeps analytics and messaging operations distinct", () => {
    expect(COMMUNITY_OPERATIONS).toContain("read_comments");
    expect(COMMUNITY_OPERATIONS).toContain("reply_comments");
    expect(COMMUNITY_OPERATIONS).toContain("read_private_messages");
    expect(COMMUNITY_OPERATIONS).toContain("reply_private_messages");
    expect(COMMUNITY_OPERATIONS).not.toContain("analytics_read" as never);
  });

  it("reports missing operations as unavailable instead of assuming support", () => {
    const capabilities: CommunityCapability[] = ["read_comments"];
    expect(capabilityAvailability(capabilities, "read_comments")).toBe("available");
    expect(capabilityAvailability(capabilities, "reply_comments")).toBe("unavailable");
    expect(capabilityAvailability(undefined, "webhooks")).toBe("unknown");
  });
});
