import { expect, test } from "@playwright/test";
import { devSeed, devSignIn } from "./_helpers";

/**
 * Agency identity edit (superadmin-clarity / agency-CRD) — E2E flow.
 *
 * Two cases:
 *   1. Agency admin edits the agency identity from
 *      /app/agency-settings. The page renders the EditAgencyForm
 *      for admins; non-admins see a read-only identity card and
 *      cannot submit.
 *   2. Platform admin opens the same agency from
 *      /app/platform/agencies/[id] and sees the same form with
 *      the platform-scoped data-testid prefix.
 *
 * Both forms post to a server action that revalidates the page
 * on success and appends a security_audit_event with the
 * before/after subset.
 */

test.describe("agency identity edit", () => {
  test("agency admin can edit the identity; non-admin sees read-only", async ({ page }) => {
    const adminEmail = `e2e-agency-admin-${Date.now()}@laratik.local`;
    const memberEmail = `e2e-agency-member-${Date.now()}@laratik.local`;

    // Seed the admin (with isAgencyAdmin) and a member (no
    // agency_admin) on the same agency.
    await devSeed(page.request, {
      email: memberEmail,
      agencyAdmin: false,
      platformAdmin: false,
      agencySlug: "edit-target-2",
      workspaceSlug: "edit-target-2-ws",
    });
    // Seed the actor last so the agency-context cookie belongs to the actor
    // who signs in below, not the unrelated member fixture.
    await devSeed(page.request, {
      email: adminEmail,
      agencyAdmin: true,
      platformAdmin: false,
      agencySlug: "edit-target",
      workspaceSlug: "edit-target-ws",
    });
    await devSignIn(page.request, { email: adminEmail, role: "agency_admin" });

    await page.goto("/app/agency-settings");
    await expect(page.getByTestId("agency-settings")).toBeVisible();
    // Admin sees the EditAgencyForm.
    await expect(page.getByTestId("agency-settings-edit-identity-form")).toBeVisible();
    await expect(page.getByTestId("agency-settings-edit-name")).toBeVisible();
    await expect(page.getByTestId("agency-settings-edit-slug")).toBeVisible();

    // Edit the name and save.
    const nameInput = page.getByTestId("agency-settings-edit-name");
    await nameInput.fill("Edit Target Renamed");
    await page.getByTestId("agency-settings-edit-submit").click();
    await expect(page.getByTestId("agency-settings-edit-saved")).toBeVisible({
      timeout: 10_000,
    });

    // Switch to the non-admin and verify the page does not
    // render the editable form.
    // The member is a member of a DIFFERENT agency (we seeded
    // two). The active agency context will pick the member's
    // own agency; the admin's agency is not in the cookie.
    // The /app/agency-settings path requires isAgencyAdmin,
    // so the member sees the Forbidden surface on their own
    // agency (since they're not an admin there either).
    await devSeed(page.request, {
      email: memberEmail,
      agencyAdmin: false,
      platformAdmin: false,
      agencySlug: "edit-target-2",
      workspaceSlug: "edit-target-2-ws",
    });
    await devSignIn(page.request, { email: memberEmail, role: "user" });
    await page.goto("/app/agency-settings");
    await expect(page.getByTestId("agency-settings-forbidden")).toBeVisible();
    await expect(page.getByTestId("agency-settings-edit-identity-form")).toHaveCount(0);
  });

  test("platform admin sees the EditAgencyForm on the agency detail page", async ({ page }) => {
    const adminEmail = `e2e-platform-admin-${Date.now()}@laratik.local`;
    await devSeed(page.request, {
      email: adminEmail,
      agencyAdmin: true,
      platformRole: "platform_owner",
      agencySlug: "platform-target",
      workspaceSlug: "platform-target-ws",
    });
    await devSignIn(page.request, { email: adminEmail, role: "agency_admin" });

    // Navigate to the agencies list and into the seeded agency.
    await page.goto("/app/platform/agencies");
    const firstRow = page.getByTestId(/^platform-agency-row-/);
    await expect(firstRow.first()).toBeVisible();
    await firstRow
      .first()
      .getByRole("link", { name: /open|edit/i })
      .click();
    await page.waitForURL(/\/app\/platform\/agencies\/[^/]+/);
    await expect(page.getByTestId("platform-agency-identity-section")).toBeVisible();
    await expect(page.getByTestId("platform-agency-edit-identity-form")).toBeVisible();
    // The platform-scoped form carries the platform-* prefix.
    await expect(page.getByTestId("platform-agency-edit-name")).toBeVisible();
    await expect(page.getByTestId("platform-agency-edit-slug")).toBeVisible();
  });
});
