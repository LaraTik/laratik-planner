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
 * The tenant comes from the URL, not from a guess: a workspace slug is unique
 * only WITHIN an agency, so `/app/w/<slug>` cannot say which workspace it
 * means. When the caller is not on a canonical workspace URL we cannot know the
 * tenant at all, and we return the legacy shape so the `/app/w/[...legacy]`
 * redirect resolves it rather than guessing here. See `src/lib/urls.ts`.
 */
export function getWorkspaceSwitchPath(pathname: string, workspaceSlug: string): string {
  const parsed = parseWorkspacePath(pathname);
  if (!parsed) return `/app/w/${workspaceSlug}`;

  const base = workspaceBasePath(parsed.agencySlug, workspaceSlug);
  const segments = parsed.rest.split("/").filter(Boolean);
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
