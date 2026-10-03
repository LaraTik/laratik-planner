import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { bootstrapRoleSession } from "./_helpers";

test.describe("research teardown preview", () => {
  test("creates a named watchlist and assigns a source account", async ({ page }) => {
    await bootstrapRoleSession(page, "workspace_manager", "research-watchlists");
    await page.goto("/app/w/research-watchlists/research");

    await expect(page.getByRole("heading", { name: "Account watchlists" })).toBeVisible();
    await page.getByLabel("Watchlist name").fill("Halal grocery competitors");
    await page.getByRole("button", { name: "Create watchlist" }).click();
    await expect(page.getByRole("heading", { name: "Halal grocery competitors" })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByLabel("Handle").fill("@competitor");
    await page.getByLabel("Profile URL").fill("https://instagram.com/competitor");
    await page.getByRole("button", { name: "Add to watchlist" }).click();
    await expect(page.getByText("Source reference only", { exact: true })).toBeVisible();

    const membership = page.getByRole("checkbox", { name: "Halal grocery competitors" });
    const membershipResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/research/watchlists/") &&
        response.url().endsWith("/members") &&
        response.request().method() === "POST",
    );
    await membership.check();
    await expect(membership).toBeChecked();
    await expect((await membershipResponse).ok()).toBeTruthy();

    await page.getByLabel("Watchlist name").fill("Delivery app references");
    await page.getByRole("button", { name: "Create watchlist" }).click();
    await expect(page.getByRole("heading", { name: "Delivery app references" })).toBeVisible({
      timeout: 30_000,
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Delivery app references" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Copy" }).first().click();
    const deliveryCard = page
      .getByRole("heading", { name: "Delivery app references" })
      .locator("xpath=../../..");
    await deliveryCard.getByRole("button", { name: "Archive watchlist" }).click();
    await expect(page.getByRole("heading", { name: "Delivery app references" })).toHaveCount(0);

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
    await page.goto("/app/w/research-teardown/research");

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
      `/app/w/research-teardown-draft/planning/new?researchTeardownId=${body.teardown.id}`,
    );
    await expect(page.getByTestId("quick-create-research-teardown")).toBeVisible();
    await expect(page.getByLabel("Short brief (optional)")).toHaveValue(
      /Hook: Open with the mistake/,
    );
    await expect(page.locator('input[name="researchTeardownId"]')).toHaveValue(body.teardown.id);
    await page.getByLabel("Title").fill("Research-led draft");
    await page.getByRole("button", { name: "Create draft", exact: true }).click();
    await expect(page).toHaveURL(/\/planning\/[^/]+\?created=1/, { timeout: 30_000 });
    if ((page.viewportSize()?.width ?? 1024) < 1024) {
      await page
        .getByRole("combobox", { name: "Planning workspace sections" })
        .selectOption({ label: "Brief" });
    } else {
      await page.getByRole("button", { name: "Brief", exact: true }).click();
    }
    await expect(page.getByTestId("research-teardown-apply")).toBeVisible();
    await page.getByRole("button", { name: "Apply available fields", exact: true }).click();
    await expect(page.getByText("Available fields applied.", { exact: true })).toBeVisible();
  });
});
