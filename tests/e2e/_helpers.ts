import type { APIRequestContext, Page } from "@playwright/test";
import type { PlatformRole } from "../../src/lib/auth/platform-access-types";

/**
 * Shared E2E test helpers.
 *
 * The dev/test API endpoints (/api/dev/sign-in, /api/dev/seed) let us
 * skip Google OAuth + Mailcow + Bootstrap-token flows during testing.
 * In production they return 404 — the production sign-in flow is
 * unchanged.
 */

// Mirror the cookie name used by `src/lib/auth/dev-sign-in.ts`
// (the source of truth). We don't import the module because it
// pulls in `server-only` and the Drizzle pool, neither of which
// the e2e helper needs. If the source cookie name ever changes,
// the dev-sign-in contract test (e2e/auth-gate) will surface it
// before this constant drifts.
const DEV_SESSION_COOKIE_NAME = "authjs.session-token";

const DEFAULT_EMAIL = "test@laratik.local";
const DEFAULT_NAME = "Test User";

/**
 * Capture-mode timeout for the dev endpoints. The CI visual-capture
 * step runs under a 25-min budget; a hung dev-sign-in or dev-seed
 * request should fail fast so the rest of the suite can still
 * capture what it can. The compare step keeps the default Playwright
 * 30s timeout (set by the framework + playwright.config.ts) so a
 * slow-but-correctly-rendered route does not falsely fail.
 *
 * The capture step also retries the dev endpoints (see `withRetry`
 * below) to survive a transient 500 from the Next.js 16.3.1 dev
 * server's route-manifest race. The per-attempt timeout above means
 * each attempt fails fast; the retry budget is wall-clock on top of
 * the per-test budget set by `tests/e2e/visual-regression.spec.ts`.
 */
const CAPTURE_MODE_HTTP_TIMEOUT_MS = 10_000;
const isCaptureMode = process.env.PW_VISUAL_CAPTURE === "1";
const CAPTURE_MODE_RETRY_ATTEMPTS = 3;
const CAPTURE_MODE_RETRY_DELAY_MS = 1_500;

/**
 * Run `fn` up to `attempts` times, retrying only when the error
 * message contains "500" (the shape of transient dev-endpoint
 * failures from the Next.js 16.3.1 manifest race — see run
 * 32569436774). Capture mode (PW_VISUAL_CAPTURE=1) enables the
 * retry so the visual-baseline step survives one bad manifest
 * write. Compare mode calls `fn` once and propagates the first
 * error so a genuine 500 fails loud and surfaces the bug.
 *
 * Non-500 errors (4xx, network failures, etc.) are rethrown
 * immediately. We do not silently swallow real production bugs.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  attempts: number = CAPTURE_MODE_RETRY_ATTEMPTS,
  delayMs: number = CAPTURE_MODE_RETRY_DELAY_MS,
): Promise<T> {
  if (!isCaptureMode) {
    return fn();
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("500")) {
        throw err;
      }
      if (attempt < attempts) {
        console.log(`[helpers] ${label} retry ${attempt}/${attempts - 1} after 500`);
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

/**
 * Sign the test user in by hitting the dev sign-in endpoint. Sets the
 * `authjs.session-token` cookie on the Playwright context. The response
 * also sets the cookie on the response, so we just need to perform the
 * request via the page's request context.
 *
 * In capture mode the call is retried on a 500 (see `withRetry`).
 */
export async function devSignIn(
  request: APIRequestContext,
  options: { email?: string; name?: string; role?: "agency_admin" | "user" } = {},
): Promise<{ userId: string; email: string; role: string }> {
  return withRetry(async () => {
    const res = await request.post("/api/dev/sign-in", {
      data: {
        email: options.email ?? DEFAULT_EMAIL,
        name: options.name ?? DEFAULT_NAME,
        role: options.role ?? "agency_admin",
      },
      // Lower the request timeout in capture mode so a hung sign-in
      // does not eat the entire per-test budget. The compare step
      // passes no timeout, falling back to the framework default.
      ...(isCaptureMode ? { timeout: CAPTURE_MODE_HTTP_TIMEOUT_MS } : {}),
    });
    if (!res.ok()) {
      const text = await res.text();
      throw new Error(`devSignIn failed: ${res.status()} ${text}`);
    }
    return (await res.json()) as { userId: string; email: string; role: string };
  }, "devSignIn");
}

