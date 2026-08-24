import { expect, test } from "@playwright/test";
import { bootstrapRoleSession, bootstrapTestSession } from "./_helpers";

test.describe("Publish package", () => {
  test("agency admin can save, reload, and approve final copy", async ({ page }) => {
    const workspaceSlug = `publish-admin-${Date.now()}`;
    const seeded = await bootstrapTestSession(page, {
      workspaceSlug,
      workspaceName: "Publish Admin",
    });
    const route = `/app/w/${seeded.workspaceSlug}/planning/${seeded.contentItemId}/publish`;
    await page.goto(route);

    const caption = `Publish package copy ${Date.now()}`;
    await page.getByTestId("publish-caption").fill(caption);
    await expect(page.getByTestId("publish-caption")).toHaveValue(caption);
    await page.getByTestId("publish-save-draft").click();
    await expect(page.getByRole("status")).toContainText("Draft saved");

    await page.reload();
    await expect(page.getByTestId("publish-caption")).toHaveValue(caption);
    await page.getByTestId("publish-final-copy-approved").click();
    await expect(page.getByRole("status")).toContainText("Final copy approved");
    await expect(page.getByTestId("publish-final-copy-approved")).toHaveText("Revoke approval");
  });

  test("content planner can save but cannot self-approve final copy", async ({ page }) => {
    const seeded = await bootstrapRoleSession(page, "content_planner", "publish-planner");
    await page.goto(`/app/w/${seeded.workspaceSlug}/planning/${seeded.contentItemId}/publish`);

    await expect(page.getByTestId("publish-save-draft")).toBeEnabled();
    await expect(page.getByTestId("publish-final-copy-approved")).toHaveCount(0);
    await expect(page.getByText(/agency administrator must approve/i).first()).toBeVisible();
    await expect(page.getByTestId("publish-ready")).toBeDisabled();
  });
});
