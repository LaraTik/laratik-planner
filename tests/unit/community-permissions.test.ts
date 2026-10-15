import { describe, expect, it } from "vitest";
import { COMMUNITY_PERMISSION_ROLES } from "@/lib/community/permissions";

describe("community permission matrix", () => {
  it("keeps viewing broader than sending", () => {
    expect(COMMUNITY_PERMISSION_ROLES.view_inbox).toContain("viewer");
    expect(COMMUNITY_PERMISSION_ROLES.reply_publicly).not.toContain("viewer");
  });

  it("keeps provider and automation management manager-only", () => {
    expect(COMMUNITY_PERMISSION_ROLES.manage_connections).toEqual(["workspace_manager"]);
    expect(COMMUNITY_PERMISSION_ROLES.publish_automation_rules).toEqual(["workspace_manager"]);
  });
});
