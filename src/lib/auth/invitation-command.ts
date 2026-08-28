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

/**
 * A single workspace role grant. One user can hold many roles in the
 * same workspace (a planner who also designs, a manager who also
 * reviews, etc.). The schema accepts BOTH the legacy single-role
 * shape `{ workspaceId, role }` (still produced by older clients
 * and the "Add user" form during the migration) and the new
 * multi-role shape `{ workspaceId, roles: [role, …] }`. The action
 * layer normalises both into the new shape before persisting.
 */
export const invitationWorkspaceRoleSchema = z.union([
  z.object({
    workspaceId: z.string().uuid(),
    role: workspaceRoleSchema,
  }),
  z.object({
    workspaceId: z.string().uuid(),
    roles: z.array(workspaceRoleSchema).min(1).max(workspaceRoleSchema.options.length),
  }),
]);

export const invitationCommandSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  inviteeName: z.string().trim().min(1).max(120).optional(),
  grantsAgencyAdmin: z.boolean().default(false),
  workspaceRoles: z.array(invitationWorkspaceRoleSchema).max(200).default([]),
});

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type InvitationCommand = z.infer<typeof invitationCommandSchema>;

/**
 * Flatten the multi/legacy grant shape into `[{ workspaceId, role }]`
 * pairs. The downstream persistence layer (the
 * `invitation_workspace_role` table, the `workspace_membership_role`
 * table) is keyed on `(workspaceId, role)` and treats each role as
 * an independent row, so this is the canonical shape the service
 * layer should consume.
 */
export function flattenWorkspaceRoleGrants(
  grants: readonly InvitationCommand["workspaceRoles"][number][],
): { workspaceId: string; role: WorkspaceRole }[] {
  const out: { workspaceId: string; role: WorkspaceRole }[] = [];
  for (const g of grants) {
    if ("role" in g) {
      out.push({ workspaceId: g.workspaceId, role: g.role });
    } else {
      for (const role of g.roles) {
        out.push({ workspaceId: g.workspaceId, role });
      }
    }
  }
  // De-dupe in case the caller repeated a (workspaceId, role) pair.
  const seen = new Set<string>();
  return out.filter((g) => {
    const k = `${g.workspaceId}\u0000${g.role}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
