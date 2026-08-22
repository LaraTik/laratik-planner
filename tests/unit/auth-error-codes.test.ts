import { describe, expect, it } from "vitest";
import { authError, AUTH_ERROR_DEFAULT } from "@/app/signin/auth-error-codes";

/**
 * Locked-in copy for the user-facing NextAuth error message map.
 *
 * Regression guard: changing a message is a UX change that warrants
 * a design review (per the Stitch parity contract). New @auth/core
 * error types should be added here deliberately, not silently.
 */

describe("authError", () => {
  it("returns the canonical Configuration message for the misleading 'Configuration' code", () => {
    // This is the most important one in the file: @auth/core 0.41.x
    // re-classifies non-AuthError throws from the Nodemailer provider
    // as `Configuration` and buries the real SMTP error. Until we
    // either patch @auth/core or upgrade past the misclassification
    // (tracked), the user will see this copy. The string MUST match
    // the one we cite in src/lib/auth/config.ts:91-95.
    expect(authError("Configuration")).toBe(
      "Sign-in is not configured correctly. Please contact support if this keeps happening.",
    );
  });

  it("maps the modern EmailSignInError to the magic-link failure message", () => {
    // @auth/core 0.41.x emits this PascalCase type for SMTP failures
    // when our custom sendVerificationEmail throws. The map should
    // already cover it even if the upstream catch block never
    // surfaces it on the URL today.
    expect(authError("EmailSignInError")).toBe(
      "We couldn't send the sign-in email. Please try again in a moment.",
    );
  });

  it("maps the legacy EmailSignin (camelCase) to the same magic-link message", () => {
    // We redirect to /signin?error=EmailSignin (camelCase) from the
    // magic-link rate-limit guard in src/app/signin/page.tsx:234.
    // The map must keep that legacy key working alongside the modern
    // EmailSignInError.
    expect(authError("EmailSignin")).toBe(authError("EmailSignInError"));
  });

  it("maps both OAuthSignin and OAuthSignInError to the same copy", () => {
    // Same reason: legacy camelCase key (still emitted by the
    // signin page error map for any older NextAuth surfaces) plus the
    // modern PascalCase name (@auth/core 0.41.x). Future removal of
    // either name should be a deliberate decision.
    expect(authError("OAuthSignin")).toBe(authError("OAuthSignInError"));
  });

  it("maps both OAuthCallback and OAuthCallbackError to the same copy", () => {
    expect(authError("OAuthCallback")).toBe(authError("OAuthCallbackError"));
  });

  it("maps both Callback and CallbackRouteError to the same copy", () => {
    expect(authError("Callback")).toBe(authError("CallbackRouteError"));
  });

  it("returns the Default message for unknown / null / undefined codes", () => {
    expect(authError("SomeRandomFutureCode")).toBe(authError(AUTH_ERROR_DEFAULT));
    expect(authError(null)).toBe(authError(AUTH_ERROR_DEFAULT));
    expect(authError(undefined)).toBe(authError(AUTH_ERROR_DEFAULT));
    expect(authError("")).toBe(authError(AUTH_ERROR_DEFAULT));
  });

  it("never leaks an internal error string for unmapped codes", () => {
    // Property test: a random uppercase token should never round-trip
    // into the user-facing copy. This catches accidental defaults like
    // `return code` slipping in.
    for (const code of ["FOO_BAR", "InternalError", "StackTraceAtXYZ", "ECONNREFUSED"]) {
      expect(authError(code)).not.toBe(code);
      expect(authError(code)).toBe(authError(AUTH_ERROR_DEFAULT));
    }
  });
});
