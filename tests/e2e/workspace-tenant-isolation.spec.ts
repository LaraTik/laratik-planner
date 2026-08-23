import { test, expect } from "@playwright/test";

test.describe("cross-agency workspace tenant isolation", () => {
  test("the dev fixture can create two agencies with the same workspace slug", async ({
    request,
  }) => {
    const seed = async (agencySlug: string, email: string, workspaceName: string) => {
      const response = await request.post("/api/dev/seed", {
        data: {
          agencySlug,
          agencyName: workspaceName.replace(" Workspace", " Agency"),
          email,
          workspaceSlug: "duplicate-slug",
          workspaceName,
        },
      });
      expect(response.ok(), await response.text()).toBe(true);
      return (await response.json()) as { agencyId: string; workspaceId: string };
    };

    const agencyA = await seed("tenant-isolation-a", "tenant-a@laratik.local", "Alpha Workspace");
    const agencyB = await seed("tenant-isolation-b", "tenant-b@laratik.local", "Beta Workspace");

    expect(agencyA.agencyId).not.toBe(agencyB.agencyId);
    expect(agencyA.workspaceId).not.toBe(agencyB.workspaceId);
  });
});
