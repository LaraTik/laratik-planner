import { describe, expect, it } from "vitest";
import { getWorkspaceSwitchPath } from "@/components/app-shell/workspace-switcher-path";

describe("getWorkspaceSwitchPath", () => {
  const target = "new-workspace";

  /**
   * A canonical workspace URL names the tenant, so a switch preserves it and
   * only swaps the workspace slug. Off-canonical input cannot be resolved to a
   * tenant at all — returning the legacy shape is deliberate: the
   * `/app/w/[...legacy]` redirect resolves it, rather than this function
   * inventing a tenant.
   */
  it.each([
    ["/app", `/app/w/${target}`],
    ["/app/w/old", `/app/w/${target}`],
  ])(
    "cannot determine a tenant for %s, so it defers to the legacy redirect",
    (pathname, expected) => {
      expect(getWorkspaceSwitchPath(pathname, target)).toBe(expected);
    },
  );

  it.each([
    ["/app/a/acme/w/old", `/app/a/acme/w/${target}`],
    ["/app/a/acme/w/old/analytics/social", `/app/a/acme/w/${target}/analytics/social`],
    ["/app/a/acme/w/old/brand-kit/colors", `/app/a/acme/w/${target}/brand-kit/colors`],
    // A dynamic record id is dropped rather than carried into another
    // workspace, where it would 404 — or worse, resolve.
    ["/app/a/acme/w/old/planning/edit/record-123", `/app/a/acme/w/${target}/planning`],
    ["/app/a/acme/w/old/planning/record-123/publish", `/app/a/acme/w/${target}/planning`],
    ["/app/a/acme/w/old/settings/lifecycle", `/app/a/acme/w/${target}/settings/lifecycle`],
    ["/app/a/acme/w/old/unknown/record-123", `/app/a/acme/w/${target}`],
  ])("maps %s to a safe destination, preserving the tenant", (pathname, expected) => {
    expect(getWorkspaceSwitchPath(pathname, target)).toBe(expected);
  });

  it("does not leak the previous workspace's tenant when the slug is shared across agencies", () => {
    // `old` exists in two agencies; the URL names which one, and the switch
    // stays inside it rather than inheriting a stale or default tenant.
    expect(getWorkspaceSwitchPath("/app/a/agency-one/w/old/planning", "shared")).toBe(
      "/app/a/agency-one/w/shared/planning",
    );
    expect(getWorkspaceSwitchPath("/app/a/agency-two/w/old/planning", "shared")).toBe(
      "/app/a/agency-two/w/shared/planning",
    );
  });
});
