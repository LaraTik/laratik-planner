"use client";
import * as React from "react";
import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { updateDefaultsSettingsAction, type SettingsActionState } from "../actions";

type PersonOption = { id: string; label: string };

/**
 * DefaultsForm — per-section form for the Settings → Default
 * assignments page. The 4 default-assignee fields pre-fill the
 * matching role on every new content item; per-item overrides
 * always win.
 *
 * The role gates: only an active member with the matching
 * workspace role appears in each dropdown. A "No default"
 * option lets the manager leave a slot empty (the planner
 * picks on a per-item basis).
 */
export function DefaultsForm({
  slug,
  designers,
  contentReviewers,
  internalCreativeReviewers,
  clientReviewers,
  values,
}: {
  slug: string;
  designers: PersonOption[];
  contentReviewers: PersonOption[];
  internalCreativeReviewers: PersonOption[];
  clientReviewers: PersonOption[];
  values: {
    defaultDesignerId: string | null;
    defaultContentReviewerId: string | null;
    defaultInternalCreativeReviewerId: string | null;
    defaultClientReviewerId: string | null;
  };
}) {
  const action = updateDefaultsSettingsAction.bind(null, slug);
  const [state, formAction] = useActionState<SettingsActionState, FormData>(action, {});

  return (
    <Card padding="md" data-testid="defaults-form-card">
      <form action={formAction} className="space-y-6">
        <p className="text-body text-fg-secondary max-w-3xl">
          Pre-fill these people on every new idea. Override per idea at any time — the default is a
          shortcut, not a rule.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <PersonField
            id="settings-default-designer"
            name="defaultDesignerId"
            label="Designer"
            help="Pre-fills the designer field on the Quick Create form."
            value={values.defaultDesignerId}
            options={designers}
          />
          <PersonField
            id="settings-default-content-reviewer"
            name="defaultContentReviewerId"
            label="Content reviewer"
            help="The first-pass reviewer on the brief. Usually the content lead."
            value={values.defaultContentReviewerId}
            options={contentReviewers}
          />
          <PersonField
            id="settings-default-internal-creative"
            name="defaultInternalCreativeReviewerId"
            label="Internal creative reviewer"
            help="The creative director. Only used when approval mode is 'Internal, then client'."
            value={values.defaultInternalCreativeReviewerId}
            options={internalCreativeReviewers}
          />
          <PersonField
            id="settings-default-client-reviewer"
            name="defaultClientReviewerId"
            label="Client reviewer"
            help="The client's primary approver. Appears in the 'Client review' step."
            value={values.defaultClientReviewerId}
            options={clientReviewers}
          />
        </div>
        {state.error ? (
          <p
            role="alert"
            data-testid="defaults-form-error"
            className="text-body text-danger font-semibold"
          >
            {state.error}
          </p>
        ) : null}
        {state.saved ? (
          <p
            role="status"
            data-testid="defaults-form-saved"
            className="text-body text-success font-semibold"
          >
            Default assignments saved.
          </p>
        ) : null}
        <div className="flex justify-end">
          <FormSubmitButton label="Save defaults" pendingLabel="Saving…" />
        </div>
      </form>
    </Card>
  );
}

function PersonField({
  id,
  name,
  label,
  help,
  value,
  options,
}: {
  id: string;
  name: string;
  label: string;
  help: string;
  value: string | null;
  options: PersonOption[];
}) {
  return (
    <FormField id={id} label={label} hint={help}>
      <select
        id={id}
        name={name}
        defaultValue={value ?? ""}
        className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
      >
        <option value="">No default</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </FormField>
  );
}
