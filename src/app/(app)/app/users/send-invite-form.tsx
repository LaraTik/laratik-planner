"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { sendInviteAction, type InviteActionState } from "./actions";

const initialState: InviteActionState = {};

/**
 * Send-invite form for the User Management page.
 *
 * Errors surface in the standard danger-subtle card (per Stitch
 * design) with role="alert" so screen readers announce them. Field-
 * level zod issues are rendered next to the relevant input via the
 * shared FormField component. On success, the inner form is keyed
 * with the new invitation id so all local state (selected workspace
 * roles + uncontrolled inputs) is naturally reset, and a
 * confirmation strip renders above the form.
 */
export function SendInviteForm({ workspaces }: { workspaces: { id: string; name: string }[] }) {
  const [state, formAction] = useActionState(sendInviteAction, initialState);
  // Derive the form's `key` from the invitation id. Each successful
  // submit changes the invitation id, so the form remounts and all
  // uncontrolled inputs + child state reset. The literal "initial"
  // keeps the key stable before the first success.
  const formKey = state?.success && state.invitationId ? state.invitationId : "initial";

  const fieldErrors = state?.fieldErrors ?? {};
  const errorMessage = state?.error;

  return (
    <div className="space-y-4" data-testid="send-invite-form-wrapper">
      {errorMessage ? (
        <div
          role="alert"
          data-testid="send-invite-error"
          className="border-danger/20 bg-danger-subtle text-danger flex items-start gap-3 rounded-[var(--radius-control)] border p-3"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <span className="text-label font-semibold">We couldn&apos;t send that invitation</span>
            <span className="text-body">{errorMessage}</span>
          </div>
        </div>
      ) : null}

      {state?.success && !state?.devLink ? (
        <div
          role="status"
          className="border-success/20 bg-success-subtle text-success flex items-start gap-3 rounded-[var(--radius-control)] border p-3"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="text-body">
            Invitation emailed. Expires in 7 days.
            {state.expiresAt ? ` (on ${state.expiresAt})` : null}
          </span>
        </div>
      ) : null}

      {state?.success && state?.devLink ? (
        <div
          role="status"
          className="border-primary/20 bg-primary-subtle text-primary flex flex-col gap-1 rounded-[var(--radius-control)] border p-3"
        >
          <span className="text-label font-semibold">Invitation sent.</span>
          <span className="text-body break-all">
            Dev link:{" "}
            <a href={state.devLink} className="underline">
              {state.devLink}
            </a>
          </span>
        </div>
      ) : null}

      <form key={formKey} action={formAction} className="space-y-4" data-testid="send-invite-form">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            id="email"
            label="Email"
            required
            {...(fieldErrors.email?.[0] ? { error: fieldErrors.email[0] } : {})}
          >
            <Input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="alice@example.com"
              {...(fieldErrors.email ? { "aria-invalid": true } : {})}
            />
          </FormField>
          <FormField
            id="inviteeName"
            label="Name (optional)"
            {...(fieldErrors.inviteeName?.[0] ? { error: fieldErrors.inviteeName[0] } : {})}
          >
            <Input
              type="text"
              name="inviteeName"
              placeholder="Alice Doe"
              {...(fieldErrors.inviteeName ? { "aria-invalid": true } : {})}
            />
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
            {fieldErrors.workspaceRoles ? (
              <p role="alert" className="text-label text-danger font-semibold">
                {fieldErrors.workspaceRoles.join("; ")}
              </p>
            ) : null}
            <WorkspaceRoleGrid workspaces={workspaces} />
          </fieldset>
        ) : null}

        <FormSubmitButton label="Send invitation" pendingLabel="Sending…" />
      </form>
    </div>
  );
}

/**
 * Owns the controlled workspace-role selection. When the parent form
 * remounts (because the form key changes after a successful invite),
 * this component remounts with it and its internal state is reset.
 */
function WorkspaceRoleGrid({ workspaces }: { workspaces: { id: string; name: string }[] }) {
  const [selectedRoles, setSelectedRoles] = React.useState<Record<string, string>>({});
  return (
    <>
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
