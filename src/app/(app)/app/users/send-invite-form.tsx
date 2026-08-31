"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { sendInviteAction, type InviteActionState } from "./actions";
import { WorkspaceRoleMatrix } from "./_components/workspace-role-matrix";

const initialState: InviteActionState = {};

/**
 * Send-invite form for the User Management page. Renders inside the
 * "Send invitation" tab of the card. Mirrors the contract documented
 * on the form's `data-testid` and the action's error strip.
 *
 * The per-workspace role selector is a shared
 * `<WorkspaceRoleMatrix>` (under `_components/`) so the "Add directly"
 * tab can reuse the exact same UI without duplication.
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

        <div className="space-y-1">
          <label
            htmlFor="send-invite-grants-admin"
            className="text-body text-fg-primary flex items-center gap-2"
          >
            <Checkbox
              id="send-invite-grants-admin"
              name="grantsAgencyAdmin"
              data-testid="send-invite-grants-admin"
            />
            Grant agency admin
          </label>
          <p id="send-invite-grants-admin-help" className="text-fg-muted text-label ps-6">
            Agency admins can manage members, workspaces, and all agency settings. Only grant to
            people you trust with full access.
          </p>
        </div>

        {workspaces.length > 0 ? (
          <fieldset className="space-y-2">
            <legend className="text-body text-fg-primary font-semibold">Workspace roles</legend>
            <p id="send-invite-workspace-roles-help" className="text-fg-muted text-label">
              Pick at least one role in at least one workspace. Leaving everything blank adds the
              person to the agency but gives them no workspace access — they can sign in but cannot
              open any workspace.
            </p>
            {fieldErrors.workspaceRoles ? (
              <p role="alert" className="text-label text-danger font-semibold">
                {fieldErrors.workspaceRoles.join("; ")}
              </p>
            ) : null}
            <WorkspaceRoleMatrix workspaces={workspaces} testId="send-invite" />
          </fieldset>
        ) : null}

        <FormSubmitButton label="Send invitation" pendingLabel="Sending…" />
      </form>
    </div>
  );
}
