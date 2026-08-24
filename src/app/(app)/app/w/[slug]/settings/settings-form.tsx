"use client";

import * as React from "react";
import { useActionState } from "react";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Label } from "@/components/ui/label";
import { updateWorkspaceSettingsAction, type SettingsActionState } from "./actions";

type PersonOption = { id: string; label: string };

/**
 * Workspace settings form. Renders inside a single Card on the
 * settings page; the left-rail nav is sticky and uses anchor links
 * (`#lifecycle`, `#lead-times`, `#defaults`, `#approvals`).
 *
 * Polished per the Stitch design (`2f6acd26`) + §18 form rules:
 *   - Every control has a `<Label htmlFor>` + `id` association
 *   - Required fields show the `*` marker + `aria-required`
 *   - The select / number / text inputs all use the focus-ring token
 *   - Save button is `disabled` + `aria-busy` while pending
 *   - Errors are announced via `role="alert"`; success via
 *     `role="status"` (so screen readers read it without stealing focus)
 *
 * Fieldsets group the "Lead times" and "Default assignments" sections
 * visually + semantically — the legend is the section title.
 */
export function SettingsForm({
  slug,
  values,
  designers,
  internalReviewers,
  clientReviewers,
}: {
  slug: string;
  values: {
    timezone: string;
    approvalMode: string;
    monthlyTarget: number | null;
    contentApprovalLeadDays: number;
    designCompleteLeadDays: number;
    creativeApprovalLeadDays: number;
    readyToPublishLeadDays: number;
    defaultDesignerId: string | null;
    defaultContentReviewerId: string | null;
    defaultInternalCreativeReviewerId: string | null;
    defaultClientReviewerId: string | null;
  };
  designers: PersonOption[];
  internalReviewers: PersonOption[];
  clientReviewers: PersonOption[];
}) {
  const action = updateWorkspaceSettingsAction.bind(null, slug);
  const [state, formAction] = useActionState<SettingsActionState, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-6" data-testid="workspace-settings-form">
      <div className="grid scroll-mt-20 gap-4 md:grid-cols-2" id="lifecycle">
        <div className="space-y-1.5">
          <Label htmlFor="settings-timezone">
            Timezone
            <span aria-hidden="true" className="text-danger ml-0.5">
              *
            </span>
          </Label>
          <input
            id="settings-timezone"
            name="timezone"
            defaultValue={values.timezone}
            required
            aria-required="true"
            autoComplete="off"
            className={controlClass}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="settings-monthly-target">Monthly target</Label>
          <p className="text-label text-fg-muted -mt-0.5">Optional · posts per month</p>
          <input
            id="settings-monthly-target"
            name="monthlyTarget"
            type="number"
            min={1}
            max={10000}
            defaultValue={values.monthlyTarget ?? ""}
            className={controlClass}
          />
        </div>
      </div>
      <fieldset id="lead-times" className="border-border scroll-mt-20 border-t pt-6">
        <legend className="text-title-card text-fg-primary font-semibold">Lead times (days)</legend>
        <p className="text-label text-fg-muted mt-1">
          Buffer between each workflow stage. Larger buffers give the team more review time.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField
            id="settings-lead-content"
            name="contentApprovalLeadDays"
            label="Content approval"
            value={values.contentApprovalLeadDays}
          />
          <NumberField
            id="settings-lead-design"
            name="designCompleteLeadDays"
            label="Design complete"
            value={values.designCompleteLeadDays}
          />
          <NumberField
            id="settings-lead-creative"
            name="creativeApprovalLeadDays"
            label="Creative approval"
            value={values.creativeApprovalLeadDays}
          />
          <NumberField
            id="settings-lead-publish"
            name="readyToPublishLeadDays"
            label="Ready to publish"
            value={values.readyToPublishLeadDays}
          />
        </div>
      </fieldset>
      <fieldset id="defaults" className="border-border scroll-mt-20 border-t pt-6">
        <legend className="text-title-card text-fg-primary font-semibold">
          Default assignments
        </legend>
        <p className="text-label text-fg-muted mt-1">
          Pre-fill these people on every new idea. Override per idea at any time.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <PersonField
            id="settings-default-designer"
            name="defaultDesignerId"
            label="Designer"
            value={values.defaultDesignerId}
            options={designers}
          />
          <PersonField
            id="settings-default-content-reviewer"
            name="defaultContentReviewerId"
            label="Content reviewer"
            value={values.defaultContentReviewerId}
            options={internalReviewers}
          />
          <PersonField
            id="settings-default-internal-creative"
            name="defaultInternalCreativeReviewerId"
            label="Internal creative reviewer"
            value={values.defaultInternalCreativeReviewerId}
            options={internalReviewers}
          />
          <PersonField
            id="settings-default-client-reviewer"
            name="defaultClientReviewerId"
            label="Client reviewer"
            value={values.defaultClientReviewerId}
            options={clientReviewers}
          />
        </div>
      </fieldset>
      <fieldset id="approvals" className="border-border scroll-mt-20 border-t pt-6">
        <legend className="text-title-card text-fg-primary font-semibold">Approval mode</legend>
        <p className="text-label text-fg-muted mt-1">
          Choose how many approval steps a piece of content needs before publish.
        </p>
        <div className="mt-3 max-w-md space-y-1.5">
          <Label htmlFor="settings-approval-mode">Mode</Label>
          <select
            id="settings-approval-mode"
            name="approvalMode"
            defaultValue={values.approvalMode}
            className={controlClass}
          >
            <option value="simple">Internal approval only</option>
            <option value="internal_then_client">Internal, then client</option>
          </select>
        </div>
      </fieldset>
      {state.error ? (
        <p
          role="alert"
          data-testid="settings-error"
          className="text-body text-danger font-semibold"
        >
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p
          role="status"
          data-testid="settings-saved"
          className="text-body text-success font-semibold"
        >
          Workspace defaults saved.
        </p>
      ) : null}
      <div className="flex justify-end">
        <FormSubmitButton label="Save defaults" pendingLabel="Saving…" />
      </div>
    </form>
  );
}

// Token-driven control class — matches the channels/team form
// patterns: border, 10px radius, 40px height, focus ring on the
// `--color-focus-ring` token, surface background, body text.
const controlClass =
  "border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none";

/**
 * Standalone labelled control used by the lead-times grid. Owns its
 * own `<Label htmlFor>` + `id` association so the label is clickable
 * and the screen-reader experience matches the visible hierarchy.
 */
function NumberField({
  id,
  name,
  label,
  value,
}: {
  id: string;
  name: string;
  label: string;
  value: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        <span aria-hidden="true" className="text-danger ml-0.5">
          *
        </span>
      </Label>
      <input
        id={id}
        name={name}
        type="number"
        min={0}
        max={90}
        required
        aria-required="true"
        defaultValue={value}
        className={controlClass}
      />
    </div>
  );
}

function PersonField({
  id,
  name,
  label,
  value,
  options,
}: {
  id: string;
  name: string;
  label: string;
  value: string | null;
  options: PersonOption[];
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <p className="text-label text-fg-muted -mt-0.5">Optional</p>
      <select id={id} name={name} defaultValue={value ?? ""} className={controlClass}>
        <option value="">No default</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
