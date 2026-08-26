import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * /api/sentry-probe — install-time ingest verification route.
 *
 * The install script (scripts/vps/install-sentry.sh) POSTs to this
 * route after writing the Sentry env. The test matrix covers:
 *   - 503 when SENTRY_PROBE_TOKEN is missing (defense in depth so
 *     a misconfigured env never opens the probe publicly)
 *   - 401 when the x-sentry-probe header is missing or wrong
 *   - 200 { configured: false, sent: false } when SENTRY_DSN is
 *     unset — the call is a no-op but the operator gets an
 *     unambiguous "Sentry is not configured yet" answer
 *   - 200 { configured: true, sent: true } when SENTRY_DSN is set
 *     — captureMessage is called and the install is confirmed
 *
 * The Sentry wrapper is mocked because the SDK initialises on
 * import and we want the test to be hermetic (no real DSN).
 */

const captureMessageMock = vi.fn();
const isEnabledMock = vi.fn();

vi.mock("@/lib/observability/sentry", () => ({
  captureMessage: captureMessageMock,
  isEnabled: isEnabledMock,
}));

// Import AFTER mocks so the route module closes over the mocked Sentry
// surface. (Dynamic import path keeps the mock alive across the module
// load.)
async function loadRoute() {
  // Reset the module cache so each test sees fresh env-derived behaviour.
  vi.resetModules();
  const mod = await import("@/app/api/sentry-probe/route");
  return mod;
}

const originalEnv = { ...process.env };

function makeRequest(token: string | null): NextRequest {
  const headers: Record<string, string> = {};
  if (token !== null) headers["x-sentry-probe"] = token;
  return new NextRequest("http://localhost:3000/api/sentry-probe", {
    method: "POST",
    headers,
  });
}

beforeEach(() => {
  captureMessageMock.mockReset();
  isEnabledMock.mockReset();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("POST /api/sentry-probe", () => {
  it("returns 503 when SENTRY_PROBE_TOKEN is not configured", async () => {
    delete process.env["SENTRY_PROBE_TOKEN"];
    const { POST } = await loadRoute();
    const res = await POST(makeRequest(null));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/SENTRY_PROBE_TOKEN/);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the x-sentry-probe header is missing", async () => {
    process.env["SENTRY_PROBE_TOKEN"] = "secret-1";
    const { POST } = await loadRoute();
    const res = await POST(makeRequest(null));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Invalid probe token/);
  });

  it("returns 401 when the header is wrong (and uses constant-time compare)", async () => {
    process.env["SENTRY_PROBE_TOKEN"] = "secret-1";
    const { POST } = await loadRoute();
    const res = await POST(makeRequest("secret-2"));
    expect(res.status).toBe(401);
  });

  it("returns configured: false when Sentry is not configured (no capture)", async () => {
    process.env["SENTRY_PROBE_TOKEN"] = "secret-1";
    isEnabledMock.mockReturnValue(false);
    const { POST } = await loadRoute();
    const res = await POST(makeRequest("secret-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { configured: boolean; sent: boolean };
    expect(body).toEqual({ configured: false, sent: false });
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it("returns configured: true and calls captureMessage when Sentry is configured", async () => {
    process.env["SENTRY_PROBE_TOKEN"] = "secret-1";
    isEnabledMock.mockReturnValue(true);
    const { POST } = await loadRoute();
    const res = await POST(makeRequest("secret-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { configured: boolean; sent: boolean };
    expect(body).toEqual({ configured: true, sent: true });
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    expect(captureMessageMock).toHaveBeenCalledWith("install-probe", "info");
  });
});
