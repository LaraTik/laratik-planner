import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * OTHER-04 coverage: the Sentry / structured-log dependency for
 * the signin form action has moved into a dedicated `server-only`
 * helper. The page module no longer imports `@sentry/nextjs` and
 * the helper fans the error out via `captureError` (Sentry + log).
 *
 * These tests:
 *  - assert `signInErrorRedirect` mints a ref and calls the
 *    redirect machinery with the expected query params.
 *  - assert `captureError` is invoked with the Sentry tag shape
 *    the on-call operator searches for.
 *  - assert `emailDomain` returns a stable, lowercased value.
 *  - assert the page module does NOT statically import
 *    `@sentry/nextjs` (the OTHER-04 invariant).
 */

const redirectMock = vi.fn(() => {
  // The real `redirect()` throws a NEXT_REDIRECT signal so the
  // function has a `never` return type. The mock matches that
  // contract so the SUT doesn't fall through.
  throw new Error("NEXT_REDIRECT");
});
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

const captureErrorMock = vi.fn();
vi.mock("@/lib/observability/sentry", () => ({
  captureError: (...args: unknown[]) => captureErrorMock(...args),
}));

const { signInErrorRedirect, emailDomain } = await import("@/app/signin/auth-error-server");

describe("signInErrorRedirect", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    captureErrorMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mints a ref, captures the cause, and redirects with the expected query", () => {
    const cause = new Error("upstream failed");
    // `signInErrorRedirect` has return type `never` because it
    // calls `redirect()` (which throws a NEXT_REDIRECT signal).
    // We capture the throw and assert the side-effects.
    expect(() =>
      signInErrorRedirect({
        code: "Unknown",
        callbackUrl: "/app",
        cause,
        context: { provider: "credentials", emailDomain: "agency.com" },
      }),
    ).toThrow();
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    const [scope, capturedCause, capturedCtx] = captureErrorMock.mock.calls[0]!;
    expect(scope).toBe("auth.signin");
    expect(capturedCause).toBe(cause);
    const ctx = capturedCtx as Record<string, unknown>;
    expect(ctx["auth.signin.code"]).toBe("Unknown");
    expect(ctx["auth.signin.ref"]).toMatch(/^[0-9a-f]{12}$/);
    expect(ctx.provider).toBe("credentials");
    expect(ctx.emailDomain).toBe("agency.com");

    expect(redirectMock).toHaveBeenCalledTimes(1);
    const [url] = redirectMock.mock.calls[0]! as [string];
    expect(url).toContain("error=Unknown");
    expect(url).toContain("callbackUrl=%2Fapp");
    expect(url).toMatch(/ref=[0-9a-f]{12}/);
  });

  it("still redirects (no capture) when no cause is supplied", () => {
    expect(() =>
      signInErrorRedirect({
        code: "InvalidEmail",
        callbackUrl: "/app",
      }),
    ).toThrow();
    expect(captureErrorMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });
});

describe("emailDomain", () => {
  it("returns the lowercased domain portion of an email", () => {
    expect(emailDomain("Alice@Agency.COM")).toBe("agency.com");
  });

  it("returns (none) when there is no @", () => {
    expect(emailDomain("not-an-email")).toBe("(none)");
  });
});

describe("signin page (OTHER-04 invariant)", () => {
  it("does not statically import @sentry/nextjs", async () => {
    // Read the page source and assert it has no top-level
    // `@sentry/nextjs` import. A future refactor that re-adds
    // the SDK to the page module would surface here.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const pagePath = path.resolve(__dirname, "../../src/app/signin/page.tsx");
    const source = await fs.readFile(pagePath, "utf8");
    expect(source).not.toMatch(/from\s+["']@sentry\/nextjs["']/);
    expect(source).not.toMatch(/import\s*\*\s*as\s+Sentry\s+from/);
  });
});
