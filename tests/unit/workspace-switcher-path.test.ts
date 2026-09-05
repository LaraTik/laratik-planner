import { describe, expect, it } from "vitest";
import { getWorkspaceSwitchPath } from "@/components/app-shell/workspace-switcher-path";

describe("getWorkspaceSwitchPath", () => {
  const target = "new-workspace";

  it.each([
    ["/app", `/app/w/${target}`],
    ["/app/w/old", `/app/w/${target}`],
    ["/app/w/old/analytics/social", `/app/w/${target}/analytics/social`],
    ["/app/w/old/brand-kit/colors", `/app/w/${target}/brand-kit/colors`],
    ["/app/w/old/planning/edit/record-123", `/app/w/${target}/planning`],
    ["/app/w/old/planning/record-123/publish", `/app/w/${target}/planning`],
    ["/app/w/old/settings/lifecycle", `/app/w/${target}/settings/lifecycle`],
    ["/app/w/old/unknown/record-123", `/app/w/${target}`],
  ])("maps %s to a safe destination", (pathname, expected) => {
    expect(getWorkspaceSwitchPath(pathname, target)).toBe(expected);
  });
});
