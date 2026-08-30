import { expect, test } from "@playwright/test";
import { bootstrapRoleSession, bootstrapTestSession } from "./_helpers";

/**
 * Phase 7 of the planning-detail refactor (2026-08-30) absorbed
 * the standalone `/publish` route into the Publishing tab. The
 * PublishPackageForm component itself is unchanged — it lives
 * inside the planning detail page now. The tests below navigate
 * to the planning detail page with the `publishing` hash so the
 * `WorkspaceShell` mounts the Publishing panel, which in turn
 * mounts the form.
 */

test.describe("Publish package", () => {
  test("agency admin can save, reload, and approve final copy", async ({ page }) => {
    const workspaceSlug = `publish-admin-${Date.now()}`;
    const seeded = await bootstrapTestSession(page, {
      workspaceSlug,
      workspaceName: "Publish Admin",
    });
    // The `/publish` route is a server-side redirect to
    // `#publishing` (see `src/app/.../planning/[id]/publish/page.tsx`).
    // Land on the planning detail page directly so the test
    // doesn't depend on the redirect resolving before the
    // first assertion.
    await page.goto(`/app/w/${seeded.workspaceSlug}/planning/${seeded.contentItemId}#publishing`);
    // Wait for the form to mount (the WorkspaceShell listens
    // to hashchange and switches panels asynchronously).
    await expect(page.getByTestId("publish-package-form")).toBeVisible({ timeout: 10_000 });

    const caption = `Publish package copy ${Date.now()}`;
    await page.getByTestId("publish-caption").fill(caption);
    await expect(page.getByTestId("publish-caption")).toHaveValue(caption);
    await page.getByTestId("publish-save-draft").click();
    await expect(page.getByRole("status")).toContainText("Draft saved");

    await page.reload();
    await expect(page.getByTestId("publish-package-form")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("publish-caption")).toHaveValue(caption);
    await page.getByTestId("publish-final-copy-approved").click();
    await expect(page.getByRole("status")).toContainText("Final copy approved");
    await expect(page.getByTestId("publish-final-copy-approved")).toHaveText("Revoke approval");
  });

  test("content planner can save but cannot self-approve final copy", async ({ page }) => {
    const seeded = await bootstrapRoleSession(page, "content_planner", "publish-planner");
    await page.goto(`/app/w/${seeded.workspaceSlug}/planning/${seeded.contentItemId}#publishing`);
    await expect(page.getByTestId("publish-package-form")).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId("publish-save-draft")).toBeEnabled();
    await expect(page.getByTestId("publish-final-copy-approved")).toHaveCount(0);
    await expect(page.getByText(/agency administrator must approve/i).first()).toBeVisible();
    await expect(page.getByTestId("publish-ready")).toBeDisabled();
  });
});
