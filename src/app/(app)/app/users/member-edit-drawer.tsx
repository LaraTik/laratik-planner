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
import { roleDescription, roleKey, roleLabel } from "@/lib/auth/role-labels";
import { MemberAuditPanel, type MemberAuditEntry } from "@/components/team/member-audit-panel";

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
  /** Restricts a workspace manager's role save to this workspace. */
  roleScopeWorkspaceId?: string;
  /** The signed-in user's id; used to hide the self-admin lockout UI. */
  actorUserId: string;
  workspaces: MemberEditWorkspace[];
  /**
   * Recent access changes for the subject. Surfaced in the drawer's
   * audit panel so the actor can see what's already happened before
   * applying another change. Empty when no prior edits exist.
   */
  audit?: readonly MemberAuditEntry[];
  onOpenChange: (open: boolean) => void;
  /**
   * Optional translator. When provided, every user-visible string
   * (drawer title + description, section labels, the role help,
   * the action buttons, etc.) renders from the `users.memberEdit`
   * and `team.role.*` catalog keys; when omitted, the stored
   * English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
};

export function MemberEditDrawer({
  subject,
  actorIsAgencyAdmin,
  roleScopeWorkspaceId,
  actorUserId,
  workspaces,
  audit,
  onOpenChange,
  t,
}: MemberEditDrawerProps) {
  return (
    <Dialog
      open={subject !== null}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      <DialogContent
        // Inline-end slide-in (override the centered default).
        //
        // LAYOUT CONTRACT — the container is `flex flex-col` + `overflow-hidden`
        // and the header, scroll body, and footer are three flex SIBLINGS with
        // exactly one scroll region (the body). This is not cosmetic: the
        // previous version made DialogContent itself the scroll container and
        // marked the header/footer `sticky` inside it. Sticky elements overlay
        // their siblings' content, so the footer's 72px band sat on top of the
        // bottom of the role matrix and the header's 126px band sat on top of
        // the top. Measured at a 720px viewport: the first workspace's `viewer`
        // chip occupied y=640–670 while the sticky footer occupied y=648–720,
        // so `document.elementFromPoint` at the chip's centre returned the
        // FOOTER — the click was swallowed and the role never got selected.
        // That is the "assigning permission does nothing on /app/users" bug:
        // the action was never reached because the click landed on chrome.
        //
        // Sibling layout removes the overlap band entirely rather than
        // compensating for it with padding, so every chip stays clickable and
        // keyboard focus is never obscured (WCAG 2.2 AA `focus-not-obscured`).
        // Same shape as `components/planning/ai-assistance-panel.tsx`.
        className="bg-surface border-border fixed start-auto end-0 top-0 bottom-0 z-50 flex h-full w-full max-w-[560px] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-s border-e-0 border-t-0 border-b-0 p-0 shadow-xl"
        data-testid="member-edit-drawer"
      >
        {subject ? (
          <MemberEditForm
            key={subject.id}
            subject={subject}
            actorIsAgencyAdmin={actorIsAgencyAdmin}
            actorUserId={actorUserId}
            workspaces={workspaces}
            {...(audit ? { audit } : {})}
            {...(roleScopeWorkspaceId ? { roleScopeWorkspaceId } : {})}
            onClose={() => onOpenChange(false)}
            {...(t !== undefined ? { t } : {})}
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
  audit?: readonly MemberAuditEntry[];
  roleScopeWorkspaceId?: string;
  onClose: () => void;
  t?: (key: string, params?: Record<string, string | number>) => string;
};

const initialState: MemberEditState = {};

function MemberEditForm({
  subject,
  actorIsAgencyAdmin,
  actorUserId,
  workspaces,
  audit,
  roleScopeWorkspaceId,
  onClose,
  t,
}: FormProps) {
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t ? t(key, params) : fallback;
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
      <DialogHeader className="border-border bg-surface shrink-0 border-b px-6 py-4">
        <DialogTitle>
          {tr("users.memberEdit.title", `Edit ${subject.name}`, { name: subject.name })}
        </DialogTitle>
        <DialogDescription>
          {tr(
            roleScopeWorkspaceId
              ? "users.memberEdit.scopedDescription"
              : "users.memberEdit.description",
            roleScopeWorkspaceId
              ? "Adjust this workspace's roles. Agency-wide access can only be changed by an agency administrator."
              : "Adjust agency-wide access and per-workspace roles. Each workspace can hold any number of roles — pick the ones that match what this person actually does.",
          )}
        </DialogDescription>
      </DialogHeader>

      <form action={rolesFormAction} className="flex min-h-0 flex-1 flex-col">
        {roleScopeWorkspaceId ? (
          <input type="hidden" name="roleScopeWorkspaceId" value={roleScopeWorkspaceId} />
        ) : null}
        {/* The single scroll region of the drawer — see the layout contract on
            DialogContent. `min-h-0` lets this shrink below its content height
            inside the flex column, which is what makes `overflow-y-auto` bite
            instead of the parent growing past the viewport. */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <ReadOnlyField label={tr("users.memberEdit.emailLabel", "Email")} value={subject.email} />
          <ReadOnlyField
            label={tr("users.memberEdit.statusLabel", "Status")}
            value={
              subject.status === "active"
                ? tr("users.memberEdit.statusActive", "Active")
                : tr("users.memberEdit.statusDeactivated", "Deactivated")
            }
            trailing={
              subject.status === "active" ? (
                <Badge variant="success">{tr("users.memberEdit.statusActive", "Active")}</Badge>
              ) : (
                <Badge variant="default">
                  {tr("users.memberEdit.statusDeactivated", "Deactivated")}
                </Badge>
              )
            }
          />
          <ReadOnlyField
            label={tr("users.memberEdit.currentEffectiveRolesLabel", "Current effective roles")}
            value={(() => {
              const withAccess = workspaces.filter((w) => w.currentRoles.length > 0).length;
              if (effectiveRoles.length === 0) {
                return tr(
                  roleScopeWorkspaceId
                    ? "users.memberEdit.currentEffectiveRolesNoneScoped"
                    : "users.memberEdit.currentEffectiveRolesNone",
                  roleScopeWorkspaceId
                    ? "No access in this workspace"
                    : "No access in any workspace",
                );
              }
              if (withAccess === 1) {
                return tr(
                  "users.memberEdit.currentEffectiveRolesOne",
                  `${effectiveRoles.length} role across 1 workspace`,
                  { count: effectiveRoles.length, workspaces: 1 },
                );
              }
              return tr(
                "users.memberEdit.currentEffectiveRolesMany",
                `${effectiveRoles.length} roles across ${withAccess} workspaces`,
                { count: effectiveRoles.length, workspaces: withAccess },
              );
            })()}
          />

          {showAdminToggle ? (
            <div className="space-y-2">
              <p className="text-label text-fg-secondary font-semibold tracking-wide uppercase">
                {tr("users.memberEdit.agencyAdminTitle", "Agency admin")}
              </p>
              <label className="text-body text-fg-primary flex items-center gap-2">
                <Checkbox
                  name="isAgencyAdmin"
                  defaultChecked={subject.isAgencyAdmin}
                  data-testid="member-edit-is-agency-admin"
                />
                {tr("users.memberEdit.grantAdmin", "Grant agency administrator access")}
              </label>
              <p className="text-label text-fg-muted">
                {tr(
                  "users.memberEdit.adminHelp",
                  "Submitting this section flips the flag. The role form below is unaffected.",
                )}
              </p>
              <div>
                <FormSubmitButton
                  formAction={adminFormAction}
                  size="sm"
                  variant="secondary"
                  label={tr("users.memberEdit.applyAdminChange", "Apply admin change")}
                  pendingLabel={tr("users.memberEdit.applyingAdmin", "Applying…")}
                />
              </div>
            </div>
          ) : null}

          <fieldset className="space-y-3">
            <legend className="text-label text-fg-secondary font-semibold tracking-wide uppercase">
              {tr("users.memberEdit.workspaceRolesTitle", "Workspace roles")}
            </legend>
            <p className="text-label text-fg-muted">
              {tr(
                "users.memberEdit.workspaceRolesHelp",
                "Each role grants a specific capability in that workspace. Hold a role with responsibility for any of the workflow steps it controls.",
              )}
            </p>
            {workspaces.length === 0 ? (
              <p className="text-body text-fg-muted">
                {tr("users.memberEdit.noWorkspacesInAgency", "No workspaces in this agency yet.")}
              </p>
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
                    {tr("users.memberEdit.roleHelp", "What does each role do?")}
                  </summary>
                  <ul className="text-label text-fg-secondary mt-2 space-y-1 ps-4">
                    {workspaceRoleSchema.options.map((role) => (
                      <li key={role}>
                        <span className="text-fg-primary font-semibold">
                          {tr(roleKey(role), roleLabel(role))}
                        </span>
                        <span className="text-fg-muted mx-1">—</span>
                        <span>{roleDescription(role)}</span>
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

          <MemberAuditPanel
            entries={audit ?? []}
            {...(t ? { t } : {})}
            dataTestId={`member-edit-audit-${subject.id}`}
          />
        </div>

        <DialogFooter className="border-border bg-surface shrink-0 border-t px-6 py-4">
          <Button type="button" variant="ghost" onClick={onClose} data-testid="member-edit-cancel">
            {tr("common.cancel", "Cancel")}
          </Button>
          <FormSubmitButton
            label={tr("users.memberEdit.saveChanges", "Save changes")}
            pendingLabel={tr("users.memberEdit.saving", "Saving…")}
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
