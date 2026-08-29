import { describe, expect, it } from "vitest";
import { flattenWorkspaceRoleGrants, invitationCommandSchema } from "@/lib/auth/invitation-command";

const WS = "95e9ea6d-8d71-4f7f-8fc8-7eef95c7a6fa";

describe("invitation command", () => {
  it("accepts typed workspace role grants", () => {
    const result = invitationCommandSchema.safeParse({
      email: " Person@Example.com ",
      workspaceRoles: [{ workspaceId: WS, role: "designer" }],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("person@example.com");
  });

  it("rejects unknown roles and malformed workspace identifiers", () => {
    expect(
      invitationCommandSchema.safeParse({
        email: "person@example.com",
        workspaceRoles: [{ workspaceId: "not-a-uuid", role: "owner" }],
      }).success,
    ).toBe(false);
  });
});

describe("flattenWorkspaceRoleGrants", () => {
  it("expands the legacy single-role shape", () => {
    const out = flattenWorkspaceRoleGrants([{ workspaceId: WS, role: "designer" }]);
    expect(out).toEqual([{ workspaceId: WS, role: "designer" }]);
  });

  it("expands the multi-role shape (one workspace, many roles)", () => {
    const out = flattenWorkspaceRoleGrants([
      { workspaceId: WS, roles: ["designer", "content_planner"] },
    ]);
    expect(out).toEqual([
      { workspaceId: WS, role: "designer" },
      { workspaceId: WS, role: "content_planner" },
    ]);
  });

  it("expands a mixed list (legacy + multi-role)", () => {
    const out = flattenWorkspaceRoleGrants([
      { workspaceId: WS, role: "viewer" },
      {
        workspaceId: "00000000-0000-0000-0000-000000000002",
        roles: ["designer", "internal_reviewer"],
      },
    ]);
    expect(out).toEqual([
      { workspaceId: WS, role: "viewer" },
      { workspaceId: "00000000-0000-0000-0000-000000000002", role: "designer" },
      { workspaceId: "00000000-0000-0000-0000-000000000002", role: "internal_reviewer" },
    ]);
  });

  it("de-dupes repeated (workspaceId, role) pairs across the two shapes", () => {
    const out = flattenWorkspaceRoleGrants([
      { workspaceId: WS, role: "designer" },
      { workspaceId: WS, roles: ["designer", "content_planner"] },
    ]);
    expect(out).toEqual([
      { workspaceId: WS, role: "designer" },
      { workspaceId: WS, role: "content_planner" },
    ]);
  });

  it("returns an empty list for an empty input", () => {
    expect(flattenWorkspaceRoleGrants([])).toEqual([]);
  });
});
