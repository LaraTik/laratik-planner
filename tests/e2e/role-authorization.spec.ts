import { expect, test } from "@playwright/test";
import { bootstrapRoleSession } from "./_helpers";

test.describe("role-separated workspace access", () => {
  test("content planner can create while viewer cannot", async ({ page }) => {
    await bootstrapRoleSession(page, "content_planner");
    await page.goto("/app/w/acme/planning");
    await expect(page.getByRole("link", { name: /Quick Create/i })).toBeVisible();

    await bootstrapRoleSession(page, "viewer");
    await page.goto("/app/w/acme/planning");
    await expect(page.getByRole("link", { name: /Quick Create/i })).toHaveCount(0);
    await page.goto("/app/w/acme/planning/new");
    await expect(page.getByRole("heading", { name: "Creation access required" })).toBeVisible();
  });

  test("review roles see only their review surface", async ({ page }) => {
    await bootstrapRoleSession(page, "internal_reviewer");
    await page.goto("/app/w/acme/reviews");
    await expect(page.getByRole("heading", { name: "Reviews queue" })).toBeVisible();

    await bootstrapRoleSession(page, "client_reviewer");
    await page.goto("/app/w/acme/client");
    await expect(page.getByRole("heading", { name: "Client review" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Planning" })).toHaveCount(0);
    await page.goto("/app/w/acme/planning");
    await expect(page.getByRole("heading", { name: /Page not found/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Planning$/i })).toHaveCount(0);
  });

  for (const role of ["workspace_manager", "designer", "publisher", "viewer"] as const) {
    test(`${role} has workspace access without agency-admin privileges`, async ({ page }) => {
      await bootstrapRoleSession(page, role);
      await page.goto("/app/w/acme");
      await expect(page.getByRole("heading", { name: "Acme" })).toBeVisible();
      await expect(page.getByText("No access")).toHaveCount(0);
    });
  }
});
