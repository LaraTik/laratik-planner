"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toggleAgencyAdminAction, updateMemberRolesAction, type MemberEditState } from "./actions";
import { WorkspaceRoleMatrix } from "./_components/workspace-role-matrix";
import { workspaceRoleSchema } from "@/lib/auth/invitation-command";

/**
 * Right-side slide-in drawer for editing a single agency member's:
 *   - agency-admin flag (if the actor is an agency admin and the target
 *     is not the actor)
 *   - per-workspace role assignment (any number of roles per workspace,
 *     with the option to clear all access)
 *
 * The drawer is a *single form* whose two submit buttons target two
 * different server actions via React 19's `formAction` prop:
 *   - default (`action={rolesFormAction}`) — updateMemberRolesAction,
 *     replaces every per-workspace role row in a single transaction.
 *     Multi-role: a user can hold `workspace_manager` + `designer`
 *     in the same workspace — the action persists each as a separate
 *     row in `workspace_membership_role`.
 *   - admin toggle button (`formAction={adminFormAction}`) —
 *     toggleAgencyAdminAction, flips the isAgencyAdmin flag
 *
 * Status (Active / Deactivated) and the email are intentionally
 * read-only inside the drawer — the existing Activate/Deactivate
 * affordance stays on the list row so the actor can see the two
 * states side by side.
 *
 * The form is remounted on every subject change (key={subject.id}) so
 * the in-progress edits are discarded when a different member is
 * opened, and the next subject's current roles are seeded into the
 * workspace matrix.
 */

export type MemberEditWorkspace = {
  id: string;
  name: string;
  /**
   * All roles currently assigned to this member in this workspace.
   * Empty array means "no access".
   */
  currentRoles: string[];
};

export type MemberEditSubject = {
  id: string;
  name: string;
  email: string;
  status: "active" | "deactivated";
  isAgencyAdmin: boolean;
};

export type MemberEditDrawerProps = {
  /** When non-null, the drawer is open with this subject pre-populated. */
  subject: MemberEditSubject | null;
  /** When false, the agency-admin toggle is hidden (and the action rejects). */
  actorIsAgencyAdmin: boolean;
  /** The signed-in user's id; used to hide the self-admin lockout UI. */
  actorUserId: string;
  workspaces: MemberEditWorkspace[];
  onOpenChange: (open: boolean) => void;
};

const ROLE_LABELS: Record<string, string> = {
  workspace_manager: "Workspace Manager",
  content_planner: "Content Planner",
  designer: "Designer",
  internal_reviewer: "Internal Reviewer",
  client_reviewer: "Client Reviewer",
  publisher: "Publisher",
  viewer: "Viewer",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  workspace_manager: "Full control of a workspace, including members and settings.",
  content_planner: "Owns the brief, plan, and submission of content for review.",
  designer: "Picks up design tasks and uploads delivery versions.",
  internal_reviewer: "Reviews and approves content at the content + creative gates.",
  client_reviewer: "Reviews and approves creative on behalf of the client.",
  publisher: "Records per-channel publication outcomes once the item is live.",
  viewer: "Read-only access. Cannot mutate any workspace state.",
};

