"use client";

import * as React from "react";
import { X } from "lucide-react";
import { workspaceRoleSchema, type WorkspaceRole } from "@/lib/auth/invitation-command";

/**
 * Shared per-workspace role selector used by both the "Send invitation"
 * and "Add directly" forms on /app/users.
 *
 * Behaviour:
 *  - Controlled by the parent via the hidden `workspaceRoles` input
 *    (JSON of `[{ workspaceId, role }]`); the parent reads it on submit.
 *  - Internal state is local to this component (one map of
 *    `workspaceId -> role`); it remounts when the parent form remounts
 *    (each form is `key`ed on its success id, so a successful submit
 *    naturally resets the selection).
 *  - Empty value means "no access for this workspace" — the parent
 *    action treats the missing workspace as omitted from the grants
 *    list.
 *  - The matrix is the source of truth for which roles are
 *    user-selectable. Centralising the enum values here means a new
 *    role added to the schema flows to both forms automatically (the
 *    `<option>` set is derived from `workspaceRoleSchema.options`).
 */
export function WorkspaceRoleMatrix({
  workspaces,
  testId,
}: {
  workspaces: { id: string; name: string }[];
  testId?: string;
}) {
  const [selectedRoles, setSelectedRoles] = React.useState<Record<string, string>>({});
  return (
    <>
      {workspaces.map((w) => (
        <div key={w.id} className="flex items-center gap-3">
          <label
            htmlFor={`workspace-role-${w.id}`}
            className="text-body text-fg-primary w-40 truncate"
          >
            {w.name}
          </label>
          <select
            id={`workspace-role-${w.id}`}
            value={selectedRoles[w.id] ?? ""}
            onChange={(e) => {
              const next = { ...selectedRoles };
              if (e.target.value) next[w.id] = e.target.value;
              else delete next[w.id];
              setSelectedRoles(next);
            }}
            className="border-border bg-surface text-fg-primary text-body rounded-[var(--radius-control)] border px-2 py-1"
            data-testid={testId ? `${testId}-select-${w.id}` : undefined}
          >
            <option value="">No access</option>
            {workspaceRoleSchema.options.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
          {selectedRoles[w.id] ? (
            <button
              type="button"
              onClick={() => {
                const next = { ...selectedRoles };
                delete next[w.id];
                setSelectedRoles(next);
              }}
              className="text-fg-muted hover:text-fg-primary"
              aria-label={`Remove role from ${w.name}`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ))}
      <input
        type="hidden"
        name="workspaceRoles"
        value={JSON.stringify(
          Object.entries(selectedRoles).map(([workspaceId, role]) => ({ workspaceId, role })),
        )}
      />
    </>
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
