"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { sendInviteAction } from "./actions";

const initialState: { error?: string; success?: boolean; devLink?: string | null } = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sending…" : "Send invitation"}
    </Button>
  );
}

export function SendInviteForm({ workspaces }: { workspaces: { id: string; name: string }[] }) {
  const [state, formAction] = useFormState(sendInviteAction, initialState);
  const [selectedRoles, setSelectedRoles] = React.useState<Record<string, string>>({});

  const workspaceRolesJson = React.useMemo(
    () =>
      JSON.stringify(
        Object.entries(selectedRoles).map(([workspaceId, role]) => ({ workspaceId, role })),
      ),
    [selectedRoles],
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField id="email" label="Email" required>
          <Input type="email" name="email" required placeholder="alice@example.com" />
        </FormField>
        <FormField id="inviteeName" label="Name (optional)">
          <Input type="text" name="inviteeName" placeholder="Alice Doe" />
        </FormField>
      </div>

      <label className="text-body text-fg-primary flex items-center gap-2">
        <input type="checkbox" name="grantsAgencyAdmin" className="h-4 w-4" />
        Grant agency admin (only your role allows this)
      </label>

      {workspaces.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-body text-fg-primary font-semibold">
            Workspace roles (optional)
          </legend>
          {workspaces.map((w) => (
            <div key={w.id} className="flex items-center gap-3">
              <span className="text-body text-fg-primary w-40 truncate">{w.name}</span>
              <select
                value={selectedRoles[w.id] ?? ""}
                onChange={(e) => {
                  const next = { ...selectedRoles };
                  if (e.target.value) next[w.id] = e.target.value;
                  else delete next[w.id];
                  setSelectedRoles(next);
                }}
                className="border-border bg-surface text-fg-primary text-body rounded-[var(--radius-control)] border px-2 py-1"
              >
                <option value="">No access</option>
                <option value="workspace_manager">Workspace Manager</option>
                <option value="content_planner">Content Planner</option>
                <option value="designer">Designer</option>
                <option value="internal_reviewer">Internal Reviewer</option>
                <option value="client_reviewer">Client Reviewer</option>
                <option value="publisher">Publisher</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
          ))}
        </fieldset>
      ) : null}

      <input type="hidden" name="workspaceRoles" value={workspaceRolesJson} />

      {state?.error ? (
        <p role="alert" className="text-label text-danger font-semibold">
          {state.error}
        </p>
      ) : null}
      {state?.success && state?.devLink ? (
        <div
          role="status"
          className="border-primary/20 bg-primary-subtle text-primary text-body rounded-[var(--radius-control)] border p-3"
        >
          <p className="font-semibold">Invitation sent.</p>
          <p className="text-label mt-1 break-all">
            Dev link:{" "}
            <a href={state.devLink} className="underline">
              {state.devLink}
            </a>
          </p>
        </div>
      ) : null}
      {state?.success && !state?.devLink ? (
        <p role="status" className="text-label text-success font-semibold">
          Invitation emailed. Expires in 7 days.
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
