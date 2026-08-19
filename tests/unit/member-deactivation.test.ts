import { describe, expect, it } from "vitest";
import { assertCanDeactivateAgencyMember } from "@/lib/auth/member-safety";

describe("agency member deactivation safety", () => {
  it("rejects self-deactivation", () => {
    expect(() =>
      assertCanDeactivateAgencyMember({
        actorUserId: "user-1",
        targetUserId: "user-1",
        targetIsAgencyAdmin: false,
        activeAgencyAdminCount: 2,
      }),
    ).toThrow(/your own/i);
  });

  it("rejects deactivating the final active agency administrator", () => {
    expect(() =>
      assertCanDeactivateAgencyMember({
        actorUserId: "user-1",
        targetUserId: "user-2",
        targetIsAgencyAdmin: true,
        activeAgencyAdminCount: 1,
      }),
    ).toThrow(/final active agency administrator/i);
  });

  it("allows deactivating a non-admin or one of multiple admins", () => {
    expect(() =>
      assertCanDeactivateAgencyMember({
        actorUserId: "user-1",
        targetUserId: "user-2",
        targetIsAgencyAdmin: false,
        activeAgencyAdminCount: 1,
      }),
    ).not.toThrow();
    expect(() =>
      assertCanDeactivateAgencyMember({
        actorUserId: "user-1",
        targetUserId: "user-2",
        targetIsAgencyAdmin: true,
        activeAgencyAdminCount: 2,
      }),
    ).not.toThrow();
  });
});
