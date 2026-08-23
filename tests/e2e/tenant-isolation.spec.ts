import { test, expect, type Page } from "@playwright/test";
import { devSeed, devSignIn } from "./_helpers";

async function bootstrapIsolatedTenants(page: Page) {
  const workspaceSlug = "duplicate-tenant-workspace";
  const agencyB = await devSeed(page.request, {
    email: "isolated-member-b@laratik.local",
    name: "Member B",
    agencyName: "Isolation Agency B",
    agencySlug: "isolation-agency-b",
    workspaceName: "Beta Tenant Workspace",
    workspaceSlug,
  });
  const agencyA = await devSeed(page.request, {
    email: "isolated-member-a@laratik.local",
    name: "Member A",
    agencyName: "Isolation Agency A",
    agencySlug: "isolation-agency-a",
    workspaceName: "Alpha Tenant Workspace",
    workspaceSlug,
  });
  await devSignIn(page.request, {
    email: "isolated-member-a@laratik.local",
    name: "Member A",
  });
  return { agencyA, agencyB, workspaceSlug };
}

test.describe("tenant isolation (cross-agency)", () => {
  test("a member resolves a duplicate workspace slug only inside the active agency", async ({
    page,
  }) => {
    const { workspaceSlug } = await bootstrapIsolatedTenants(page);

    await page.goto(`/app/w/${workspaceSlug}`);

    await expect(page.getByTestId("workspace-overview")).toBeVisible();
    await expect(
      page.getByTestId("workspace-overview").getByText("Alpha Tenant Workspace", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Beta Tenant Workspace", { exact: true })).toHaveCount(0);
  });

  test("an attacker-supplied agency query cannot reveal another tenant's workspace", async ({
    page,
  }) => {
    const { agencyB, workspaceSlug } = await bootstrapIsolatedTenants(page);

    await page.goto(`/app/w/${workspaceSlug}?agency=${agencyB.agencyId}`);

    await expect(page.getByTestId("workspace-overview")).toBeVisible();
    await expect(
      page.getByTestId("workspace-overview").getByText("Alpha Tenant Workspace", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Beta Tenant Workspace", { exact: true })).toHaveCount(0);
  });
});