export type SeedResult = {
  userId: string;
  agencyId: string;
  workspaceId: string;
  workspaceSlug: string;
  channelIds: string[];
  /**
   * ID of the canonical "Autumn Blend Reveal" content item seeded
   * for the workspace. The visual-regression spec (Task 7) and the
   * planning-detail captures resolve `{contentItemId}` from this
   * field. Tests that need a planning-detail URL can do
   * `/app/w/${seeded.workspaceSlug}/planning/${seeded.contentItemId}`.
   */
  contentItemId: string;
};

/**
 * Seed the test fixtures. Idempotent — repeated calls return the same
 * IDs.
 *
 * In capture mode the call is retried on a 500 (see `withRetry`).
 */
export async function devSeed(
  request: APIRequestContext,
  options: {
    email?: string;
    name?: string;
    agencyName?: string;
    agencySlug?: string;
    workspaceName?: string;
    workspaceSlug?: string;
    locale?: "en" | "ar";
    agencyAdmin?: boolean;
    workspaceRoles?: Exclude<FixtureRole, "agency_admin">[];
    /**
     * M1.8 — when true, the seeded user receives a live
     * `platform_administrator` row (revoked_at null). When false
     * (default), any prior grant is revoked. The platform-overview
     * e2e exercises both branches.
     */
    platformAdmin?: boolean;
    /** Explicit platform role. Takes precedence over the legacy platformAdmin alias. */
    platformRole?: PlatformRole;
  } = {},
): Promise<SeedResult> {
  return withRetry(async () => {
    const res = await request.post("/api/dev/seed", {
      data: {
        email: options.email ?? DEFAULT_EMAIL,
        ...(options.name ? { name: options.name } : {}),
        ...(options.agencyName ? { agencyName: options.agencyName } : {}),
        ...(options.agencySlug ? { agencySlug: options.agencySlug } : {}),
        ...(options.workspaceName ? { workspaceName: options.workspaceName } : {}),
        workspaceSlug: options.workspaceSlug ?? "acme",
        ...(options.locale ? { locale: options.locale } : {}),
        ...(options.agencyAdmin !== undefined ? { agencyAdmin: options.agencyAdmin } : {}),
        ...(options.workspaceRoles ? { workspaceRoles: options.workspaceRoles } : {}),
        ...(options.platformAdmin !== undefined ? { platformAdmin: options.platformAdmin } : {}),
        ...(options.platformRole ? { platformRole: options.platformRole } : {}),
      },
      // Lower the request timeout in capture mode so a hung seed
      // does not eat the entire per-test budget. The compare step
      // passes no timeout, falling back to the framework default.
      ...(isCaptureMode ? { timeout: CAPTURE_MODE_HTTP_TIMEOUT_MS } : {}),
    });
    if (!res.ok()) {
      const text = await res.text();
      throw new Error(`devSeed failed: ${res.status()} ${text}`);
    }
    return (await res.json()) as SeedResult;
  }, "devSeed");
}

/**
 * End-to-end "give me an authenticated browser session ready to use the
 * app shell". Combines seed + sign-in. Returns the seeded IDs.
 */
export async function bootstrapTestSession(
  page: Page,
  options: {
    email?: string;
    name?: string;
    agencyName?: string;
    agencySlug?: string;
    workspaceName?: string;
    workspaceSlug?: string;
    locale?: "en" | "ar";
  } = {},
): Promise<SeedResult> {
  const result = await devSeed(page.request, options);
  await devSignIn(page.request, options.email ? { email: options.email } : {});
  return result;
}

