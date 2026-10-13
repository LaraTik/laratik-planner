import { parseWorkspacePath, workspaceBasePath } from "@/lib/urls";

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
 *
 * The tenant must never be guessed. A workspace slug is unique only WITHIN an
 * agency, so `/app/w/<slug>` cannot say which workspace it means.
 *
 * The agency therefore comes from the DESTINATION workspace, which the
 * caller already knows, and is passed in as `targetAgencySlug`. The current
 * pathname only decides WHICH sub-route to preserve; it is never the source
 * of the tenant. That is what lets this return a canonical URL even when the
 * user is sitting on a non-canonical page — previously that case fell back to
 * the legacy shape and paid a full shell re-render for the redirect.
 */
export function getWorkspaceSwitchPath(
  pathname: string,
  workspaceSlug: string,
  targetAgencySlug: string,
): string {
  const parsed = parseWorkspacePath(pathname);
  const base = workspaceBasePath(targetAgencySlug, workspaceSlug);
  const segments = (parsed?.rest ?? "").split("/").filter(Boolean);
  let preserved = "";
  for (let length = segments.length; length > 0; length -= 1) {
    const candidate = segments.slice(0, length).join("/");
    if (PRESERVED_WORKSPACE_PATHS.has(candidate)) {
      preserved = candidate;
      break;
    }
  }

  return preserved ? `${base}/${preserved}` : base;
}
