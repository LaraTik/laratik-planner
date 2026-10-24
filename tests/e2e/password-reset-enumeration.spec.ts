import { expect, test } from "@playwright/test";
import { devSeed } from "./_helpers";

test.use({ storageState: { cookies: [], origins: [] } });

test("forgot password shows the same result for an existing and unknown address", async ({
  page,
  request,
}) => {
  const existingEmail = `password-reset-${Date.now()}@example.com`;
  const unknownEmail = `unknown-${Date.now()}@example.com`;
  await devSeed(request, { email: existingEmail });

  const responses: string[] = [];
  for (const email of [existingEmail, unknownEmail]) {
    await page.goto("/signin/forgot-password");
    await page.getByLabel(/email/i).fill(email);
    await page.locator("form").getByRole("button", { name: /.+/ }).click();
    await expect(page).toHaveURL(/\/signin\/forgot-password\?sent=1/);
    const confirmation = page.getByTestId("forgot-password-sent");
    await expect(confirmation).toBeVisible();
    responses.push((await confirmation.innerText()).trim());
  }

  expect(responses[0]).toBe(responses[1]);
});
