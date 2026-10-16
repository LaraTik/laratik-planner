import { parseWorkspacePath, workspaceBasePath } from "@/lib/urls";

const PRESERVED_WORKSPACE_PATHS = new Set([
  "ai-settings",
  "analytics/advertising",
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
  "engagement",
  "engagement/activity",
  "engagement/analytics",
  "engagement/automations",
  "engagement/comments",
  "engagement/connections",
  "engagement/inbox",
  "engagement/playbooks",
  "engagement/reviews",
  "engagement/settings",
  "engagement/setup",
  "engagement/team",
  "engagement/test-lab",
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

// These filters describe the view, not a workspace-owned record. Preserve
// them when they are useful in the destination workspace; drop identifiers
// that point at an account, conversation, post, or content item owned by the
// source workspace.
const PRESERVED_QUERY_KEYS = new Set([
  "since",
  "until",
  "date",
  "from",
  "to",
  "status",
  "state",
  "channel",
  "platform",
  "view",
  "tab",
  "sort",
  "direction",
]);

function preserveViewQuery(query: string): string {
  if (!query) return "";
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const next = new URLSearchParams();
  for (const [key, value] of params) {
    if (PRESERVED_QUERY_KEYS.has(key)) next.append(key, value);
  }
  const serialized = next.toString();
  return serialized ? `?${serialized}` : "";
}

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

  const query = preserveViewQuery(parsed?.query ?? "");
  return preserved ? `${base}/${preserved}${query}` : `${base}${query}`;
}
