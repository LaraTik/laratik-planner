import { test, expect } from "@playwright/test";
import { bootstrapRoleSession, bootstrapTestSession, type SeedResult } from "./_helpers";

/**
 * Content flow E2E tests — the master prompt §10 state machine.
 *
 * Happy path:
 *   draft → content_review → approved_for_design → in_design →
 *   creative_review → ready_to_publish → published
 *
 * Each transition is enforced server-side; tests assert the resulting
 * status badge after each step.
 */

test.describe("Content: Quick Create + workflow transitions", () => {
  test("planner can quick-create a draft and submit for review", async ({ page }) => {
    await bootstrapTestSession(page);

    // Navigate to Quick Create
    await page.goto("/app/w/acme/planning/new");
    await expect(page.getByRole("heading", { name: /Quick Create|Create/i }).first()).toBeVisible();

    // Fill the form
    const uniqueTitle = `Spring teaser ${Date.now()}`;
    await page.getByLabel(/Title/i).first().fill(uniqueTitle);
    // Format and date are pre-filled with sensible defaults; submit.
    await page.getByRole("button", { name: /Create draft/i }).click();

    // Server action redirects to the content detail page
    await page.waitForURL(/\/app\/w\/acme\/planning\/[0-9a-f-]+$/, {
      timeout: 20_000,
      waitUntil: "commit",
    });

    // The detail page shows the title + status badge "draft"
    await expect(page.getByRole("heading", { name: uniqueTitle })).toBeVisible();
    await expect(page.getByText(/draft/i).first()).toBeVisible();

    // Submit for content review (button label is "Submit for review")
    const submitReview = page.getByRole("button", { name: /submit.*review/i }).first();
    await submitReview.click();
    // Wait for the badge to update
    await expect(page.getByText(/content review/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("the new draft appears in the planning list", async ({ page }) => {
    await bootstrapTestSession(page);
    // First create a draft
    await page.goto("/app/w/acme/planning/new");
    const title = `List test ${Date.now()}`;
    await page.getByLabel(/Title/i).first().fill(title);
    await page.getByRole("button", { name: /Create draft/i }).click();
    await page.waitForURL(/\/app\/w\/acme\/planning\/[0-9a-f-]+$/, {
      timeout: 20_000,
      waitUntil: "commit",
    });

    // Navigate back to the planning list
    await page.goto("/app/w/acme/planning");
    await expect(page.getByText(title).first()).toBeVisible();
  });

  test("full happy path: planner drafts, reviewer approves → approved_for_design", async ({
    page,
    context,
  }) => {
    const seeded: SeedResult = await bootstrapRoleSession(page, "content_planner");

    // ─── Planner creates a draft via the Quick Create UI ───
    await page.goto("/app/w/acme/planning/new");
    const title = `E2E full path ${Date.now()}`;
    await page.getByLabel(/Title/i).first().fill(title);
    await page.getByRole("button", { name: /Create draft/i }).click();
    await page.waitForURL(/\/app\/w\/acme\/planning\/[0-9a-f-]+$/, {
      timeout: 20_000,
      waitUntil: "commit",
    });
    const detailUrl = page.url();
    const itemId = detailUrl.split("/").pop()!;
    expect(itemId).toMatch(/^[0-9a-f-]{36}$/);

    // ─── Planner submits the draft for content review ───
    await page
      .getByRole("button", { name: /submit.*review/i })
      .first()
      .click();
    await expect(page.getByText(/content review/i).first()).toBeVisible({ timeout: 10_000 });

    // ─── Sign in as the internal reviewer in a clean context and approve ───
    const reviewerContext = await context.browser()!.newContext();
    const reviewerPage = await reviewerContext.newPage();
    try {
      await bootstrapRoleSession(reviewerPage, "internal_reviewer");
      await reviewerPage.goto(detailUrl);
      const approveBtn = reviewerPage.getByRole("button", { name: /approve/i }).first();
      await expect(approveBtn).toBeVisible({ timeout: 10_000 });
      await approveBtn.click();
      await expect(reviewerPage.getByText(/approved for design/i).first()).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await reviewerContext.close();
    }

    // The seed should have created 3 channels in the workspace
    expect(seeded.channelIds.length).toBe(3);
  });

  test("the seeded workspace has the expected 3 channels in the channel list", async ({ page }) => {
    await bootstrapTestSession(page);
    // Channels aren't directly visible in the UI yet (v1), but the
    // Quick Create form auto-selects all of them and the detail page
    // lists them. Verify by creating a draft and checking the Channels
    // section.
    await page.goto("/app/w/acme/planning/new");
    const title = `Channels test ${Date.now()}`;
    await page.getByLabel(/Title/i).first().fill(title);
    await page.getByRole("button", { name: /Create draft/i }).click();
    await page.waitForURL(/\/app\/w\/acme\/planning\/[0-9a-f-]+$/, {
      timeout: 20_000,
      waitUntil: "commit",
    });

    // The "Channels" section should list at least 3 channels
    await expect(page.getByRole("heading", { name: "Channels", exact: true })).toBeVisible();
    // Channel rows display the platform badge + account name
    await expect(page.getByText(/Acme IG/i).first()).toBeVisible();
    await expect(page.getByText(/Acme LinkedIn/i).first()).toBeVisible();
    await expect(page.getByText(/Acme TikTok/i).first()).toBeVisible();
  });
});
