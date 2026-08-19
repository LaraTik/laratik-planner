import { describe, expect, it } from "vitest";
import { invitationCommandSchema } from "@/lib/auth/invitation-command";

describe("invitation command", () => {
  it("accepts typed workspace role grants", () => {
    const result = invitationCommandSchema.safeParse({
      email: " Person@Example.com ",
      workspaceRoles: [{ workspaceId: "95e9ea6d-8d71-4f7f-8fc8-7eef95c7a6fa", role: "designer" }],
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
