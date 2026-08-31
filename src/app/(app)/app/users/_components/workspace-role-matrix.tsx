"use client";

import * as React from "react";
import { X } from "lucide-react";
import { workspaceRoleSchema, type WorkspaceRole } from "@/lib/auth/invitation-command";
import { Badge } from "@/components/ui/badge";

/**
 * Shared per-workspace role multi-selector used by the "Send invitation",
 * "Add directly", and "Edit member" forms on /app/users.
 *
 * Multi-role contract:
 *  - Each workspace can hold ANY number of roles from the 7-value enum
 *    (including zero, which means "no access"). A user can hold
 *    `workspace_manager` + `designer` in the same workspace, for
 *    example — a planner who also designs for the workspace.
 *  - The hidden `workspaceRoles` input is JSON of
 *    `[{ workspaceId, roles: string[] }]`. The roles array is the full
 *    set assigned to that workspace (no duplicates — the UI filters
 *    them out before serialising).
 *  - Internal state is local to this component (one map of
 *    `workspaceId -> string[]`); it remounts when the parent form
 *    remounts (each form is `key`ed on its success id, so a successful
 *    submit naturally resets the selection). For the Edit drawer, the
 *    `defaultSelectedRoles` prop seeds the initial value from the
 *    member's existing assignments.
 *  - The matrix is the source of truth for which roles are
 *    user-selectable. Centralising the enum values here means a new
 *    role added to the schema flows to all three forms automatically
 *    (the chip set is derived from `workspaceRoleSchema.options`).
 *
 * Backward compatibility:
 *  - The previous shape was `[{ workspaceId, role }]` (one role per
 *    workspace). The action now accepts both shapes — a single
 *    `{ workspaceId, role }` entry is treated as a one-role grant.
 *    See `parseWorkspaceRolesJson` in `actions.ts`.
 */
export function WorkspaceRoleMatrix({
  workspaces,
  testId,
  defaultSelectedRoles,
  /**
   * When true, the per-workspace section is rendered with a "No access"
   * affordance (a `Remove all` button). When false, the picker is
   * purely additive — used in the "Add user" / "Invite" flows where
   * the absence of any selection already means "no access". Both
   * modes produce the same on-submit shape, so the action is
   * unchanged.
   */
  showNoAccessAction = false,
}: {
  workspaces: { id: string; name: string }[];
  testId?: string;
  defaultSelectedRoles?: Record<string, string[]>;
  showNoAccessAction?: boolean;
}) {
  const seed = React.useMemo<Record<string, string[]>>(() => {
    const next: Record<string, string[]> = {};
    for (const w of workspaces) {
      const initial = defaultSelectedRoles?.[w.id] ?? [];
      next[w.id] = Array.from(new Set(initial)).filter((r) =>
        (workspaceRoleSchema.options as readonly string[]).includes(r),
      );
    }
    return next;
  }, [workspaces, defaultSelectedRoles]);
  const [selectedRoles, setSelectedRoles] = React.useState<Record<string, string[]>>(seed);

  const toggleRole = (workspaceId: string, role: string) => {
    setSelectedRoles((prev) => {
      const current = prev[workspaceId] ?? [];
      const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role];
      const nextRecord = { ...prev };
      if (next.length === 0) delete nextRecord[workspaceId];
      else nextRecord[workspaceId] = next;
      return nextRecord;
    });
  };

  const clearWorkspace = (workspaceId: string) => {
    setSelectedRoles((prev) => {
      const next = { ...prev };
      delete next[workspaceId];
      return next;
    });
  };

  // Serialise to the multi-role shape. The action accepts both the
  // old single-role and the new multi-role shape for backward
  // compatibility.
  const serialised = React.useMemo(
    () =>
      JSON.stringify(
        Object.entries(selectedRoles).flatMap(([workspaceId, roles]) =>
          roles.length === 0 ? [] : roles.map((role) => ({ workspaceId, roles: [role] })),
        ),
      ),
    [selectedRoles],
  );

  return (
    <div className="space-y-3" data-testid={testId ? `${testId}-role-matrix` : undefined}>
      {workspaces.map((w) => {
        const selected = selectedRoles[w.id] ?? [];
        return (
          <div
            key={w.id}
            className="border-border bg-surface-subtle space-y-2 rounded-[var(--radius-control)] border p-3"
            data-testid={testId ? `${testId}-workspace-${w.id}` : undefined}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-body text-fg-primary font-semibold">{w.name}</p>
              {showNoAccessAction && selected.length > 0 ? (
                <button
                  type="button"
                  onClick={() => clearWorkspace(w.id)}
                  className="text-fg-muted hover:text-fg-primary text-label focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2"
                  aria-label={`Remove all access from ${w.name}`}
                  data-testid={testId ? `${testId}-clear-${w.id}` : undefined}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Remove all
                </button>
              ) : null}
            </div>
            <fieldset>
              <legend className="sr-only">{`Roles for ${w.name}`}</legend>
              <div className="flex flex-wrap gap-2" role="group" aria-label={`Roles for ${w.name}`}>
                {workspaceRoleSchema.options.map((role) => {
                  const isOn = selected.includes(role);
                  return (
                    <label
                      key={role}
                      className={`text-label inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 font-semibold transition-colors ${
                        isOn
                          ? "border-primary bg-primary-subtle text-primary"
                          : "border-border bg-surface text-fg-secondary hover:border-fg-secondary"
                      }`}
                      data-testid={testId ? `${testId}-chip-${w.id}-${role}` : undefined}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={isOn}
                        onChange={() => toggleRole(w.id, role)}
                        aria-label={`${roleLabel(role)} for ${w.name}`}
                      />
                      <span>{roleLabel(role)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            {selected.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-label text-fg-muted">Active:</span>
                {selected.map((role) => (
                  <Badge
                    key={role}
                    variant="primary"
                    data-testid={`${testId ?? "role-matrix"}-active-${w.id}-${role}`}
                  >
                    {roleLabel(role as WorkspaceRole)}
                    <button
                      type="button"
                      onClick={() => toggleRole(w.id, role)}
                      className="hover:text-primary-fg focus-visible:ring-focus-ring ms-1 inline-flex h-4 w-4 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2"
                      aria-label={`Remove ${roleLabel(role as WorkspaceRole)} from ${w.name}`}
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p
                className="text-label text-fg-muted"
                data-testid={`${testId ?? "role-matrix"}-empty-${w.id}`}
              >
                No access — pick a role to grant access to this workspace.
              </p>
            )}
          </div>
        );
      })}
      <input type="hidden" name="workspaceRoles" value={serialised} />
    </div>
  );
}

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  workspace_manager: "Workspace Manager",
  content_planner: "Content Planner",
  designer: "Designer",
  internal_reviewer: "Internal Reviewer",
  client_reviewer: "Client Reviewer",
  publisher: "Publisher",
  viewer: "Viewer",
};

function roleLabel(role: WorkspaceRole): string {
  return ROLE_LABELS[role] ?? role;
}
