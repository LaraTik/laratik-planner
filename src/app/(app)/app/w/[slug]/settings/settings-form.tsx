"use client";

import { useActionState } from "react";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { updateWorkspaceSettingsAction, type SettingsActionState } from "./actions";

type PersonOption = { id: string; label: string };

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
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Timezone">
          <input name="timezone" defaultValue={values.timezone} required className={controlClass} />
        </Field>
        <Field label="Monthly target">
          <input
            name="monthlyTarget"
            type="number"
            min={1}
            max={10000}
            defaultValue={values.monthlyTarget ?? ""}
            className={controlClass}
          />
        </Field>
        <Field label="Approval mode">
          <select name="approvalMode" defaultValue={values.approvalMode} className={controlClass}>
            <option value="simple">Internal approval only</option>
            <option value="internal_then_client">Internal, then client</option>
          </select>
        </Field>
      </div>
      <fieldset>
        <legend className="text-title-card font-semibold">Lead times (days)</legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField
            name="contentApprovalLeadDays"
            label="Content approval"
            value={values.contentApprovalLeadDays}
          />
          <NumberField
            name="designCompleteLeadDays"
            label="Design complete"
            value={values.designCompleteLeadDays}
          />
          <NumberField
            name="creativeApprovalLeadDays"
            label="Creative approval"
            value={values.creativeApprovalLeadDays}
          />
          <NumberField
            name="readyToPublishLeadDays"
            label="Ready to publish"
            value={values.readyToPublishLeadDays}
          />
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-title-card font-semibold">Default assignments</legend>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <PersonField
            name="defaultDesignerId"
            label="Designer"
            value={values.defaultDesignerId}
            options={designers}
          />
          <PersonField
            name="defaultContentReviewerId"
            label="Content reviewer"
            value={values.defaultContentReviewerId}
            options={internalReviewers}
          />
          <PersonField
            name="defaultInternalCreativeReviewerId"
            label="Internal creative reviewer"
            value={values.defaultInternalCreativeReviewerId}
            options={internalReviewers}
          />
          <PersonField
            name="defaultClientReviewerId"
            label="Client reviewer"
            value={values.defaultClientReviewerId}
            options={clientReviewers}
          />
        </div>
      </fieldset>
      {state.error ? (
        <p role="alert" className="text-body text-danger">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" className="text-body text-success">
          Workspace defaults saved.
        </p>
      ) : null}
      <FormSubmitButton label="Save defaults" pendingLabel="Saving…" />
    </form>
  );
}

const controlClass =
  "border-border bg-canvas text-body mt-1.5 h-10 w-full rounded-[var(--radius-control)] border px-3";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-label text-fg-primary font-semibold">
      {label}
      {children}
    </label>
  );
}
function NumberField({ name, label, value }: { name: string; label: string; value: number }) {
  return (
    <Field label={label}>
      <input
        name={name}
        type="number"
        min={0}
        max={90}
        required
        defaultValue={value}
        className={controlClass}
      />
    </Field>
  );
}
function PersonField({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string | null;
  options: PersonOption[];
}) {
  return (
    <Field label={label}>
      <select name={name} defaultValue={value ?? ""} className={controlClass}>
        <option value="">No default</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
