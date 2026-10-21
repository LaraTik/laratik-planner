import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { bootstrapRoleSession } from "./_helpers";

test.describe("research teardown preview", () => {
  test("rejects an empty source URL as a validation error", async ({ page }) => {
    await bootstrapRoleSession(page, "workspace_manager", "research-watchlists-invalid-url");

    const response = await page.request.post("/api/research/watchlist", {
      data: {
        workspaceSlug: "research-watchlists-invalid-url",
        platform: "instagram",
        handle: "competitor",
        sourceUrl: "",
      },
    });

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_body" });
  });

  test("creates a named watchlist and assigns a source account", async ({ page }) => {
    await bootstrapRoleSession(page, "workspace_manager", "research-watchlists");
    await page.goto("/app/a/test-agency/w/research-watchlists/research");

    await expect(page.getByRole("heading", { name: "Account watchlists" })).toBeVisible();
    const watchlistName = `Halal grocery competitors ${Date.now()}`;
    await page.getByLabel("Watchlist name").fill(watchlistName);
    await page.getByRole("button", { name: "Create watchlist" }).click();
    await expect(page.getByRole("heading", { name: watchlistName })).toBeVisible({
      timeout: 30_000,
    });

    const competitorHandle = `competitor-${Date.now()}`;
    const handleField = page.getByLabel("Handle");
    await handleField.fill(`@${competitorHandle}`);
    await expect(handleField).toHaveValue(`@${competitorHandle}`);
    const sourceUrl = page.getByLabel("Profile URL");
    const competitorUrl = `https://instagram.com/${competitorHandle}`;
    await sourceUrl.fill(competitorUrl);
    await expect(sourceUrl).toHaveValue(competitorUrl);
    const submittedFields = await sourceUrl
      .locator("xpath=ancestor::form")
      .evaluate((element) =>
        Object.fromEntries(new FormData(element as HTMLFormElement).entries()),
      );
    expect(submittedFields).toMatchObject({
      handle: `@${competitorHandle}`,
      sourceUrl: competitorUrl,
    });
    const accountResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/research/watchlist") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Add to watchlist" }).click();
    const createdAccountResponse = await accountResponse;
    expect(createdAccountResponse.request().postDataJSON()).toMatchObject({
      handle: `@${competitorHandle}`,
      sourceUrl: competitorUrl,
    });
    await expect(createdAccountResponse.status()).toBe(201);
    await expect(createdAccountResponse.json()).resolves.toMatchObject({
      account: { handle: competitorHandle, sourceUrl: competitorUrl },
    });
    await expect(page.getByText("Source reference only", { exact: true })).toBeVisible();

    const membership = page.getByRole("checkbox", { name: watchlistName });
    if (!(await membership.isChecked())) {
      const membershipResponse = page.waitForResponse(
        (response) =>
          response.url().includes("/api/research/watchlists/") &&
          response.url().endsWith("/members") &&
          response.request().method() === "POST",
      );
      await membership.check();
      await expect((await membershipResponse).ok()).toBeTruthy();
    }
    await expect(membership).toBeChecked();

    const deliveryWatchlistName = `Delivery app references ${Date.now()}`;
    await page.getByLabel("Watchlist name").fill(deliveryWatchlistName);
    await page.getByRole("button", { name: "Create watchlist" }).click();
    await expect(page.getByRole("heading", { name: deliveryWatchlistName })).toBeVisible({
      timeout: 30_000,
    });
    // The research page keeps a long-lived client request open while it
    // refreshes watchlist state. Commit is sufficient here because the
    // following visible assertion waits for the rendered page before the
    // interactive archive control is used.
    await page.reload({ waitUntil: "commit" });
    await expect(page.getByRole("heading", { name: deliveryWatchlistName })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Copy" }).first().click();
    const deliveryCard = page
      .getByRole("heading", { name: deliveryWatchlistName })
      .locator("xpath=../../..");
    const archiveResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/research/watchlists/") &&
        response.request().method() === "DELETE",
    );
    await deliveryCard.getByRole("button", { name: "Archive watchlist" }).click();
    expect((await archiveResponse).ok()).toBeTruthy();
    await expect(page.getByRole("heading", { name: "Archived watchlists" })).toBeVisible();
    const archivedDeliveryCard = page
      .getByRole("heading", { name: deliveryWatchlistName })
      .locator("xpath=../../..");
    await archivedDeliveryCard.getByRole("button", { name: "Restore watchlist" }).click();
    await expect(page.getByRole("heading", { name: deliveryWatchlistName })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Archived watchlists" })).toHaveCount(0);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    const violations = results.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    );
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test("renders the notes-only preview contract without writing a draft", async ({ page }) => {
    await bootstrapRoleSession(page, "workspace_manager", "research-teardown");
    await page.goto("/app/a/test-agency/w/research-teardown/research");

    const panel = page.getByTestId("research-page");
    await expect(panel).toBeVisible();
    await expect(page.getByRole("heading", { name: "Structured teardown" })).toBeVisible();
    await expect(page.getByLabel("Authorized transcript or planner notes")).toBeVisible();
    await page.getByRole("button", { name: "Generate preview" }).click();
    await expect(
      page.getByText("Add transcript or planner notes before generating a preview.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByTestId("research-teardown-result")).toHaveCount(0);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    const violations = results.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    );
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test("turns a saved teardown into an editable draft brief", async ({ page }) => {
    await bootstrapRoleSession(page, "workspace_manager", "research-teardown-draft");
    const response = await page.request.post("/api/research/teardown/save", {
      data: {
        workspaceSlug: "research-teardown-draft",
        teardown: {
          schemaVersion: 1,
          hook: "Open with the mistake the audience keeps making.",
          promise: "Show one practical fix in under a minute.",
          format: "short_form_video",
          beats: [{ label: "Proof", description: "Demonstrate the fix." }],
          pacing: "Fast opening, one proof beat, then a close.",
          callToAction: "Save this for the next edit.",
          evidence: [
            { field: "hook", observation: "The problem appears immediately.", source: "Notes" },
          ],
          uncertainty: [],
        },
      },
    });
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as { teardown: { id: string } };

    await page.goto(
      `/app/a/test-agency/w/research-teardown-draft/planning/new?researchTeardownId=${body.teardown.id}`,
    );
    await expect(page.getByTestId("quick-create-research-teardown")).toBeVisible();
    await expect(page.getByLabel("Short brief (optional)")).toHaveValue(
      /Hook: Open with the mistake/,
    );
    await expect(page.locator('input[name="researchTeardownId"]')).toHaveValue(body.teardown.id);
    await page.getByLabel("Title").fill("Research-led draft");
    await page.getByRole("button", { name: "Create draft", exact: true }).click();
    await expect(page).toHaveURL(/\/planning\/[^/]+\?created=1#overview$/, { timeout: 30_000 });
    if ((page.viewportSize()?.width ?? 1024) < 1024) {
      await page
        .getByRole("combobox", { name: "Planning workspace sections" })
        .selectOption({ label: "Create" });
    } else {
      await page.getByRole("button", { name: "Create", exact: true }).click();
    }
    await page.getByRole("tab", { name: "Creative brief" }).click();
    await expect(page.getByTestId("research-teardown-apply")).toBeVisible();
    await page.getByRole("button", { name: "Apply available fields", exact: true }).click();
    await expect(page.getByText("Available fields applied.", { exact: true })).toBeVisible();
  });
});