/**
 * TEST-18 (GAP-FULL-REVIEW-2026-08-25) — pre-seeded session cookie
 * helper.
 *
 * The pre-existing `devSignIn` and `bootstrapTestSession` helpers
 * hit the dev sign-in endpoint on every test. If that endpoint
 * flakes (the documented history is a 500 from the Next.js 16.3.1
 * manifest race; see `_helpers.ts:withRetry`), every e2e spec
 * fails.
 *
 * `setAuthCookie` decouples the cookie setting from the endpoint
 * for tests that don't need a freshly-minted session. The helper:
 *   1. calls `devSignIn` once to mint a JWT (this is the only
 *      network call to the dev endpoint),
 *   2. extracts the `authjs.session-token` cookie from the
 *      request context's storage state, and
 *   3. applies that cookie to the `page`'s browser context so
 *      subsequent `page.goto()` calls authenticate.
 *
 * Once the cookie is on the page context, no further dev-endpoint
 * calls are needed for the lifetime of the test. A `beforeAll` that
 * calls `setAuthCookie` for a shared `email` lets every test in a
 * file skip the per-test `devSignIn` call.
 */
export async function setAuthCookie(
  page: Page,
  request: APIRequestContext,
  options: { email?: string; name?: string; role?: "agency_admin" | "user" } = {},
): Promise<{
  userId: string;
  email: string;
  role: string;
  cookie: { name: string; value: string };
}> {
  // Step 1 — sign in via the dev endpoint. The endpoint sets
  // `authjs.session-token` on the response, which Playwright
  // automatically stores on the request context.
  const user = await devSignIn(request, options);

  // Step 2 — read the cookie value out of the request context.
  const storage = await request.storageState();
  const sessionCookie = storage.cookies.find((c) => c.name === DEV_SESSION_COOKIE_NAME);
  if (!sessionCookie) {
    throw new Error(`setAuthCookie: dev endpoint did not set a ${DEV_SESSION_COOKIE_NAME} cookie`);
  }

  // Step 3 — apply the cookie to the page's browser context. The
  // `page` and `request` may live on different contexts in some
  // Playwright configurations, so we apply the cookie explicitly
  // rather than relying on the request-context propagation that
  // `bootstrapTestSession` leans on.
  await page.context().addCookies([
    {
      name: sessionCookie.name,
      value: sessionCookie.value,
      // The dev endpoint is reached on localhost; mirror the
      // same domain so the cookie is actually accepted by the
      // browser context.
      domain: sessionCookie.domain || "localhost",
      path: sessionCookie.path || "/",
      httpOnly: sessionCookie.httpOnly,
      secure: sessionCookie.secure,
      sameSite: sessionCookie.sameSite || "Lax",
      expires: sessionCookie.expires && sessionCookie.expires > 0 ? sessionCookie.expires : -1,
    },
  ]);

  return {
    userId: user.userId,
    email: user.email,
    role: user.role,
    cookie: { name: sessionCookie.name, value: sessionCookie.value },
  };
}

export type FixtureRole =
  | "agency_admin"
  | "workspace_manager"
  | "content_planner"
  | "designer"
  | "internal_reviewer"
  | "client_reviewer"
  | "publisher"
  | "viewer";

export async function bootstrapRoleSession(
  page: Page,
  role: FixtureRole,
  workspaceSlug = "acme",
): Promise<SeedResult> {
  const email = `e2e-${role}@laratik.local`;
  const result = await devSeed(page.request, {
    email,
    workspaceSlug,
    agencyAdmin: role === "agency_admin",
    workspaceRoles: role === "agency_admin" ? [] : [role],
  });
  await devSignIn(page.request, { email, role: role === "agency_admin" ? "agency_admin" : "user" });
  return result;
}
