"use client";

import * as React from "react";
import { Link2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { DirAwareInput } from "@/components/forms/dir-aware-textarea";
import { renameWorkspaceAction, type RenameWorkspaceActionState } from "../actions";
import { WORKSPACE_NAME_MAX_LENGTH } from "@/lib/workspaces/rename-command";

export type RenameWorkspaceCopy = {
  title: string;
  description: string;
  nameLabel: string;
  nameHint: string;
  urlLabel: string;
  urlHint: string;
  submit: string;
  saving: string;
  saved: string;
  unchanged: string;
  errors: Record<NonNullable<RenameWorkspaceActionState["error"]>, string>;
};

/**
 * WorkspaceNameForm — edits `workspace.name` (the display name).
 *
 * The slug is rendered next to the field as read-only rather than
 * hidden. A manager renaming "old-name" to "Lara Tik" reasonably
 * expects the URL to follow, so the card states plainly that it does
 * not, instead of leaving them to discover it from a stale bookmark.
 * See `lib/workspaces/rename-command.ts` for why the slug stays
 * immutable without a redirect table.
 *
 * Copy arrives as a prop rather than via `useLocaleT` so this form
 * follows the same pattern as `MetaPublishingForm`: the server page
 * resolves the strings, and the component stays free of catalog
 * lookups it cannot exercise in isolation.
 */
export function WorkspaceNameForm({
  slug,
  name,
  locale,
  canManage,
  copy,
}: {
  slug: string;
  name: string;
  locale: string;
  canManage: boolean;
  copy: RenameWorkspaceCopy;
}) {
  if (!canManage) {
    return (
      <Card padding="md" data-testid="workspace-name-card">
        <div className="space-y-1">
          <h3 className="text-title-card text-fg-primary font-semibold">{copy.title}</h3>
          <p className="text-body text-fg-secondary">{copy.description}</p>
          <p className="text-body text-fg-primary mt-2" data-testid="workspace-name-readonly">
            {name}
          </p>
        </div>
      </Card>
    );
  }

  return <WorkspaceNameFormFields slug={slug} name={name} locale={locale} copy={copy} />;
}

/**
 * Split out so the `useActionState` + `useEffect` hooks are not
 * mounted in the read-only branch above. Both branches render the
 * same card, and the read-only branch must stay hook-free so a
 * planner without `workspace_manager` never instantiates a form
 * bound to an action they are not allowed to call.
 */
function WorkspaceNameFormFields({
  slug,
  name,
  locale,
  copy,
}: {
  slug: string;
  name: string;
  locale: string;
  copy: RenameWorkspaceCopy;
}) {
  const action = renameWorkspaceAction.bind(null, slug);
  const [state, formAction] = React.useActionState<RenameWorkspaceActionState, FormData>(
    action,
    {},
  );
  // Controlled so a successful rename leaves the field showing the
  // value that is actually stored. Without this the input keeps the
  // operator's draft text even when the server normalised it
  // (collapsed whitespace) or rejected it.
  const [draft, setDraft] = React.useState(name);
  const [syncedName, setSyncedName] = React.useState(name);

  // React's documented "adjust state when a prop changes" pattern:
  // reconcile during render rather than in an effect, so the field
  // never renders one frame with a stale draft. The `syncedName`
  // guard makes this fire once per distinct server value instead of
  // on every re-render.
  if (state.name && state.name !== syncedName) {
    setSyncedName(state.name);
    setDraft(state.name);
  }

  return (
    <Card padding="md" data-testid="workspace-name-card">
      <form action={formAction} className="space-y-6">
        <div className="space-y-1">
          <h3 className="text-title-card text-fg-primary font-semibold">{copy.title}</h3>
          <p className="text-body text-fg-secondary">{copy.description}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            id="settings-workspace-name"
            label={copy.nameLabel}
            hint={copy.nameHint}
            required
          >
            <DirAwareInput
              name="name"
              locale={locale}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              maxLength={WORKSPACE_NAME_MAX_LENGTH}
              required
            />
          </FormField>

          {/* Not a `FormField`: it is not an editable control, and
              `FormField` cloneElements `aria-required` / `id` onto
              its child, which would put form-state attributes on a
              static paragraph. */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="settings-workspace-url">{copy.urlLabel}</Label>
            <p
              id="settings-workspace-url"
              data-testid="workspace-name-slug"
              dir="ltr"
              className="border-border bg-surface-subtle text-body text-fg-secondary flex h-10 items-center gap-2 overflow-hidden rounded-[var(--radius-control)] border px-3"
            >
              <Link2 className="text-fg-muted h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">/app/w/{slug}</span>
            </p>
            <p id="settings-workspace-url-hint" className="text-label text-fg-muted">
              {copy.urlHint}
            </p>
          </div>
        </div>

        {state.error ? (
          <p
            role="alert"
            data-testid="workspace-name-error"
            className="text-body text-danger font-semibold"
          >
            {copy.errors[state.error]}
          </p>
        ) : null}
        {state.unchanged ? (
          <p
            role="status"
            data-testid="workspace-name-unchanged"
            className="text-body text-fg-secondary font-semibold"
          >
            {copy.unchanged}
          </p>
        ) : null}
        {state.saved ? (
          <p
            role="status"
            data-testid="workspace-name-saved"
            className="text-body text-success font-semibold"
          >
            {copy.saved}
          </p>
        ) : null}

        <div className="flex justify-end">
          <FormSubmitButton label={copy.submit} pendingLabel={copy.saving} />
        </div>
      </form>
    </Card>
  );
}
