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
    await expect(
      page.locator('[data-testid="workflow-stepper-compact"][data-status="content_review"]'),
    ).toBeVisible({
      timeout: 10_000,
    });
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
    await page.goto(`/app/w/acme/planning?search=${encodeURIComponent(title)}`);
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
    await expect(
      page.locator('[data-testid="workflow-stepper-compact"][data-status="content_review"]'),
    ).toBeVisible({
      timeout: 10_000,
    });

    // ─── Sign in as the internal reviewer in a clean context and approve ───
    const reviewerContext = await context.browser()!.newContext();
    const reviewerPage = await reviewerContext.newPage();
    try {
      await bootstrapRoleSession(reviewerPage, "internal_reviewer");
      await reviewerPage.goto(detailUrl);
      const approveBtn = reviewerPage.getByRole("button", { name: /approve/i }).first();
      await expect(approveBtn).toBeVisible({ timeout: 10_000 });
      await approveBtn.click();
      await expect(
        reviewerPage.locator(
          '[data-testid="workflow-stepper-compact"][data-status="approved_for_design"]',
        ),
      ).toBeVisible({ timeout: 10_000 });
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
    // This cross-role journey intentionally opens four isolated contexts
    // and exercises every workflow transition; allow enough time for the
    // first dev-server compilation and server actions on a cold run.
    test.setTimeout(90_000);
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
    let designerSeeded: SeedResult;

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

      // Publish-package drafts are material edits and are intentionally
      // writable by planners/managers only. Save a package for each seeded
      // channel while the planner still owns the editable draft; the later
      // publisher role records outcomes against those configured channels.
      await plannerPage.getByTestId("workspace-tab-publishing").click();
      const plannerPackageForm = plannerPage.getByTestId("publish-package-form");
      const plannerPackageTabs = plannerPackageForm.getByRole("tab");
      const plannerPackageTabCount = await plannerPackageTabs.count();
      for (let i = 0; i < plannerPackageTabCount; i += 1) {
        await plannerPackageTabs.nth(i).click();
        await plannerPackageForm.getByTestId("publish-save-draft").click();
        await expect(plannerPackageForm.getByTestId("publish-last-saved")).toBeVisible({
          timeout: 10_000,
        });
      }

      // ─── 2. Planner: submit for content review ───
      await plannerPage
        .getByRole("button", { name: /submit.*review/i })
        .first()
        .click();
      await expect(
        plannerPage.locator(
          '[data-testid="workflow-stepper-compact"][data-status="content_review"]',
        ),
      ).toBeVisible({ timeout: 10_000 });

      // ─── 3. Internal reviewer: approve content → approved_for_design ───
      await bootstrapRoleSession(reviewerPage, "internal_reviewer");
      await reviewerPage.goto(detailUrl);
      await reviewerPage
        .getByRole("button", { name: /approve/i })
        .first()
        .click();
      await expect(
        reviewerPage.locator(
          '[data-testid="workflow-stepper-compact"][data-status="approved_for_design"]',
        ),
      ).toBeVisible({ timeout: 10_000 });

      // ─── 3b. Seed a designer in the workspace BEFORE the manager
      // picks. The dev seed (`/api/dev/seed`) is idempotent on the
      // workspace slug, so this gives the workspace at least one
      // designer candidate for the manager's picker. The previous
      // E2E assertion (`/in design/i` text) was a false-positive —
      // the workflow bar always renders every status as a badge, so
      // the test "passed" even when the action had failed silently.
      // The strengthened assertion below queries the data-testid that
      // marks the actual current status badge, and exercises the new
      // designer-picker dialog end-to-end. ───
      const designerSeedContext = await context.browser()!.newContext();
      const designerSeedPage = await designerSeedContext.newPage();
      try {
        designerSeeded = await bootstrapRoleSession(designerSeedPage, "designer");
      } finally {
        await designerSeedContext.close();
      }

      // ─── 4. Workspace manager: assign designer via picker → in_design ───
      const managerContext = await context.browser()!.newContext();
      const managerPage = await managerContext.newPage();
      try {
        await bootstrapRoleSession(managerPage, "workspace_manager");
        await managerPage.goto(detailUrl);
        // The picker trigger is the only "Assign designer" button
        // on the page (the old direct-call button was removed). It
        // is disabled when the workspace has no designers; the seed
        // above guarantees at least one.
        const assignBtn = managerPage.getByTestId("assign-designer-trigger");
        await expect(assignBtn).toBeVisible({ timeout: 10_000 });
        await expect(assignBtn).toBeEnabled();
        await assignBtn.click();
        // The dialog opens; the select is auto-populated from the
        // designer roster. The first designer is the default
        // selection, so we can confirm without picking.
        const confirmBtn = managerPage.getByTestId("assign-designer-confirm");
        await expect(confirmBtn).toBeVisible({ timeout: 10_000 });
        await managerPage.getByTestId("assign-designer-select").selectOption(designerSeeded.userId);
        await confirmBtn.click();
        // Real status assertion: the workflow bar's "current" badge
        // (the only element with `data-testid="status-current"`)
        // must now carry the `in_design` status. This is the test
        // the original version skipped.
        const currentBadge = managerPage.locator(
          '[data-testid="workflow-stepper-compact"][data-status="in_design"]',
        );
        await expect(currentBadge).toBeVisible({ timeout: 10_000 });
        await expect(currentBadge).toHaveAttribute("data-status", "in_design");
      } finally {
        await managerContext.close();
      }

      // ─── 5. Designer: submit a delivery → creative_review ───
      await bootstrapRoleSession(designerPage, "designer");
      await designerPage.goto(detailUrl);
      await designerPage.getByTestId("workspace-tab-content").click();
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
      await deliveryForm.locator('input[name="description"]').fill("V1 creatives");
      // At least one HTTPS link is required.
      await deliveryForm.locator('input[name="linkLabel"]').first().fill("V1 creative files");
      await deliveryForm.locator('input[name="linkUrl"]').first().fill("https://example.com/v1");
      await deliveryForm.getByRole("button", { name: /Submit for creative review/i }).click();
      // The status should advance to creative_review.
      await expect(
        designerPage.locator(
          '[data-testid="workflow-stepper-compact"][data-status="creative_review"]',
        ),
      ).toBeVisible({
        timeout: 15_000,
      });

      // ─── 6. Internal reviewer: approve internal creative → ready_to_publish ───
      await reviewerPage.goto(detailUrl);
      // The ApprovalTimeline is rendered when an approval is pending.
      // The "Approve" button on the timeline advances the gate.
      const approveCreativeBtn = reviewerPage.getByRole("button", { name: /^Approve$/i }).first();
      await expect(approveCreativeBtn).toBeVisible({ timeout: 10_000 });
      await approveCreativeBtn.click();
      await expect(
        reviewerPage.locator(
          '[data-testid="workflow-stepper-compact"][data-status="ready_to_publish"]',
        ),
      ).toBeVisible({
        timeout: 15_000,
      });

      // ─── 7. Publisher: record publications for each of the 3 channels → published ───
      await bootstrapRoleSession(publisherPage, "publisher");
      await publisherPage.goto(detailUrl);
      await publisherPage.getByTestId("workspace-tab-publishing").click();
      // The publishing section shows a "Record" button per channel.
      // We click each one, fill the published URL, and save.
      const cards = publisherPage.getByTestId("channel-publishing-card");
      const channelIds = await cards.evaluateAll((nodes) =>
        nodes
          .map((node) => node.getAttribute("data-channel-id"))
          .filter((id): id is string => Boolean(id)),
      );
      const count = channelIds.length;
      // The seed has 3 channels; the §23 path requires all of them
      // to be recorded before the item transitions to `published`.
      expect(count).toBeGreaterThanOrEqual(3);
      for (const [i, channelId] of channelIds.entries()) {
        // Revisit the route for each channel. The outcome action updates
        // the server-rendered publication prop; a fresh render prevents
        // the previous card's transition from racing the next submit.
        await publisherPage.goto(`${detailUrl}?channel=${channelId}#publishing`, {
          waitUntil: "commit",
        });
        await publisherPage.getByTestId("workspace-tab-publishing").click();
        const card = publisherPage.locator(
          `[data-testid="channel-publishing-card"][data-channel-id="${channelId}"]`,
        );
        await card.getByTestId("channel-card-record-outcome").click();
        // The form is in the same card; fill the URL and save.
        const publishedUrl = card.locator('input[name="publishedUrl"]');
        await publishedUrl.fill(`https://example.com/post-${i}`);
        await card.getByRole("button", { name: /^Save outcome$/i }).click();
        // Wait for the form to close (the save button disappears).
        await expect(card.getByRole("button", { name: /^Save outcome$/i })).toHaveCount(0, {
          timeout: 10_000,
        });
        await expect(card.getByTestId("channel-card-status")).toHaveText("Published", {
          timeout: 10_000,
        });
      }

      // ─── 8. Verify the final state is `published` ───
      // Revisit the detail route and assert the server-derived status.
      // The action revalidates the dynamic detail route; a unique query
      // also prevents a browser cache from masking the final aggregate.
      await publisherPage.goto(`${detailUrl}?published=${Date.now()}`, {
        waitUntil: "commit",
      });
      await expect(
        publisherPage.locator('[data-testid="workflow-stepper-compact"][data-status="published"]'),
      ).toBeVisible({
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
    await expect(page.getByText(/3 channels/i).first()).toBeVisible();
    await page.getByTestId("workspace-tab-publishing").click();
    const publishingCards = page.getByTestId("publishing-cards");
    await expect(publishingCards).toBeVisible();
    // Channel cards display the platform badge + account name.
    await expect(publishingCards.getByText(/Acme IG/i)).toBeVisible();
    await expect(publishingCards.getByText(/Acme LinkedIn/i)).toBeVisible();
    await expect(publishingCards.getByText(/Acme TikTok/i)).toBeVisible();
  });
});
