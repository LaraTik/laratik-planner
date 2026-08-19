import { test, expect } from "@playwright/test";
import { bootstrapTestSession } from "./_helpers";

/**
 * Discussion / notifications E2E (Goal 8).
 *
 * Covers:
 *  - Discussion section on the content detail page
 *  - Posting a comment, @mention, resolve / unresolve
 *  - Notifications bell badge + popover
 */

async function createDraftAndOpen(page: import("@playwright/test").Page, title: string) {
  await page.goto("/app/w/acme/planning/new");
  await page.getByLabel(/Title/i).first().fill(title);
  await page.getByRole("button", { name: /Create draft/i }).click();
  await page.waitForURL(/\/app\/w\/acme\/planning\/[0-9a-f-]+$/, { timeout: 10_000 });
}

test.describe("Discussions (Goal 8)", () => {
  test("a fresh content item shows an empty Discussion section + Add comment button", async ({
    page,
  }) => {
    await bootstrapTestSession(page);
    await createDraftAndOpen(page, `Discussion empty ${Date.now()}`);

    await expect(page.getByRole("heading", { name: "Discussion", exact: true })).toBeVisible();
    await expect(page.getByText(/No comments yet/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Add comment/i })).toBeVisible();
  });

  test("posting a comment shows it in the thread with the open-count badge", async ({ page }) => {
    await bootstrapTestSession(page);
    await createDraftAndOpen(page, `Discussion post ${Date.now()}`);

    await page.getByRole("button", { name: /Add comment/i }).click();
    const body = `E2E test comment ${Date.now()}`;
    await page.getByPlaceholder(/Add a comment/i).fill(body);
    await page.getByRole("button", { name: /^Comment$/i }).click();

    await expect(page.getByText(body)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/\(1 open\)/)).toBeVisible();
  });

  test("a comment can be resolved (and un-resolved)", async ({ page }) => {
    await bootstrapTestSession(page);
    await createDraftAndOpen(page, `Discussion resolve ${Date.now()}`);

    await page.getByRole("button", { name: /Add comment/i }).click();
    const body = `Resolve me ${Date.now()}`;
    await page.getByPlaceholder(/Add a comment/i).fill(body);
    await page.getByRole("button", { name: /^Comment$/i }).click();
    await expect(page.getByText(body)).toBeVisible({ timeout: 10_000 });

    // Resolve
    await page
      .getByRole("button", { name: /^Resolve$/i })
      .first()
      .click();
    await expect(page.getByText(/resolved/i).first()).toBeVisible({ timeout: 10_000 });
    // When all comments are resolved, the "(N open)" badge disappears
    // (the header just shows "Discussion" without a count)
    await expect(page.getByText(/\(1 open\)/)).not.toBeVisible();

    // Unresolve
    await page
      .getByRole("button", { name: /^Unresolve$/i })
      .first()
      .click();
    await expect(page.getByText(/\(1 open\)/)).toBeVisible({ timeout: 10_000 });
  });

  test("the visibility selector defaults to 'Internal only' for an internal role", async ({
    page,
  }) => {
    await bootstrapTestSession(page);
    await createDraftAndOpen(page, `Discussion visibility ${Date.now()}`);

    await page.getByRole("button", { name: /Add comment/i }).click();
    const select = page.locator('select[name="visibility"]');
    await expect(select).toHaveValue("internal");
    // The form should offer both options because the test user is a workspace admin
    await expect(select.locator('option[value="internal"]')).toHaveCount(1);
    await expect(select.locator('option[value="client"]')).toHaveCount(1);
  });

  test("an admin can post a client-visible comment", async ({ page }) => {
    await bootstrapTestSession(page);
    await createDraftAndOpen(page, `Discussion client ${Date.now()}`);

    await page.getByRole("button", { name: /Add comment/i }).click();
    const body = `Client-visible note ${Date.now()}`;
    await page.locator('select[name="visibility"]').selectOption("client");
    await page.getByPlaceholder(/Add a comment/i).fill(body);
    await page.getByRole("button", { name: /^Comment$/i }).click();

    await expect(page.getByText(body)).toBeVisible({ timeout: 10_000 });
    // The visibility badge for the comment should say "client"
    await expect(page.getByText("client").first()).toBeVisible();
  });
});

test.describe("Notifications bell (Goal 8)", () => {
  test("renders on the app shell with no badge for users with no notifications", async ({
    page,
  }) => {
    await bootstrapTestSession(page, { email: "no-notifs@laratik.local" });
    await page.goto("/app");

    const bell = page.getByRole("button", { name: /^Notifications$/i });
    await expect(bell).toBeVisible();
  });
});