export function MemberEditDrawer({
  subject,
  actorIsAgencyAdmin,
  actorUserId,
  workspaces,
  onOpenChange,
}: MemberEditDrawerProps) {
  return (
    <Dialog
      open={subject !== null}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      <DialogContent
        // Right-side slide-in (override the centered default)
        className="bg-surface fixed end-0 top-0 bottom-0 left-auto z-50 flex h-full w-full max-w-[560px] translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none border-s border-e-0 border-t-0 border-b-0 p-0 shadow-xl"
        data-testid="member-edit-drawer"
      >
        {subject ? (
          <MemberEditForm
            key={subject.id}
            subject={subject}
            actorIsAgencyAdmin={actorIsAgencyAdmin}
            actorUserId={actorUserId}
            workspaces={workspaces}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type FormProps = {
  subject: MemberEditSubject;
  actorIsAgencyAdmin: boolean;
  actorUserId: string;
  workspaces: MemberEditWorkspace[];
  onClose: () => void;
};

const initialState: MemberEditState = {};

function MemberEditForm({
  subject,
  actorIsAgencyAdmin,
  actorUserId,
  workspaces,
  onClose,
}: FormProps) {
  // Seed-once on mount via lazy initialiser — the parent uses
  // key={subject.id} so a different member remounts this whole form.
  const defaultSelectedRoles = React.useMemo<Record<string, string[]>>(() => {
    const next: Record<string, string[]> = {};
    for (const w of workspaces) {
      const cleaned = w.currentRoles.filter((r) =>
        (workspaceRoleSchema.options as readonly string[]).includes(r),
      );
      if (cleaned.length > 0) next[w.id] = cleaned;
    }
    return next;
  }, [workspaces]);

  const isSelf = subject.id === actorUserId;
  const showAdminToggle = actorIsAgencyAdmin && !isSelf;

  // Bind the target userId into the actions so the form fields don't
  // need to carry it.
  const rolesAction = React.useCallback(
    (prev: MemberEditState, formData: FormData) =>
      updateMemberRolesAction(subject.id, prev, formData),
    [subject.id],
  );
  const adminAction = React.useCallback(
    (prev: MemberEditState, formData: FormData) =>
      toggleAgencyAdminAction(subject.id, prev, formData),
    [subject.id],
  );
  const [rolesState, rolesFormAction] = useActionState<MemberEditState, FormData>(
    rolesAction,
    initialState,
  );
  const [adminState, adminFormAction] = useActionState<MemberEditState, FormData>(
    adminAction,
    initialState,
  );

  // Close the drawer on a successful save from either action
  const saved = rolesState.saved || adminState.saved;
  React.useEffect(() => {
    if (saved) onClose();
  }, [saved, onClose]);

  const errorMessage = rolesState.error ?? adminState.error;

  // Count the current effective roles for the header summary.
  const effectiveRoles = workspaces.flatMap((w) => w.currentRoles);

  return (
    <>
      <DialogHeader className="border-border bg-surface sticky top-0 z-10 border-b px-6 py-4">
        <DialogTitle>{`Edit ${subject.name}`}</DialogTitle>
        <DialogDescription>
          Adjust agency-wide access and per-workspace roles. Each workspace can hold any number of
          roles — pick the ones that match what this person actually does.
        </DialogDescription>
      </DialogHeader>

      <form action={rolesFormAction} className="flex flex-1 flex-col">
        <div className="flex-1 space-y-6 px-6 py-5">
          <ReadOnlyField label="Email" value={subject.email} />
          <ReadOnlyField
            label="Status"
            value={subject.status === "active" ? "Active" : "Deactivated"}
            trailing={
              subject.status === "active" ? (
                <Badge variant="success">Active</Badge>
              ) : (
                <Badge variant="default">Deactivated</Badge>
              )
            }
          />
          <ReadOnlyField
            label="Current effective roles"
            value={
              effectiveRoles.length === 0
                ? "No access in any workspace"
                : `${effectiveRoles.length} role${effectiveRoles.length === 1 ? "" : "s"} across ${
                    workspaces.filter((w) => w.currentRoles.length > 0).length
                  } workspace${workspaces.filter((w) => w.currentRoles.length > 0).length === 1 ? "" : "s"}`
            }
          />

          {showAdminToggle ? (
            <div className="space-y-2">
              <p className="text-label text-fg-secondary font-semibold tracking-wide uppercase">
                Agency admin
              </p>
              <label className="text-body text-fg-primary flex items-center gap-2">
                <Checkbox
                  name="isAgencyAdmin"
                  defaultChecked={subject.isAgencyAdmin}
                  data-testid="member-edit-is-agency-admin"
                />
                Grant agency administrator access
              </label>
              <p className="text-label text-fg-muted">
                Submitting this section flips the flag. The role form below is unaffected.
              </p>
              <div>
                <FormSubmitButton
                  formAction={adminFormAction}
                  size="sm"
                  variant="secondary"
                  label="Apply admin change"
                  pendingLabel="Applying…"
                />
              </div>
            </div>
          ) : null}

          <fieldset className="space-y-3">
            <legend className="text-label text-fg-secondary font-semibold tracking-wide uppercase">
              Workspace roles
            </legend>
            <p className="text-label text-fg-muted">
              Each role grants a specific capability in that workspace. Hold a role with
              responsibility for any of the workflow steps it controls.
            </p>
            {workspaces.length === 0 ? (
              <p className="text-body text-fg-muted">No workspaces in this agency yet.</p>
            ) : (
              <>
                <WorkspaceRoleMatrix
                  workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
                  testId="member-edit"
                  defaultSelectedRoles={defaultSelectedRoles}
                  showNoAccessAction
                />
                <details className="text-label text-fg-muted group mt-2">
                  <summary className="hover:text-fg-primary focus-visible:ring-focus-ring cursor-pointer list-none rounded-[var(--radius-control)] py-1 underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2">
                    <span aria-hidden="true" className="me-1 inline-block group-open:rotate-90">
                      ▸
                    </span>
                    What does each role do?
                  </summary>
                  <ul className="text-label text-fg-secondary mt-2 space-y-1 ps-4">
                    {workspaceRoleSchema.options.map((role) => (
                      <li key={role}>
                        <span className="text-fg-primary font-semibold">
                          {ROLE_LABELS[role] ?? role}
                        </span>
                        <span className="text-fg-muted mx-1">—</span>
                        <span>{ROLE_DESCRIPTIONS[role] ?? ""}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </fieldset>

          {errorMessage ? (
            <p
              role="alert"
              className="bg-danger-subtle text-label text-danger rounded-[var(--radius-control)] p-3 font-semibold"
            >
              {errorMessage}
            </p>
          ) : null}
        </div>

        <DialogFooter className="border-border bg-surface sticky bottom-0 px-6 py-4">
          <Button type="button" variant="ghost" onClick={onClose} data-testid="member-edit-cancel">
            Cancel
          </Button>
          <FormSubmitButton
            label="Save changes"
            pendingLabel="Saving…"
            data-testid="member-edit-save"
          />
        </DialogFooter>
      </form>
    </>
  );
}

function ReadOnlyField({
  label,
  value,
  trailing,
}: {
  label: string;
  value: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-label text-fg-secondary font-semibold tracking-wide uppercase">{label}</p>
      <div className="flex items-center gap-2">
        <p className="text-body text-fg-primary break-all">{value}</p>
        {trailing}
      </div>
    </div>
  );
}
