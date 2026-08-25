import { expect, test } from "@playwright/test";
import { devSeed, devSignIn } from "./_helpers";

test.describe("platform role authorization", () => {
  test("Owner grants, changes, and revokes a bounded platform role", async ({ page }) => {
    const stamp = Date.now();
    const ownerEmail = `e2e-owner-${stamp}@laratik.local`;
    const memberEmail = `e2e-access-member-${stamp}@laratik.local`;
    await devSeed(page.request, {
      email: ownerEmail,
      agencyAdmin: false,
      platformRole: "platform_owner",
      agencySlug: `owner-${stamp}`,
      workspaceSlug: `owner-${stamp}`,
    });
    const member = await devSeed(page.request, {
      email: memberEmail,
      agencyAdmin: false,
      platformAdmin: false,
      agencySlug: `member-${stamp}`,
      workspaceSlug: `member-${stamp}`,
    });
    await devSignIn(page.request, { email: ownerEmail, role: "user" });

    await page.goto("/app/platform/access");
    await expect(page.getByTestId("platform-access-root")).toBeVisible();
    await page.getByLabel("Email").fill(memberEmail);
    await page.getByLabel("Platform role").selectOption("platform_auditor");
    await page.getByLabel("Reason").fill("Quarterly compliance review");
    await page.getByRole("button", { name: "Add platform member" }).last().click();
    await expect(page.getByRole("status")).toContainText(/Platform access added/i);

    await page.reload();
    const row = page.getByTestId(`platform-access-row-${member.userId}`);
    await expect(row).toContainText("Platform Auditor");
    await row.getByRole("button", { name: `Change role for ${memberEmail}` }).click();
    const changeDialog = page.getByRole("dialog", { name: "Change platform role" });
    await changeDialog.getByLabel("New role").selectOption("agency_operator");
    await changeDialog.getByLabel("Reason").fill("Assigned to agency operations");
    await changeDialog.getByRole("button", { name: "Change role", exact: true }).click();
    await expect(changeDialog.getByRole("status")).toContainText("Role updated");
    await changeDialog.getByText("Close", { exact: true }).click();

    await page.reload();
    await expect(row).toContainText("Agency Operator");
    await row.getByRole("button", { name: `Revoke access for ${memberEmail}` }).click();
    const revokeDialog = page.getByRole("dialog", { name: "Revoke platform access" });
    await revokeDialog.getByLabel("Reason").fill("Rotation completed");
    await revokeDialog.getByRole("button", { name: "Revoke access", exact: true }).click();
    // Revalidation removes the revoked assignment and its row-owned dialog.
    // The disappearance is the durable success state.
    await expect(row).toHaveCount(0);
  });

  test("Auditor can review access without mutation controls", async ({ page }) => {
    const stamp = Date.now();
    const email = `e2e-auditor-${stamp}@laratik.local`;
    await devSeed(page.request, {
      email,
      agencyAdmin: false,
      platformRole: "platform_auditor",
      agencySlug: `auditor-${stamp}`,
      workspaceSlug: `auditor-${stamp}`,
    });
    await devSignIn(page.request, { email, role: "user" });

    await page.goto("/app/platform/access");
    await expect(page.getByTestId("platform-access-root")).toBeVisible();
    await expect(page.getByText("Read-only access oversight")).toBeVisible();
    await expect(page.getByTestId("platform-access-grant-form")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Change role for|Revoke access for/ }),
    ).toHaveCount(0);
  });

  test("Operator edits another agency without tenant membership but cannot archive", async ({
    page,
  }) => {
    const stamp = Date.now();
    const target = await devSeed(page.request, {
      email: `e2e-target-admin-${stamp}@laratik.local`,
      agencyAdmin: true,
      platformAdmin: false,
      agencySlug: `operator-target-${stamp}`,
      workspaceSlug: `operator-target-${stamp}`,
    });
    const operatorEmail = `e2e-operator-${stamp}@laratik.local`;
    await devSeed(page.request, {
      email: operatorEmail,
      agencyAdmin: false,
      platformRole: "agency_operator",
      agencySlug: `operator-home-${stamp}`,
      workspaceSlug: `operator-home-${stamp}`,
    });
    await devSignIn(page.request, { email: operatorEmail, role: "user" });

    await page.goto(`/app/platform/agencies/${target.agencyId}`);
    await expect(page.getByTestId("platform-agency-edit-identity-form")).toBeVisible();
    await page.getByTestId("platform-agency-edit-name").fill(`Operator Updated ${stamp}`);
    await page.getByTestId("platform-agency-edit-submit").click();
    await expect(page.getByTestId("platform-agency-edit-saved")).toBeVisible();
    await expect(page.getByRole("button", { name: "Suspend agency" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Archive agency/ })).toHaveCount(0);

    await page.goto("/app/platform/access");
    await expect(page.getByTestId("platform-access-root")).toHaveCount(0);
    await expect(page.getByText("Platform access unavailable")).toBeVisible();
  });

  test("Support Operator requests temporary access but cannot edit agency administration", async ({
    page,
  }) => {
    const stamp = Date.now();
    const target = await devSeed(page.request, {
      email: `e2e-support-target-${stamp}@laratik.local`,
      agencyAdmin: true,
      platformAdmin: false,
      agencySlug: `support-target-${stamp}`,
      workspaceSlug: `support-target-${stamp}`,
    });
    const supportEmail = `e2e-support-${stamp}@laratik.local`;
    await devSeed(page.request, {
      email: supportEmail,
      agencyAdmin: false,
      platformRole: "support_operator",
      agencySlug: `support-home-${stamp}`,
      workspaceSlug: `support-home-${stamp}`,
    });
    await devSignIn(page.request, { email: supportEmail, role: "user" });

    await page.goto(`/app/platform/agencies/${target.agencyId}`);
    await expect(page.getByTestId("platform-agency-edit-identity-form")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save plan" })).toHaveCount(0);
    await expect(
      page.getByTestId("platform-agency-lifecycle-controls").getByRole("button"),
    ).toHaveCount(0);
    await expect(page.getByTestId("platform-support-request-form")).toBeVisible();
    await page.getByLabel("Ticket reference").fill(`SUP-${stamp}`);
    await page.getByLabel("Reason for access").fill("Investigate an isolated customer incident.");
    await page.getByRole("button", { name: "Request temporary access" }).click();
    await expect(
      page.getByTestId("platform-support-request-form").getByRole("status"),
    ).toContainText("Request submitted");
  });

  test("non-platform user receives the stable forbidden surface", async ({ page }) => {
    const stamp = Date.now();
    const email = `e2e-nonplatform-${stamp}@laratik.local`;
    await devSeed(page.request, {
      email,
      agencyAdmin: false,
      platformAdmin: false,
      agencySlug: `nonplatform-${stamp}`,
      workspaceSlug: `nonplatform-${stamp}`,
    });
    await devSignIn(page.request, { email, role: "user" });
    await page.goto("/app/platform/overview");
    await expect(page).toHaveURL(/\/app\/platform\/overview$/);
    await expect(page.getByTestId("platform-forbidden")).toBeVisible();
  });

  test("legacy Admins URL permanently redirects to Platform Access", async ({ page }) => {
    const stamp = Date.now();
    const email = `e2e-redirect-owner-${stamp}@laratik.local`;
    await devSeed(page.request, {
      email,
      agencyAdmin: false,
      platformRole: "platform_owner",
      agencySlug: `redirect-owner-${stamp}`,
      workspaceSlug: `redirect-owner-${stamp}`,
    });
    await devSignIn(page.request, { email, role: "user" });
    const response = await page.request.get("/app/platform/admins", { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe("/app/platform/access");
    await page.goto("/app/platform/admins");
    await expect(page).toHaveURL(/\/app\/platform\/access$/);
  });
});
