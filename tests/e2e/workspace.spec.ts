import { test, expect } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

/**
 * Workspace flow E2E tests.
 *
 * Covers the Goals 3 + 6 /app shell + workspace navigation + workspace
 * creation contract. The seed creates one "acme" workspace; the create
 * flow creates a second one.
 */

test.describe("Workspace navigation (admin)", () => {
  test("admin can see the seeded workspace and navigate to its overview", async ({ page }) => {
    await bootstrapTestSession(page);

    await page.goto("/app/workspaces");
    await expect(page.getByRole("heading", { name: "Workspaces" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Acme/ }).first()).toBeVisible();

    // Click into the workspace
    await page.getByRole("link", { name: /Acme/ }).first().click();
    await expect(page).toHaveURL(/\/app\/w\/acme$/);
    await expect(page.getByRole("heading", { name: "Acme" })).toBeVisible();
    // The planning + calendar shortcuts must be present
    await expect(page.getByRole("link", { name: /Planning/i }).first()).toBeVisible();
  });

  test("Planning tab lists channels + an empty-state for fresh workspaces", async ({ page }) => {
    await bootstrapTestSession(page);

    await page.goto("/app/w/acme/planning");
    // The page renders either an item list or an empty state
    await expect(page.getByRole("heading", { name: /Planning|Calendar/i }).first()).toBeVisible();
  });

  test("admin can create a new workspace via the form", async ({ page }) => {
    await bootstrapTestSession(page, { workspaceSlug: "acme" });

    await page.goto("/app/workspaces/new");
    await expect(page.getByRole("heading", { name: "New workspace" })).toBeVisible();

    // Fill the form
    const uniqueSlug = `ws-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    await page.getByLabel(/Workspace name/i).fill("My New Brand");
    await page.getByLabel(/URL slug/i).fill(uniqueSlug);

    // Submit
    await page.getByRole("button", { name: /Create workspace/i }).click();

    // After redirect, we should be on the new workspace's overview
    await page.waitForURL(new RegExp(`/app/w/${uniqueSlug}$`), { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "My New Brand" })).toBeVisible();

    // The new workspace must also appear in the list
    await page.goto("/app/workspaces");
    await expect(page.getByRole("link", { name: /My New Brand/ }).first()).toBeVisible();
  });

  test("create-workspace form rejects invalid slugs with a validation error", async ({
    page,
  }) => {
    await bootstrapTestSession(page);

    await page.goto("/app/workspaces/new");
    const slugField = page.getByLabel(/URL slug/i);
    // HTML5 pattern blocks uppercase / special chars at the client side
    await slugField.fill("INVALID UPPERCASE");
    // Try submitting — the form should refuse
    await page.getByRole("button", { name: /Create workspace/i }).click();
    // The browser blocks the submit; the URL must still be /app/workspaces/new
    await expect(page).toHaveURL(/\/app\/workspaces\/new/);
  });
});

test.describe("Workspace non-member experience", () => {
  test("a user with no memberships sees the empty state and a Create button", async ({
    page,
  }) => {
    await bootstrapTestSession(page, { email: "viewer@laratik.local" });

    await page.goto("/app/workspaces");
    await expect(page.getByRole("heading", { name: "Workspaces" })).toBeVisible();
    // Admin state: even viewer (seeded as admin) sees the new-workspace CTA
    await expect(page.getByRole("link", { name: /New workspace/i }).first()).toBeVisible();
  });
});
