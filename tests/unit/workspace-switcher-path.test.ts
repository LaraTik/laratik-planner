import { describe, expect, it } from "vitest";
import { getWorkspaceSwitchPath } from "@/components/app-shell/workspace-switcher-path";

describe("getWorkspaceSwitchPath", () => {
  const target = "new-workspace";

  /**
   * The tenant comes from the DESTINATION workspace, which the caller knows,
   * and is passed in explicitly. The current pathname only decides which
   * sub-route to preserve — it is never the source of the tenant.
   *
   * This is what lets a switch from a non-canonical page still produce a
   * canonical URL. It used to fall back to the legacy shape there, which
   * cost a full app-shell re-render inside the redirect (measured: +21 SQL
   * statements and ~1.5-2x the wall-clock per navigation).
   */
  it.each([
    ["/app", `/app/a/acme/w/${target}`],
    ["/app/w/old", `/app/a/acme/w/${target}`],
    ["/app/workspaces", `/app/a/acme/w/${target}`],
  ])("resolves a canonical destination from a non-canonical pathname %s", (pathname, expected) => {
    expect(getWorkspaceSwitchPath(pathname, target, "acme")).toBe(expected);
  });

  it.each([
    ["/app/a/acme/w/old", `/app/a/acme/w/${target}`],
    ["/app/a/acme/w/old/analytics/social", `/app/a/acme/w/${target}/analytics/social`],
    ["/app/a/acme/w/old/analytics/advertising", `/app/a/acme/w/${target}/analytics/advertising`],
    ["/app/a/acme/w/old/engagement/inbox", `/app/a/acme/w/${target}/engagement/inbox`],
    ["/app/a/acme/w/old/engagement/connections", `/app/a/acme/w/${target}/engagement/connections`],
    ["/app/a/acme/w/old/brand-kit/colors", `/app/a/acme/w/${target}/brand-kit/colors`],
    // A dynamic record id is dropped rather than carried into another
    // workspace, where it would 404 — or worse, resolve.
    ["/app/a/acme/w/old/planning/edit/record-123", `/app/a/acme/w/${target}/planning`],
    ["/app/a/acme/w/old/planning/record-123/publish", `/app/a/acme/w/${target}/planning`],
    ["/app/a/acme/w/old/settings/lifecycle", `/app/a/acme/w/${target}/settings/lifecycle`],
    ["/app/a/acme/w/old/unknown/record-123", `/app/a/acme/w/${target}`],
  ])("maps %s to a safe destination, preserving the sub-route", (pathname, expected) => {
    expect(getWorkspaceSwitchPath(pathname, target, "acme")).toBe(expected);
  });

  it("takes the tenant from the destination, not from where the user happens to be", () => {
    // Switching from agency-one's workspace into a workspace that belongs to
    // agency-two must land in agency-two — the previous page's tenant must
    // not be inherited.
    expect(getWorkspaceSwitchPath("/app/a/agency-one/w/old/planning", "shared", "agency-two")).toBe(
      "/app/a/agency-two/w/shared/planning",
    );
    expect(getWorkspaceSwitchPath("/app/a/agency-one/w/old/planning", "shared", "agency-one")).toBe(
      "/app/a/agency-one/w/shared/planning",
    );
  });

  it("never emits the legacy /app/w/ shape, even for an unparseable pathname", () => {
    for (const pathname of ["/", "/signin", "/app/w/legacy", "/totally/unknown"]) {
      expect(getWorkspaceSwitchPath(pathname, target, "acme")).not.toContain("/app/w/");
    }
  });
});
