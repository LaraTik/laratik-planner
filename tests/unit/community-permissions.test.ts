import { describe, expect, it } from "vitest";
import { COMMUNITY_PERMISSION_ROLES, COMMUNITY_PERMISSIONS } from "@/lib/community/permissions";

describe("community permission matrix", () => {
  it("keeps viewing broader than sending", () => {
    expect(COMMUNITY_PERMISSION_ROLES.view_inbox).toContain("viewer");
    expect(COMMUNITY_PERMISSION_ROLES.reply_publicly).not.toContain("viewer");
  });

  it("keeps provider and automation management manager-only", () => {
    expect(COMMUNITY_PERMISSION_ROLES.manage_connections).toEqual(["workspace_manager"]);
    expect(COMMUNITY_PERMISSION_ROLES.publish_automation_rules).toEqual(["workspace_manager"]);
  });

  it("covers every documented Community permission exactly once", () => {
    expect(Object.keys(COMMUNITY_PERMISSION_ROLES).sort()).toEqual(
      [...COMMUNITY_PERMISSIONS].sort(),
    );
    expect(new Set(Object.keys(COMMUNITY_PERMISSION_ROLES)).size).toBe(
      COMMUNITY_PERMISSIONS.length,
    );
  });

  it("keeps client review read-only and separates sensitive manager actions", () => {
    expect(COMMUNITY_PERMISSION_ROLES.view_inbox).toContain("client_reviewer");
    expect(COMMUNITY_PERMISSION_ROLES.reply_publicly).not.toContain("client_reviewer");
    expect(COMMUNITY_PERMISSION_ROLES.reply_privately).not.toContain("client_reviewer");
    expect(COMMUNITY_PERMISSION_ROLES.manage_settings).toEqual(["workspace_manager"]);
    expect(COMMUNITY_PERMISSION_ROLES.publish_automation_rules).toEqual(["workspace_manager"]);
  });
});
