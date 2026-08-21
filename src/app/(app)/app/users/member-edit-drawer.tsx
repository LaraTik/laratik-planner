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
import { toggleAgencyAdminAction, updateMemberRolesAction, type MemberEditState } from "./actions";

/**
 * Right-side slide-in drawer for editing a single agency member's:
 *   - agency-admin flag (if the actor is an agency admin and the target
 *     is not the actor)
 *   - per-workspace role assignment (one role per workspace, with
 *     "No access" available to clear access)
 *
 * The drawer is a *single form* whose two submit buttons target two
 * different server actions via React 19's `formAction` prop:
 *   - default (`action={rolesFormAction}`) — updateMemberRolesAction,
 *     replaces every per-workspace role row in a single transaction
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
 * workspace selects.
 */

export type MemberEditWorkspace = {
  id: string;
  name: string;
  /** Current role in this workspace; empty string means "no access". */
  currentRole: string;
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

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "workspace_manager", label: "Workspace Manager" },
  { value: "content_planner", label: "Content Planner" },
  { value: "designer", label: "Designer" },
  { value: "internal_reviewer", label: "Internal Reviewer" },
  { value: "client_reviewer", label: "Client Reviewer" },
  { value: "publisher", label: "Publisher" },
  { value: "viewer", label: "Viewer" },
];

function serializeGrants(grants: Record<string, string>): string {
  return JSON.stringify(
    Object.entries(grants).map(([workspaceId, role]) => ({ workspaceId, role })),
  );
}

function seedGrants(workspaces: MemberEditWorkspace[]): Record<string, string> {
  const next: Record<string, string> = {};
  for (const w of workspaces) next[w.id] = w.currentRole;
  return next;
}

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
        className="bg-surface fixed top-0 right-0 bottom-0 left-auto z-50 flex h-full w-full max-w-[520px] translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none border-t-0 border-r-0 border-b-0 border-l p-0 shadow-xl"
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
  const [grants, setGrants] = React.useState<Record<string, string>>(() => seedGrants(workspaces));
  const grantsJson = React.useMemo(() => serializeGrants(grants), [grants]);

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

  return (
    <>
      <DialogHeader className="border-border bg-surface sticky top-0 z-10 border-b px-6 py-4">
        <DialogTitle>{`Edit ${subject.name}`}</DialogTitle>
        <DialogDescription>
          Adjust agency-wide access and per-workspace roles. Changes apply immediately.
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

          {showAdminToggle ? (
            <div className="space-y-2">
              <p className="text-label text-fg-secondary font-semibold tracking-wide uppercase">
                Agency admin
              </p>
              <label className="text-body text-fg-primary flex items-center gap-2">
                <input
                  type="checkbox"
                  name="isAgencyAdmin"
                  defaultChecked={subject.isAgencyAdmin}
                  className="h-4 w-4"
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

          <fieldset className="space-y-2">
            <legend className="text-label text-fg-secondary font-semibold tracking-wide uppercase">
              Workspace roles
            </legend>
            {workspaces.length === 0 ? (
              <p className="text-body text-fg-muted">No workspaces in this agency yet.</p>
            ) : (
              workspaces.map((w) => (
                <div key={w.id} className="flex items-center gap-3">
                  <span className="text-body text-fg-primary w-44 truncate">{w.name}</span>
                  <select
                    value={grants[w.id] ?? ""}
                    onChange={(e) => setGrants((prev) => ({ ...prev, [w.id]: e.target.value }))}
                    className="border-border bg-surface text-fg-primary text-body rounded-[var(--radius-control)] border px-2 py-1"
                    aria-label={`Role for ${w.name}`}
                  >
                    <option value="">No access</option>
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))
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

        <input type="hidden" name="workspaceRoles" value={grantsJson} />

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
