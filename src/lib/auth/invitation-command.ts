import { z } from "zod";

export const workspaceRoleSchema = z.enum([
  "workspace_manager",
  "content_planner",
  "designer",
  "internal_reviewer",
  "client_reviewer",
  "publisher",
  "viewer",
]);

export const invitationWorkspaceRoleSchema = z.object({
  workspaceId: z.string().uuid(),
  role: workspaceRoleSchema,
});

export const invitationCommandSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  inviteeName: z.string().trim().min(1).max(120).optional(),
  grantsAgencyAdmin: z.boolean().default(false),
  workspaceRoles: z.array(invitationWorkspaceRoleSchema).max(100).default([]),
});

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type InvitationCommand = z.infer<typeof invitationCommandSchema>;
