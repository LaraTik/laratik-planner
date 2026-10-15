import type { WorkspaceRole } from "@/lib/auth/invitation-command";

export const COMMUNITY_PERMISSIONS = [
  "view_inbox",
  "reply_publicly",
  "reply_privately",
  "add_staff_notes",
  "assign_and_route",
  "review_ai_drafts",
  "publish_automation_rules",
  "manage_playbooks",
  "manage_connections",
  "manage_settings",
  "export_analytics",
  "view_audit_activity",
] as const;

export type CommunityPermission = (typeof COMMUNITY_PERMISSIONS)[number];

const INTERNAL_ROLES: readonly WorkspaceRole[] = [
  "workspace_manager",
  "content_planner",
  "designer",
  "internal_reviewer",
  "publisher",
  "viewer",
];
const WRITE_ROLES: readonly WorkspaceRole[] = [
  "workspace_manager",
  "content_planner",
  "designer",
  "internal_reviewer",
  "publisher",
];
const MANAGER_ROLES: readonly WorkspaceRole[] = ["workspace_manager", "content_planner"];

export const COMMUNITY_PERMISSION_ROLES: Readonly<
  Record<CommunityPermission, readonly WorkspaceRole[]>
> = {
  view_inbox: [...INTERNAL_ROLES, "client_reviewer"],
  reply_publicly: WRITE_ROLES,
  reply_privately: WRITE_ROLES,
  add_staff_notes: WRITE_ROLES,
  assign_and_route: MANAGER_ROLES,
  review_ai_drafts: ["workspace_manager", "content_planner", "internal_reviewer"],
  publish_automation_rules: ["workspace_manager"],
  manage_playbooks: ["workspace_manager", "content_planner"],
  manage_connections: ["workspace_manager"],
  manage_settings: ["workspace_manager"],
  export_analytics: INTERNAL_ROLES,
  view_audit_activity: INTERNAL_ROLES,
};
