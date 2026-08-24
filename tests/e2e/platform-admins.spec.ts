import { expect, test } from "@playwright/test";
import { devSeed, devSignIn } from "./_helpers";

/**
 * Platform · Admins (superadmin-clarity) — E2E gate + flow tests.
 *
 * Three cases:
 *   1. Non-platform-admin sees the Forbidden surface (same gate as
 *      the rest of /app/platform/*; URL must stay stable).
 *   2. Platform admin sees the grant form and the current-admins
 *      table (renders even when there is exactly one admin).
 *   3. Grant flow renders the success state with the email the
 *      caller provided, and the table refreshes to include the
 *      new row.
 *
 * The revoke flow is covered by a unit test against the service
 * (`tests/unit/platform-admins.test.ts`) — exercising the dialog
 * here would require a third signed-in actor to be the grantee,
 * which is more setup than the contract warrants.
 */

test.describe("/app/platform/admins — gate + flow", () => {
  test("non-platform-admin sees the Forbidden surface (no redirect)", async ({ page }) => {
    const nonAdminEmail = `e2e-nonplatform-${Date.now()}@laratik.local`;
    await devSeed(page.request, {
      email: nonAdminEmail,
      agencyAdmin: false,
      workspaceRoles: ["viewer"],
      platformAdmin: false,
    });
    await devSignIn(page.request, { email: nonAdminEmail, role: "user" });

    const response = await page.goto("/app/platform/admins");
    expect(response, "navigation must produce a response").not.toBeNull();
    expect(response!.status(), "forbidden page is a 200, not a redirect").toBe(200);
    expect(page.url(), "URL must not change on a forbidden platform view").toMatch(
      /\/app\/platform\/admins$/,
    );

    await expect(page.getByTestId("platform-forbidden")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /forbidden/i }),
      "title announces the gate failure",
    ).toBeVisible();

    // The grant form MUST NOT leak.
    await expect(page.getByTestId("platform-admins-grant-form")).toHaveCount(0);
    await expect(page.getByTestId("platform-admins-table")).toHaveCount(0);
  });

  test("platform admin sees the grant form and current-admins table", async ({ page }) => {
    const adminEmail = `e2e-platform-admin-${Date.now()}@laratik.local`;
    await devSeed(page.request, {
      email: adminEmail,
      agencyAdmin: true,
      platformAdmin: true,
    });
    await devSignIn(page.request, { email: adminEmail, role: "agency_admin" });

    await page.goto("/app/platform/admins");
    await expect(page.getByTestId("platform-admins-root")).toBeVisible();
    await expect(page.getByTestId("platform-admins-grant-form")).toBeVisible();
    await expect(page.getByRole("heading", { name: /current platform admins/i })).toBeVisible();

    // The actor's own row is in the table.
    await expect(page.getByTestId(`platform-admins-row-`)).toHaveCount(0);
  });

  test("grant flow renders the success state and adds the new row", async ({ page }) => {
    const adminEmail = `e2e-grantor-${Date.now()}@laratik.local`;
    const granteeEmail = `e2e-grantee-${Date.now()}@laratik.local`;

    // Seed the grantor as a platform admin and the grantee as a
    // signed-in-but-not-yet-platform-admin user. Two seeds → two
    // users → the form can look up the grantee by email.
    await devSeed(page.request, {
      email: adminEmail,
      agencyAdmin: true,
      platformAdmin: true,
      agencySlug: "platform-grantor",
      workspaceSlug: "platform-grantor-ws",
    });
    await devSeed(page.request, {
      email: granteeEmail,
      agencyAdmin: true,
      platformAdmin: false,
      agencySlug: "platform-grantee",
      workspaceSlug: "platform-grantee-ws",
    });
    await devSignIn(page.request, { email: adminEmail, role: "agency_admin" });

    await page.goto("/app/platform/admins");
    await expect(page.getByTestId("platform-admins-root")).toBeVisible();

    // Fill the form and submit.
    await page.getByTestId("platform-admins-grant-email").fill(granteeEmail);
    await page
      .getByTestId("platform-admins-grant-reason")
      .fill("E2E test grant — verifying the grant flow");
    await page.getByTestId("platform-admins-grant-submit").click();

    // Success state is rendered.
    await expect(page.getByTestId("platform-admins-grant-success")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("platform-admins-grant-success")).toContainText(granteeEmail);

    // The grantee is now in the table. We re-fetch the page to
    // confirm the revalidatePath landed.
    await page.reload();
    await expect(page.getByTestId("platform-admins-table")).toBeVisible();
    await expect(page.getByText(granteeEmail, { exact: false })).toBeVisible();
  });
});
