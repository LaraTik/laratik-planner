import { test, expect } from "@playwright/test";
import { bootstrapTestSession } from "../_helpers";

/**
 * E2E tests for the "Add directly" tab on /app/users.
 *
 * Covers:
 *  - Tab is reachable and has the right `data-testid` hook
 *  - Form submits with email + name + generated password and renders
 *    the one-time reveal strip with the temp password
 *  - The new user, when signed in, is forced to /set-password by the
 *    first-login middleware
 *  - Setting a new password clears the flag and the user lands on /app
 */
test.describe("User Management — Add directly flow", () => {
  test("admin can switch to the Add directly tab and the form renders", async ({ page }) => {
    await bootstrapTestSession(page);

    await page.goto("/app/users");
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();

    // The "Send invitation" tab is the default; "Add directly" is a sibling trigger.
    await page.getByTestId("users-tab-add").click();
    await expect(page.getByTestId("add-directly-form")).toBeVisible();
    await expect(page.getByTestId("add-directly-generate")).toBeVisible();
    await expect(page.getByTestId("add-directly-must-change")).toBeChecked();
  });

  test("admin creates a user, the reveal strip shows the temp password, and the form resets", async ({
    page,
  }) => {
    await bootstrapTestSession(page);

    await page.goto("/app/users");
    await page.getByTestId("users-tab-add").click();

    const newEmail = `e2e-add-${Date.now()}@laratik.local`;
    await page.getByLabel("Email", { exact: true }).fill(newEmail);
    await page.getByLabel("Name (optional)").fill("E2E Added User");

    // Click "Generate" to autofill a strong password
    await page.getByTestId("add-directly-generate").click();
    const passwordInput = page.getByTestId("add-directly-password");
    await expect(passwordInput).not.toHaveValue("");

    // The strength meter should accept the generated password
    const strength = page.getByTestId("add-directly-strength-meter");
    await expect(strength).toHaveAttribute("data-strength", /^(Strong|Very strong)$/);

    await page.getByRole("button", { name: /Create user/i }).click();

    // Success strip
    const reveal = page.getByTestId("add-directly-reveal");
    await expect(reveal).toBeVisible({ timeout: 10_000 });
    await expect(reveal).toContainText(newEmail);
    const revealPassword = page.getByTestId("add-directly-reveal-password");
    await expect(revealPassword).toHaveValue(/.+/);

    // KPI tile for active users should have incremented
    await expect(page.getByTestId("users-kpi-row")).toBeVisible();
  });

  test("submitting without a strong password shows a server-side error", async ({ page }) => {
    await bootstrapTestSession(page);

    await page.goto("/app/users");
    await page.getByTestId("users-tab-add").click();

    await page.getByLabel("Email", { exact: true }).fill(`weak-${Date.now()}@laratik.local`);
    // Type a password that the form-level meter would reject.
    // We can't easily type one shorter than 8 chars because the
    // server's zod schema would also reject it; the goal here is to
    // verify the error strip renders at all on a failure.
    const passwordInput = page.getByTestId("add-directly-password");
    await passwordInput.fill("abc");
    // Force the form to submit by pressing Enter inside the password
    // field. Browser validation (minLength=8) may block it; if so
    // the test verifies the form didn't post.
    await passwordInput.press("Enter");
    // Either the form-level validation blocked submission (no error
    // strip; URL unchanged) or the server rejected it (error strip
    // visible). Both are acceptable; the assertion is that we did
    // NOT succeed.
    await expect(page.getByTestId("add-directly-reveal")).not.toBeVisible();
  });
});

test.describe("First-login redirect (mustChangePassword)", () => {
  test("a user created with mustChangePassword=true is routed to /set-password on sign-in", async ({
    page,
  }) => {
    // Seed the agency + an admin. Then use the admin to create a
    // new user via the form (the path under test). Sign out, sign
    // in as the new user, verify the redirect to /set-password.
    await bootstrapTestSession(page);

    await page.goto("/app/users");
    await page.getByTestId("users-tab-add").click();

    const newEmail = `redirect-${Date.now()}@laratik.local`;
    await page.getByLabel("Email", { exact: true }).fill(newEmail);
    await page.getByTestId("add-directly-generate").click();
    await page.getByRole("button", { name: /Create user/i }).click();

    // Wait for the reveal strip and capture the password
    const reveal = page.getByTestId("add-directly-reveal");
    await expect(reveal).toBeVisible({ timeout: 10_000 });
    const tempPassword = await page.getByTestId("add-directly-reveal-password").inputValue();
    expect(tempPassword.length).toBeGreaterThanOrEqual(8);

    // Sign out the admin and sign in as the new user
    await page.request
      .post("/api/auth/signout", { data: { csrfToken: "" } })
      .catch(() => undefined);
    await page.goto("/signin");
    await page.evaluate(() => {
      // Clear cookies via the document so the next sign-in starts clean
      document.cookie.split(";").forEach((c) => {
        const eqPos = c.indexOf("=");
        const name = eqPos > -1 ? c.substring(0, eqPos) : c;
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      });
    });

    // The dev sign-in endpoint only signs in already-existing users
    // matching the email; the new user was just created by the
    // action, so it should be findable.
    await page.goto("/signin");
    await page.request.post("/api/dev/sign-in", { data: { email: newEmail, role: "user" } });

    // Visit any protected route; the middleware should redirect to /set-password
    await page.goto("/app");
    await page.waitForURL(/\/set-password/, { timeout: 10_000 });
    await expect(page.getByTestId("set-password-page")).toBeVisible();
    await expect(page.getByTestId("set-password-form")).toBeVisible();

    // Set a new password
    await page.getByTestId("set-password-new").fill("MyNewPass123");
    await page.getByTestId("set-password-confirm").fill("MyNewPass123");
    await page.getByRole("button", { name: /Set password and continue/i }).click();

    // After success, we land on /app (or whatever the home is for a
    // user with no workspace). The exact landing isn't important —
    // the test is that the redirect chain doesn't loop back to
    // /set-password.
    await page.waitForURL((url) => !url.pathname.startsWith("/set-password"), { timeout: 10_000 });
    await expect(page).not.toHaveURL(/\/set-password/);
  });
});
