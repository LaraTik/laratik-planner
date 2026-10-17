import { describe, expect, it } from "vitest";
import {
  COMMUNITY_OPERATIONS,
  capabilityAvailability,
  firstCapabilityDetail,
  mergeCapabilityRows,
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

  it("normalizes merged provider detail codes for the capability UI", () => {
    expect(firstCapabilityDetail("mutation_uat_required,mutation_uat_required")).toBe(
      "mutation_uat_required",
    );
    expect(firstCapabilityDetail(" , read_not_implemented ")).toBe("read_not_implemented");
    expect(firstCapabilityDetail(null)).toBeUndefined();
  });

  it("prefers the newest available result when a workspace has multiple connections", () => {
    const older = new Date("2026-10-17T04:57:08.000Z");
    const newer = new Date("2026-10-17T05:06:49.000Z");
    expect(
      mergeCapabilityRows([
        {
          operation: "reply_comments",
          state: "unavailable",
          checkedAt: older,
          detail: "missing_scope:pages_manage_engagement",
        },
        {
          operation: "reply_comments",
          state: "available",
          checkedAt: newer,
          detail: null,
        },
      ]),
    ).toEqual([
      {
        operation: "reply_comments",
        state: "available",
        checkedAt: newer,
        detail: null,
      },
    ]);
  });
});
