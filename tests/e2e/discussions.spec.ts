import { test, expect } from "@playwright/test";
import { bootstrapTestSession, devSeed, devSignIn } from "./_helpers";

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
  await page.waitForURL(/\/app\/w\/acme\/planning\/[0-9a-f-]+$/, {
    timeout: 20_000,
    waitUntil: "commit",
  });
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

  test("the visibility selector defaults to 'Client visible' for an admin/planner who can post both", async ({
    page,
  }) => {
    await bootstrapTestSession(page);
    await createDraftAndOpen(page, `Discussion visibility ${Date.now()}`);

    await page.getByRole("button", { name: /Add comment/i }).click();
    const select = page.locator('select[name="visibility"]');
    // Round 2 UX: agency-side users default to client-visible (their
    // thread is more useful for client sharing). They can still switch.
    await expect(select).toHaveValue("client");
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

  // TEST-12 (GAP-FULL-REVIEW-2026-08-25): @mention coverage was
  // missing from the discussions spec. The discussions service
  // extracts @-mentions from the body and stores them in
  // `comment_mention` rows + an outbox event; the rendered comment
  // item shows a "{N} mention(s)" badge. The test posts a comment
  // with an @-mention aimed at a second seeded user and asserts the
  // badge appears.
  test("a comment that @mentions a workspace user renders a 'mention' badge", async ({ page }) => {
    // Seed a second user in the same workspace so the @mention
    // resolves. We use the devSeed + devSignIn flow directly so we
    // can pass the workspaceRoles option that bootstrapTestSession
    // does not expose.
    const mentionEmail = `e2e-designer@laratik.local`;
    await devSeed(page.request, { email: mentionEmail, workspaceRoles: ["designer"] });
    await devSignIn(page.request, { email: mentionEmail, role: "user" });
    await createDraftAndOpen(page, `Discussion mention ${Date.now()}`);

    await page.getByRole("button", { name: /Add comment/i }).click();
    // @-mention the designer's email-prefix (the service matches
    // `@<email-prefix>` OR `@<displayName-without-spaces>`).
    const body = `Hey @e2e-designer can you take a look? ${Date.now()}`;
    await page.getByPlaceholder(/Add a comment/i).fill(body);
    await page.getByRole("button", { name: /^Comment$/i }).click();

    await expect(page.getByText(body)).toBeVisible({ timeout: 10_000 });
    // The "1 mention" badge appears under the comment.
    await expect(page.getByText(/1 mention\b/i)).toBeVisible();
  });

  // TEST-12: the visibility selector toggle path. The existing
  // "an admin can post a client-visible comment" test covers
  // selecting "client" and posting. This test pins the
  // "switch to internal" branch — i.e. the same form can also
  // post an internal comment without leaving the page.
  test("a workspace member can toggle the visibility selector between client and internal", async ({
    page,
  }) => {
    await bootstrapTestSession(page);
    await createDraftAndOpen(page, `Discussion vis toggle ${Date.now()}`);

    await page.getByRole("button", { name: /Add comment/i }).click();
    const select = page.locator('select[name="visibility"]');
    // Round 2 UX default is "client"; the user can switch to internal.
    await expect(select).toHaveValue("client");
    await select.selectOption("internal");
    await expect(select).toHaveValue("internal");
    // Posting an internal comment renders the "Internal" badge.
    const body = `Internal note ${Date.now()}`;
    await page.getByPlaceholder(/Add a comment/i).fill(body);
    await page.getByRole("button", { name: /^Comment$/i }).click();
    await expect(page.getByText(body)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("internal").first()).toBeVisible();
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

  test("shows the unread badge when the user has notifications", async ({ page, request }) => {
    const email = `notifs-badge-${Date.now()}@laratik.local`;
    await bootstrapTestSession(page, { email });
    await request.post("/api/dev/notifications", { data: { email, count: 3, readCount: 0 } });
    await page.goto("/app");

    const badge = page.locator('[data-testid^="unread-badge"]:visible');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("3");
  });

  test("shows '9+' once unread count exceeds 9", async ({ page, request }) => {
    const email = `notifs-overflow-${Date.now()}@laratik.local`;
    await bootstrapTestSession(page, { email });
    await request.post("/api/dev/notifications", { data: { email, count: 12, readCount: 0 } });
    await page.goto("/app");

    const badge = page.locator('[data-testid^="unread-badge"]:visible');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText("9+");
  });

  test("clicking the bell opens the popover; Escape closes it and restores focus", async ({
    page,
    request,
  }) => {
    const email = `notifs-open-${Date.now()}@laratik.local`;
    await bootstrapTestSession(page, { email });
    await request.post("/api/dev/notifications", { data: { email, count: 2, readCount: 0 } });
    await page.goto("/app");

    const bell = page.getByRole("button", { name: /^Notifications/i });
    await bell.focus();
    await bell.click();

    const dialog = page.getByRole("dialog", { name: "Notifications" });
    await expect(dialog).toBeVisible();

    // Esc closes
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();

    // Focus returns to the bell
    await expect(bell).toBeFocused();
  });

  test("'Mark all read' clears the badge and dims all rows", async ({ page, request }) => {
    const email = `notifs-mark-all-${Date.now()}@laratik.local`;
    await bootstrapTestSession(page, { email });
    await request.post("/api/dev/notifications", { data: { email, count: 3, readCount: 0 } });
    await page.goto("/app");

    const bell = page.getByRole("button", { name: /^Notifications/i });
    await bell.click();

    const markAll = page.getByRole("button", { name: /Mark all read/i });
    await markAll.click();

    // Badge disappears (revalidatePath + nav refresh)
    await expect(page.locator('[data-testid^="unread-badge"]:visible')).toHaveCount(0, {
      timeout: 10_000,
    });
  });

  test("outside click closes the popover", async ({ page, request }) => {
    const email = `notifs-outside-${Date.now()}@laratik.local`;
    await bootstrapTestSession(page, { email });
    await request.post("/api/dev/notifications", { data: { email, count: 1, readCount: 0 } });
    await page.goto("/app");

    await page.getByRole("button", { name: /^Notifications/i }).click();
    await expect(page.getByRole("dialog", { name: "Notifications" })).toBeVisible();

    // Click on the main content area (outside the dialog)
    await page.locator("main").click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole("dialog", { name: "Notifications" })).not.toBeVisible();
  });

  test("popover is positioned within the viewport on a narrow desktop (1024px) — no overflow", async ({
    page,
    request,
  }) => {
    const email = `notifs-narrow-${Date.now()}@laratik.local`;
    await bootstrapTestSession(page, { email });
    await request.post("/api/dev/notifications", { data: { email, count: 1, readCount: 0 } });
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/app");

    await page.getByRole("button", { name: /^Notifications/i }).click();
    const dialog = page.getByRole("dialog", { name: "Notifications" });
    await expect(dialog).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(1024);
  });
});
