import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * M4.6 — /api/social/meta/connect route regression test.
 *
 * The route previously read the request body via `req.json()` only.
 * The client on `/app/w/[slug]/channels` submits a native HTML
 * `<form action="/api/social/meta/connect" method="POST">` with a
 * hidden `<input name="slug">`, which the browser sends as
 * `application/x-www-form-urlencoded`. `req.json()` fails silently
 * on form-encoded bodies (the `.catch(() => ({}))` returns `{}`),
 * so `body.slug` was always `undefined` and the route returned
 * `400 "Missing workspace slug"` on every click.
 *
 * This test pins the fix: the route must read the slug from the
 * correct body shape for BOTH callers (the current native form
 * AND a future fetch-based JSON caller), and must NOT return 400
 * "Missing workspace slug" when the slug is present in either
 * shape. The fix mirrors the content-type dispatch already used
 * by /api/bootstrap/admin.
 */

// ─── Mocks (set up before the dynamic import) ────────────────────────────

const authMock = vi.fn();
const resolveActiveAgencyContextMock = vi.fn();
const getAccessibleWorkspaceMock = vi.fn();
const hasWorkspaceRoleMock = vi.fn();
const getAgencyProviderConfigMock = vi.fn();
const createOauthStateMock = vi.fn();
const buildMetaAuthorizationUrlMock = vi.fn();

vi.mock("@/lib/auth/config", () => ({
  auth: authMock,
}));
vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: resolveActiveAgencyContextMock,
}));
vi.mock("@/lib/workspaces/context", () => ({
  getAccessibleWorkspace: getAccessibleWorkspaceMock,
}));
vi.mock("@/lib/auth/policy", () => ({
  hasWorkspaceRole: hasWorkspaceRoleMock,
}));
vi.mock("@/lib/social/provider-config", () => ({
  getAgencyProviderConfig: getAgencyProviderConfigMock,
}));
vi.mock("@/lib/social/repository", () => ({
  createOauthState: createOauthStateMock,
}));
vi.mock("@/lib/social/providers/meta", () => ({
  buildMetaAuthorizationUrl: buildMetaAuthorizationUrlMock,
}));

beforeEach(() => {
  authMock.mockReset();
  resolveActiveAgencyContextMock.mockReset();
  getAccessibleWorkspaceMock.mockReset();
  hasWorkspaceRoleMock.mockReset();
  getAgencyProviderConfigMock.mockReset();
  createOauthStateMock.mockReset();
  buildMetaAuthorizationUrlMock.mockReset();
  // Defaults for a happy-path request; individual tests override.
  authMock.mockResolvedValue({ user: { id: "user-1" } });
  resolveActiveAgencyContextMock.mockResolvedValue({ agencyId: "agency-1" });
  getAccessibleWorkspaceMock.mockResolvedValue({
    id: "ws-1",
    slug: "acme",
    agencyId: "agency-1",
  });
  hasWorkspaceRoleMock.mockResolvedValue(true);
  getAgencyProviderConfigMock.mockResolvedValue({
    provider: "meta",
    appId: "app-1",
    appSecret: "secret",
    loginConfigId: "config-1",
    graphApiVersion: "v25.0",
    enabled: true,
  });
  createOauthStateMock.mockResolvedValue(undefined);
  buildMetaAuthorizationUrlMock.mockReturnValue(
    "https://www.facebook.com/v25.0/dialog/oauth?config_id=config-1&state=stub",
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function loadRoute() {
  vi.resetModules();
  return import("@/app/api/social/meta/connect/route");
}

function makeFormRequest(slug: string): NextRequest {
  // Mimic the browser's native form submit:
  //   <form action="/api/social/meta/connect" method="POST">
  //     <input type="hidden" name="slug" value={slug} />
  //   </form>
  // The browser sends `application/x-www-form-urlencoded` with
  // `slug=<value>` in the body. Pre-2026-08-28, the route only read
  // `req.json()` and the slug was never parsed.
  return new NextRequest("http://localhost:3000/api/social/meta/connect", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `slug=${encodeURIComponent(slug)}`,
  });
}

function makeJsonRequest(slug: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/social/meta/connect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug }),
  });
}

describe("POST /api/social/meta/connect — body parsing", () => {
  it("reads slug from a form-encoded body (the native form-submit case)", async () => {
    // Regression for the 2026-08-28 bug: the route used to read only
    // `req.json()` and returned 400 "Missing workspace slug" every
    // time the workspace manager clicked the Connect Meta button.
    const { POST } = await loadRoute();
    const res = await POST(makeFormRequest("acme"));
    // 200 with a redirectUrl means the slug was parsed AND the
    // downstream checks (auth, agency context, workspace, role,
    // provider config, state create, URL build) all passed. The
    // pre-fix code returned 400 "Missing workspace slug" here.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("redirectUrl");
    expect(body.redirectUrl).toContain("facebook.com");
    // The route MUST have called buildMetaAuthorizationUrl with the
    // correct slug-derived state; we don't assert the state value
    // (it's random 32 bytes) but we assert the build was invoked
    // and the OAuth state was persisted with the right workspace.
    expect(createOauthStateMock).toHaveBeenCalledTimes(1);
    const call = createOauthStateMock.mock.calls[0]![1];
    expect(call.provider).toBe("meta");
    expect(call.workspaceId).toBe("ws-1");
    expect(call.returnPath).toBe("/app/w/acme/channels");
  });

  it("reads slug from a JSON body (future fetch-based callers)", async () => {
    // The content-type dispatch must also handle JSON, so a future
    // client that POSTs JSON to the route still works.
    const { POST } = await loadRoute();
    const res = await POST(makeJsonRequest("acme"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("redirectUrl");
  });

  it("returns 400 'Missing workspace slug' when the body is empty", async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeFormRequest(""));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing workspace slug");
  });

  it("returns 400 'Missing workspace slug' when the body has no slug field", async () => {
    const req = new NextRequest("http://localhost:3000/api/social/meta/connect", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "other=value",
    });
    const { POST } = await loadRoute();
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Missing workspace slug");
  });

  it("returns 401 when the actor is not signed in (auth runs before body parse)", async () => {
    authMock.mockResolvedValueOnce(null);
    const { POST } = await loadRoute();
    const res = await POST(makeFormRequest("acme"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when the workspace is not accessible for the actor's agency", async () => {
    getAccessibleWorkspaceMock.mockResolvedValueOnce(null);
    const { POST } = await loadRoute();
    const res = await POST(makeFormRequest("missing"));
    expect(res.status).toBe(404);
  });

  it("returns 403 when the actor is not a workspace_manager for that workspace", async () => {
    hasWorkspaceRoleMock.mockResolvedValueOnce(false);
    const { POST } = await loadRoute();
    const res = await POST(makeFormRequest("acme"));
    expect(res.status).toBe(403);
  });

  it("returns 409 with setupUrl when the agency has no Meta provider config", async () => {
    getAgencyProviderConfigMock.mockResolvedValueOnce({
      ok: false,
      errorCode: "not_configured",
    });
    const { POST } = await loadRoute();
    const res = await POST(makeFormRequest("acme"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.errorCode).toBe("not_configured");
    expect(body.setupUrl).toBe("/app/agency-settings/social/providers");
  });
});
