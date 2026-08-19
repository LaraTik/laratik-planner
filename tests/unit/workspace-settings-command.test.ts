import { describe, expect, it } from "vitest";
import { workspaceSettingsCommandSchema } from "@/lib/workspaces/settings-command";

const valid = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  timezone: "Europe/Vienna",
  approvalMode: "internal_then_client",
  monthlyTarget: 30,
  contentApprovalLeadDays: 10,
  designCompleteLeadDays: 5,
  creativeApprovalLeadDays: 2,
  readyToPublishLeadDays: 1,
  defaultDesignerId: "22222222-2222-4222-8222-222222222222",
  defaultContentReviewerId: null,
  defaultInternalCreativeReviewerId: null,
  defaultClientReviewerId: null,
};

describe("workspace settings command", () => {
  it("accepts practical defaults and normalized nullable assignments", () => {
    expect(workspaceSettingsCommandSchema.parse(valid)).toEqual(valid);
  });

  it("rejects unknown timezones", () => {
    expect(() =>
      workspaceSettingsCommandSchema.parse({ ...valid, timezone: "Mars/Olympus" }),
    ).toThrow(/timezone/i);
  });

  it("rejects unreasonable targets and lead times", () => {
    expect(() => workspaceSettingsCommandSchema.parse({ ...valid, monthlyTarget: 0 })).toThrow();
    expect(() =>
      workspaceSettingsCommandSchema.parse({ ...valid, designCompleteLeadDays: 91 }),
    ).toThrow();
  });
});
