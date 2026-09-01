import { describe, expect, it } from "vitest";

import { authError, AUTH_ERROR_DEFAULT } from "@/app/signin/auth-error-codes";
import { tFor } from "@/messages";

/**
 * `authError` maps a NextAuth error code to a localized message.
 * The translator is injected so this test is pure of any
 * cookie / session / DB access.
 *
 * The contract:
 *   - known code → the catalog's translated message
 *   - unknown / null / empty code → the `Default` catalog entry
 *   - the function is the **only** place that decides which
 *     catalog key to look up — it is not the caller's job to
 *     construct the path
 */
describe("i18n/auth-error-codes", () => {
  it("returns the translated message for a known code", () => {
    const t = tFor("en");
    expect(authError(t, "RateLimited")).toBe(
      "Too many sign-in attempts. Please wait a few minutes and try again.",
    );
    const tAr = tFor("ar");
    expect(authError(tAr, "RateLimited")).toBe(
      "محاولات تسجيل دخول كثيرة جدًا. يُرجى الانتظار بضع دقائق ثم المحاولة مرة أخرى.",
    );
  });

  it("falls back to Default for unknown / null / empty codes", () => {
    const t = tFor("en");
    expect(authError(t, null)).toBe("Sign-in failed. Please try again.");
    expect(authError(t, undefined)).toBe("Sign-in failed. Please try again.");
    expect(authError(t, "")).toBe("Sign-in failed. Please try again.");
    expect(authError(t, "SomeCodeThatDoesNotExist")).toBe("Sign-in failed. Please try again.");
  });

  it("the Default constant is the literal string 'Default'", () => {
    expect(AUTH_ERROR_DEFAULT).toBe("Default");
  });
});
