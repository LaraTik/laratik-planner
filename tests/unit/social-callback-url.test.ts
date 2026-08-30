import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Per-agency OAuth callback URL helper — the agency admin pastes
 * the returned string straight into their Meta / TikTok developer
 * console. A regression here means every agency gets a callback
 * URL that points at the wrong tenant, or — worse — at a path the
 * platform does not own.
 */

const clientEnvMock = vi.hoisted(() => ({ NEXT_PUBLIC_APP_URL: "https://planner.laratik.com" }));

vi.mock("@/lib/validation/env", () => ({
  clientEnv: clientEnvMock,
}));

async function loadHelper() {
  vi.resetModules();
  return import("@/lib/social/callback-url");
}

describe("buildPerAgencyCallbackUrl", () => {
  beforeEach(() => {
    clientEnvMock.NEXT_PUBLIC_APP_URL = "https://planner.laratik.com";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds the canonical Meta callback URL for the agency", async () => {
    const { buildPerAgencyCallbackUrl } = await loadHelper();
    expect(buildPerAgencyCallbackUrl("meta", "acme-agency")).toBe(
      "https://planner.laratik.com/api/social/meta/callback/acme-agency",
    );
  });

  it("builds the canonical TikTok callback URL for the agency", async () => {
    const { buildPerAgencyCallbackUrl } = await loadHelper();
    expect(buildPerAgencyCallbackUrl("tiktok", "another-agency")).toBe(
      "https://planner.laratik.com/api/social/tiktok/callback/another-agency",
    );
  });

  it("strips a trailing slash from NEXT_PUBLIC_APP_URL", async () => {
    clientEnvMock.NEXT_PUBLIC_APP_URL = "https://planner.laratik.com/";
    const { buildPerAgencyCallbackUrl } = await loadHelper();
    expect(buildPerAgencyCallbackUrl("meta", "acme")).toBe(
      "https://planner.laratik.com/api/social/meta/callback/acme",
    );
  });

  it("rejects slugs that do not match the workspace-safe pattern", async () => {
    const { buildPerAgencyCallbackUrl } = await loadHelper();
    // Defense-in-depth: the URL is reflected in the agency's Meta /
    // TikTok developer console, so the slug must be safe. The
    // helper throws so callers fail fast — a runtime URL that
    // contains anything outside [a-z0-9-] would let a misconfigured
    // path escape into a foreign route.
    expect(() => buildPerAgencyCallbackUrl("meta", "Acme_Agency")).toThrow();
    expect(() => buildPerAgencyCallbackUrl("meta", "../etc/passwd")).toThrow();
    expect(() => buildPerAgencyCallbackUrl("meta", "acme agency")).toThrow();
  });

  it("rejects empty slugs", async () => {
    const { buildPerAgencyCallbackUrl } = await loadHelper();
    expect(() => buildPerAgencyCallbackUrl("meta", "")).toThrow();
  });

  it("produces DIFFERENT URLs for different agencies (no shared global URL)", async () => {
    // The whole point of the per-agency refactor: agency A and
    // agency B must NOT share a single callback URL. The agency
    // slug appears in the path so the two URLs are unambiguously
    // distinct.
    const { buildPerAgencyCallbackUrl } = await loadHelper();
    const a = buildPerAgencyCallbackUrl("meta", "agency-a");
    const b = buildPerAgencyCallbackUrl("meta", "agency-b");
    expect(a).not.toBe(b);
    expect(a).toContain("/agency-a");
    expect(b).toContain("/agency-b");
  });
});

describe("buildLegacyCallbackUrl", () => {
  it("returns the legacy global URL (back-compat shim target)", async () => {
    const { buildLegacyCallbackUrl } = await loadHelper();
    expect(buildLegacyCallbackUrl("meta")).toBe(
      "https://planner.laratik.com/api/social/meta/callback",
    );
    expect(buildLegacyCallbackUrl("tiktok")).toBe(
      "https://planner.laratik.com/api/social/tiktok/callback",
    );
  });
});

describe("agencyCallbackUrl (UI helper)", () => {
  it("delegates to the per-agency builder", async () => {
    const { agencyCallbackUrl, buildPerAgencyCallbackUrl } = await loadHelper();
    expect(agencyCallbackUrl("meta", "acme")).toBe(buildPerAgencyCallbackUrl("meta", "acme"));
  });
});
