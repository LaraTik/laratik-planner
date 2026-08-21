import { describe, expect, it } from "vitest";
import { assertCanDemoteAgencyAdmin } from "@/lib/auth/member-safety";

describe("assertCanDemoteAgencyAdmin", () => {
  it("rejects the actor demoting their own agency-admin flag", () => {
    expect(() =>
      assertCanDemoteAgencyAdmin({
        actorUserId: "user-1",
        targetUserId: "user-1",
        targetIsAgencyAdmin: true,
        activeAgencyAdminCountAfterChange: 0,
      }),
    ).toThrow(/your own agency-admin/i);
  });

  it("rejects demoting the final active agency administrator", () => {
    expect(() =>
      assertCanDemoteAgencyAdmin({
        actorUserId: "user-1",
        targetUserId: "user-2",
        targetIsAgencyAdmin: true,
        activeAgencyAdminCountAfterChange: 0,
      }),
    ).toThrow(/final active agency administrator/i);
  });

  it("allows a self-edit that does NOT touch the agency-admin flag", () => {
    // Promoting yourself to admin is not a demote; the helper should be a
    // no-op for non-demote paths so callers can run it unconditionally
    // before the database write.
    expect(() =>
      assertCanDemoteAgencyAdmin({
        actorUserId: "user-1",
        targetUserId: "user-1",
        targetIsAgencyAdmin: false,
        activeAgencyAdminCountAfterChange: 2,
      }),
    ).not.toThrow();
  });

  it("allows demoting a non-admin (no-op safety path)", () => {
    // If the target is not an admin, neither the self-edit guard nor
    // the final-admin guard should fire — even with a count of 0.
    expect(() =>
      assertCanDemoteAgencyAdmin({
        actorUserId: "user-1",
        targetUserId: "user-2",
        targetIsAgencyAdmin: false,
        activeAgencyAdminCountAfterChange: 0,
      }),
    ).not.toThrow();
  });

  it("allows demoting an admin when at least one other admin remains", () => {
    expect(() =>
      assertCanDemoteAgencyAdmin({
        actorUserId: "user-1",
        targetUserId: "user-2",
        targetIsAgencyAdmin: true,
        activeAgencyAdminCountAfterChange: 1,
      }),
    ).not.toThrow();
  });
});
