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

  // TEST-12 (GAP-FULL-REVIEW-2026-08-25): the full §23 happy path
  // for the content state machine. The previous "full happy path"
  // test stopped at `approved_for_design`; the §23 spec continues
  // through design, creative review, client review, ready-to-publish,
  // and final publication. This test exercises every transition in
  // the §10 state machine (via the §23 surface) end-to-end, across
  // the four actor roles that participate.
  test("full §23 path: draft → published across planner/reviewer/designer/publisher", async ({
    context,
  }) => {
    // Open one browser context per role; each owns its own
    // authenticated cookie jar. We hand the planning detail URL
    // across contexts so each actor lands on the same content item.
    const plannerContext = await context.browser()!.newContext();
    const reviewerContext = await context.browser()!.newContext();
    const designerContext = await context.browser()!.newContext();
    const publisherContext = await context.browser()!.newContext();

    const plannerPage = await plannerContext.newPage();
    const reviewerPage = await reviewerContext.newPage();
    const designerPage = await designerContext.newPage();
    const publisherPage = await publisherContext.newPage();

    try {
      // ─── 1. Planner: create a draft ───
      await bootstrapRoleSession(plannerPage, "content_planner");
      await plannerPage.goto("/app/w/acme/planning/new");
      const title = `E2E §23 full ${Date.now()}`;
      await plannerPage.getByLabel(/Title/i).first().fill(title);
      await plannerPage.getByRole("button", { name: /Create draft/i }).click();
      await plannerPage.waitForURL(/\/app\/w\/acme\/planning\/[0-9a-f-]+$/, {
        timeout: 20_000,
        waitUntil: "commit",
      });
      const detailUrl = plannerPage.url();

      // ─── 2. Planner: submit for content review ───
      await plannerPage
        .getByRole("button", { name: /submit.*review/i })
        .first()
        .click();
      await expect(plannerPage.getByText(/content review/i).first()).toBeVisible({
        timeout: 10_000,
      });

      // ─── 3. Internal reviewer: approve content → approved_for_design ───
      await bootstrapRoleSession(reviewerPage, "internal_reviewer");
      await reviewerPage.goto(detailUrl);
      await reviewerPage
        .getByRole("button", { name: /approve/i })
        .first()
        .click();
      await expect(reviewerPage.getByText(/approved for design/i).first()).toBeVisible({
        timeout: 10_000,
      });

      // ─── 4. Workspace manager: assign designer → in_design ───
      const managerContext = await context.browser()!.newContext();
      const managerPage = await managerContext.newPage();
      try {
        await bootstrapRoleSession(managerPage, "workspace_manager");
        await managerPage.goto(detailUrl);
        const assignBtn = managerPage.getByRole("button", { name: /assign designer/i }).first();
        await expect(assignBtn).toBeVisible({ timeout: 10_000 });
        await assignBtn.click();
        await expect(managerPage.getByText(/in design/i).first()).toBeVisible({ timeout: 10_000 });
      } finally {
        await managerContext.close();
      }

      // ─── 5. Designer: submit a delivery → creative_review ───
      await bootstrapRoleSession(designerPage, "designer");
      await designerPage.goto(detailUrl);
      // The delivery form starts open when the content is in_design
      // and no past deliveries exist. We assert the form is reachable
      // and fill it.
      const deliveryForm = designerPage.getByTestId("delivery-submit-form");
      const deliveryCta = designerPage.getByTestId("delivery-submit-cta");
      // Either the form is already open OR the CTA is the entry point.
      const ctaVisible = await deliveryCta.isVisible().catch(() => false);
      if (ctaVisible) {
        await deliveryCta.getByRole("button", { name: /Submit delivery/i }).click();
      }
      await expect(deliveryForm).toBeVisible({ timeout: 10_000 });
      await designerPage.locator('input[name="description"]').fill("V1 creatives");
      // At least one HTTPS link is required.
      await designerPage.locator('input[name="linkUrl"]').first().fill("https://example.com/v1");
      await designerPage.getByRole("button", { name: /Submit for creative review/i }).click();
      // The status should advance to creative_review.
      await expect(designerPage.getByText(/creative review/i).first()).toBeVisible({
        timeout: 15_000,
      });

      // ─── 6. Internal reviewer: approve internal creative → ready_to_publish ───
      await reviewerPage.goto(detailUrl);
      // The ApprovalTimeline is rendered when an approval is pending.
      // The "Approve" button on the timeline advances the gate.
      const approveCreativeBtn = reviewerPage.getByRole("button", { name: /^Approve$/i }).first();
      await expect(approveCreativeBtn).toBeVisible({ timeout: 10_000 });
      await approveCreativeBtn.click();
      await expect(reviewerPage.getByText(/ready to publish/i).first()).toBeVisible({
        timeout: 15_000,
      });

      // ─── 7. Publisher: record publications for each of the 3 channels → published ───
      await bootstrapRoleSession(publisherPage, "publisher");
      await publisherPage.goto(detailUrl);
      // The publishing section shows a "Record" button per channel.
      // We click each one, fill the published URL, and save.
      const recordButtons = publisherPage.getByRole("button", { name: /^Record$/i });
      const count = await recordButtons.count();
      // The seed has 3 channels; the §23 path requires all of them
      // to be recorded before the item transitions to `published`.
      expect(count).toBeGreaterThanOrEqual(3);
      for (let i = 0; i < count; i += 1) {
        // The buttons are re-rendered after each save; we always
        // re-query the first match so we iterate the right channel.
        const btn = publisherPage.getByRole("button", { name: /^Record$/i }).first();
        await btn.click();
        // The form is in the same card; fill the URL and save.
        const publishedUrl = publisherPage.locator('input[name="publishedUrl"]').first();
        await publishedUrl.fill(`https://example.com/post-${i}`);
        await publisherPage
          .getByRole("button", { name: /^Save$/i })
          .first()
          .click();
        // Wait for the form to close (the save button disappears).
        await expect(publisherPage.getByRole("button", { name: /^Save$/i })).toHaveCount(0, {
          timeout: 10_000,
        });
      }

      // ─── 8. Verify the final state is `published` ───
      // Refresh the page and assert the status badge.
      await publisherPage.reload();
      await expect(publisherPage.getByText(/^published$/i).first()).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await Promise.all([
        plannerContext.close(),
        reviewerContext.close(),
        designerContext.close(),
        publisherContext.close(),
      ]);
    }
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
