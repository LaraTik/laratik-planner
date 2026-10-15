import { describe, expect, it } from "vitest";
import {
  COMMUNITY_INBOX_MODULE,
  evaluateCommunityInboxAccess,
  type CommunityInboxAccessInput,
} from "@/lib/community/access";

const baseInput: CommunityInboxAccessInput = {
  planModules: [COMMUNITY_INBOX_MODULE],
  agencyEnabled: true,
  workspaceEnabled: true,
};

describe("community inbox access", () => {
  it("requires plan, agency, and workspace gates", () => {
    expect(evaluateCommunityInboxAccess(baseInput)).toMatchObject({
      allowed: true,
      reason: "enabled",
    });

    expect(evaluateCommunityInboxAccess({ ...baseInput, planModules: [] })).toMatchObject({
      allowed: false,
      reason: "plan_not_included",
    });
    expect(evaluateCommunityInboxAccess({ ...baseInput, agencyEnabled: false })).toMatchObject({
      allowed: false,
      reason: "agency_disabled",
    });
    expect(evaluateCommunityInboxAccess({ ...baseInput, workspaceEnabled: false })).toMatchObject({
      allowed: false,
      reason: "workspace_disabled",
    });
  });

  it("fails closed when module configuration is absent", () => {
    expect(
      evaluateCommunityInboxAccess({
        planModules: undefined,
        agencyEnabled: undefined,
        workspaceEnabled: undefined,
      }),
    ).toMatchObject({ allowed: false, reason: "plan_not_included" });
  });
});
