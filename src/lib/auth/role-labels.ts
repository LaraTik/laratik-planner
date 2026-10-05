import { workspaceRoleSchema, type WorkspaceRole } from "@/lib/auth/invitation-command";

/**
 * Single source of truth for how a workspace role is *named* and
 * *described* in the UI.
 *
 * Before this module the same 7-entry map was copy-pasted into four
 * files (`invitation-list.tsx`, `member-edit-drawer.tsx`,
 * `_components/workspace-role-matrix.tsx`, and the workspace `team/page.tsx`),
 * which meant adding a role to `workspaceRoleSchema` silently left three
 * of the four surfaces showing the raw enum slug. Every surface now
 * imports from here, so the enum remains the only list anyone has to
 * maintain.
 *
 * Three pieces per role:
 *  - `roleLabelKey`    — i18n catalog key (resolved through `t`)
 *  - `roleLabel`       — English fallback for when no translator is in scope
 *  - `roleDescription` — one line explaining what the role can do, shown
 *                        in the drawer's "What does each role do?" disclosure
 */

/** Catalog key for a role's display name, e.g. `team.role.designer`. */
export const roleLabelKey: Record<WorkspaceRole, string> = {
  workspace_manager: "team.role.workspaceManager",
  content_planner: "team.role.contentPlanner",
  designer: "team.role.designer",
  internal_reviewer: "team.role.internalReviewer",
  client_reviewer: "team.role.clientReviewer",
  publisher: "team.role.publisher",
  viewer: "team.role.viewer",
};

/** English fallback used when no translator is available. */
const ROLE_LABELS: Record<WorkspaceRole, string> = {
  workspace_manager: "Workspace Manager",
  content_planner: "Content Planner",
  designer: "Designer",
  internal_reviewer: "Internal Reviewer",
  client_reviewer: "Client Reviewer",
  publisher: "Publisher",
  viewer: "Viewer",
};

const ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  workspace_manager: "Full control of a workspace, including members and settings.",
  content_planner: "Owns the brief, plan, and submission of content for review.",
  designer: "Picks up design tasks and uploads delivery versions.",
  internal_reviewer: "Reviews and approves content at the content + creative gates.",
  client_reviewer: "Reviews and approves creative on behalf of the client.",
  publisher: "Records per-channel publication outcomes once the item is live.",
  viewer: "Read-only access. Cannot mutate any workspace state.",
};

/**
 * Narrow an arbitrary string to a `WorkspaceRole`, or `null`.
 *
 * Callers receive role names from three places that all widen to
 * `string`: the DB enum, the parsed `workspaceRoles` JSON on a form post,
 * and role keys on a membership row. Without this guard every lookup in
 * the maps above would need `?? role` at each of those boundaries.
 */
export function asWorkspaceRole(value: string): WorkspaceRole | null {
  return (workspaceRoleSchema.options as readonly string[]).includes(value)
    ? (value as WorkspaceRole)
    : null;
}

/** English label for a role; unknown values render as the raw slug. */
export function roleLabel(role: string): string {
  const known = asWorkspaceRole(role);
  return known ? ROLE_LABELS[known] : role;
}

/** One-line capability summary; unknown values render empty. */
export function roleDescription(role: string): string {
  const known = asWorkspaceRole(role);
  return known ? ROLE_DESCRIPTIONS[known] : "";
}

/** Catalog key for a role's display name; unknown values pass through. */
export function roleKey(role: string): string {
  const known = asWorkspaceRole(role);
  return known ? roleLabelKey[known] : role;
}
