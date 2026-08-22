import type { APIRequestContext, Page } from "@playwright/test";

/**
 * Shared E2E test helpers.
 *
 * The dev/test API endpoints (/api/dev/sign-in, /api/dev/seed) let us
 * skip Google OAuth + Mailcow + Bootstrap-token flows during testing.
 * In production they return 404 — the production sign-in flow is
 * unchanged.
 */

const DEFAULT_EMAIL = "test@laratik.local";
const DEFAULT_NAME = "Test User";

/**
 * Capture-mode timeout for the dev endpoints. The CI visual-capture
 * step runs under a 25-min budget; a hung dev-sign-in or dev-seed
 * request should fail fast so the rest of the suite can still
 * capture what it can. The compare step keeps the default Playwright
 * 30s timeout (set by the framework + playwright.config.ts) so a
 * slow-but-correctly-rendered route does not falsely fail.
 */
const CAPTURE_MODE_HTTP_TIMEOUT_MS = 10_000;
const isCaptureMode = process.env.PW_VISUAL_CAPTURE === "1";

/**
 * Sign the test user in by hitting the dev sign-in endpoint. Sets the
 * `authjs.session-token` cookie on the Playwright context. The response
 * also sets the cookie on the response, so we just need to perform the
 * request via the page's request context.
 */
export async function devSignIn(
  request: APIRequestContext,
  options: { email?: string; name?: string; role?: "agency_admin" | "user" } = {},
): Promise<{ userId: string; email: string; role: string }> {
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
 */
export async function devSeed(
  request: APIRequestContext,
  options: {
    email?: string;
    workspaceSlug?: string;
    agencyAdmin?: boolean;
    workspaceRoles?: Exclude<FixtureRole, "agency_admin">[];
  } = {},
): Promise<SeedResult> {
  const res = await request.post("/api/dev/seed", {
    data: {
      email: options.email ?? DEFAULT_EMAIL,
      workspaceSlug: options.workspaceSlug ?? "acme",
      ...(options.agencyAdmin !== undefined ? { agencyAdmin: options.agencyAdmin } : {}),
      ...(options.workspaceRoles ? { workspaceRoles: options.workspaceRoles } : {}),
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
}

/**
 * End-to-end "give me an authenticated browser session ready to use the
 * app shell". Combines seed + sign-in. Returns the seeded IDs.
 */
export async function bootstrapTestSession(
  page: Page,
  options: { email?: string; workspaceSlug?: string } = {},
): Promise<SeedResult> {
  const result = await devSeed(page.request, options);
  await devSignIn(page.request, options.email ? { email: options.email } : {});
  return result;
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
