import { expect, test } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

/**
 * Browser contract for the completed, credential-write-only part of the
 * Global Admin Meta Ads workflow. Provider validation is intentionally not
 * invoked here: live Meta UAT requires an explicitly authorized account and
 * belongs to the controlled external-service test plan.
 */
test.describe("Meta Ads advertising administration", () => {
  test("creates a connection and never renders the saved access token", async ({ page }) => {
    const suffix = Date.now().toString(36);
    await bootstrapTestSession(page, {
      agencyName: `Advertising E2E ${suffix}`,
      agencySlug: `advertising-e2e-${suffix}`,
      workspaceName: `Advertising E2E Workspace ${suffix}`,
      workspaceSlug: `advertising-e2e-${suffix}`,
    });

    // The advertising credential envelope uses the agency DEK. Enable the
    // existing local key-management surface first; this remains entirely
    // offline and keeps the test faithful to the production prerequisite.
    await page.goto("/app/agency-settings/social");
    await page.getByTestId("agency-social-enable-button").click();
    await expect(page.getByTestId("agency-social-recovery-key-value")).toBeVisible();
    await page.getByTestId("agency-social-recovery-key-confirm").click();
    await page.getByTestId("agency-social-recovery-key-close").click();
    await expect(page.getByTestId("agency-social-enabled-badge")).toBeVisible();

    await page.goto("/app/agency-settings/advertising");
    await expect(page.getByTestId("advertising-settings")).toBeVisible();

    const displayName = `Meta test connection ${suffix}`;
    const createForm = page.getByTestId("advertising-create-form");
    await createForm.locator("#advertising-display-name").fill(displayName);
    await createForm.locator("#advertising-app-id").fill(`app-${suffix}`);
    await createForm.getByRole("button", { name: "Create connection" }).click();

    const connectionCard = page.locator('[data-testid^="advertising-connection-"]', {
      hasText: displayName,
    });
    await expect(connectionCard).toBeVisible();

    const token = `fixture-meta-token-${suffix}`;
    const tokenInput = connectionCard.locator('input[name="accessToken"]');
    await expect(tokenInput).toHaveAttribute("type", "password");
    await tokenInput.fill(token);
    await connectionCard.getByRole("button", { name: "Save credential" }).click();

    await expect(connectionCard.getByRole("status")).toHaveText(
      "Credential encrypted and stored. Validate it before use.",
    );
    await expect(connectionCard.getByTestId(/advertising-credential-status-/)).toContainText(
      `••••${token.slice(-4)}`,
    );
    await expect(page.locator("body")).not.toContainText(token);
    await expect(tokenInput).toHaveValue("");
  });
});
