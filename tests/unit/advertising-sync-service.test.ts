import { describe, expect, it } from "vitest";
import { nextAdvertisingSyncStatus } from "@/lib/advertising/sync-service";

describe("advertising sync state transitions", () => {
  it("activates a new or paused target as idle", () => {
    expect(nextAdvertisingSyncStatus(null, true)).toBe("idle");
    expect(nextAdvertisingSyncStatus("paused", true)).toBe("idle");
    expect(nextAdvertisingSyncStatus("failed", true)).toBe("idle");
  });

  it("preserves an in-flight job when activation is repeated", () => {
    expect(nextAdvertisingSyncStatus("running", true)).toBe("running");
  });

  it("reopens a dead-lettered state only through explicit enablement", () => {
    expect(nextAdvertisingSyncStatus("dead_letter", true)).toBe("idle");
  });

  it("pauses every current state when disabled", () => {
    for (const status of ["idle", "running", "partial", "failed", "dead_letter", "paused"] as const)
      expect(nextAdvertisingSyncStatus(status, false)).toBe("paused");
  });
});
