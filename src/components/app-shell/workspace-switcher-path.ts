const PRESERVED_WORKSPACE_PATHS = new Set([
  "ai-settings",
  "analytics/social",
  "board",
  "brand-kit",
  "brand-kit/activity",
  "brand-kit/colors",
  "brand-kit/linked",
  "brand-kit/logos",
  "brand-kit/pillars",
  "brand-kit/publishing",
  "brand-kit/templates",
  "brand-kit/typography",
  "brand-kit/voice",
  "calendar",
  "channels",
  "client",
  "client/calendar",
  "design-queue",
  "library",
  "planning",
  "planning/batch",
  "planning/new",
  "reviews",
  "settings",
  "settings/approvals",
  "settings/defaults",
  "settings/lead-times",
  "settings/lifecycle",
  "settings/templates",
  "team",
]);

/**
 * Resolve a workspace switch without carrying workspace-owned record IDs or
 * filters into the destination workspace. The longest known static route
 * prefix wins; unknown and dynamic suffixes fall back to a safe index route.
 */
export function getWorkspaceSwitchPath(pathname: string, workspaceSlug: string): string {
  const match = pathname.match(/^\/app\/w\/[^/]+(?:\/(.*))?$/);
  if (!match) return `/app/w/${workspaceSlug}`;

  const segments = (match[1] ?? "").split("/").filter(Boolean);
  let preserved = "";
  for (let length = segments.length; length > 0; length -= 1) {
    const candidate = segments.slice(0, length).join("/");
    if (PRESERVED_WORKSPACE_PATHS.has(candidate)) {
      preserved = candidate;
      break;
    }
  }

  return preserved ? `/app/w/${workspaceSlug}/${preserved}` : `/app/w/${workspaceSlug}`;
}
