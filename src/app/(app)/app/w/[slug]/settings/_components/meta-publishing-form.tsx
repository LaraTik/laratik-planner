"use client";

import * as React from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { updateMetaPublishingSettingsAction, type MetaPublishingActionState } from "../actions";

export type MetaPublishingSettingsCopy = {
  fieldLabel: string;
  fieldHint: string;
  disabledHint: string;
  enabledHint: string;
  submit: string;
  saved: string;
  errors: Record<NonNullable<MetaPublishingActionState["error"]>, string>;
};

export function MetaPublishingForm({
  slug,
  enabled,
  copy,
}: {
  slug: string;
  enabled: boolean;
  copy: MetaPublishingSettingsCopy;
}) {
  const action = updateMetaPublishingSettingsAction.bind(null, slug);
  const [state, formAction] = React.useActionState<MetaPublishingActionState, FormData>(action, {});
  const [checked, setChecked] = React.useState(enabled);

  return (
    <Card padding="md" data-testid="meta-publishing-settings-form">
      <form action={formAction} className="space-y-6">
        <div className="border-border bg-surface-subtle flex items-start gap-3 rounded-[var(--radius-card)] border p-4">
          <ShieldCheck className="text-primary mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <label
              htmlFor="settings-meta-publishing-enabled"
              className="text-body text-fg-primary inline-flex min-h-11 cursor-pointer items-center gap-3 font-semibold"
            >
              <Checkbox
                id="settings-meta-publishing-enabled"
                name="metaPublishingEnabled"
                value="on"
                checked={checked}
                onCheckedChange={(next) => setChecked(next === true)}
                aria-describedby="settings-meta-publishing-help"
              />
              {copy.fieldLabel}
            </label>
            <p id="settings-meta-publishing-help" className="text-body text-fg-secondary mt-1">
              {copy.fieldHint}
            </p>
          </div>
        </div>

        <p className="border-border bg-info-subtle text-body text-fg-secondary flex items-start gap-2 rounded-[var(--radius-control)] border p-3">
          <CheckCircle2 className="text-info mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {checked ? copy.enabledHint : copy.disabledHint}
        </p>

        {state.error ? (
          <p
            role="alert"
            className="text-body text-danger font-semibold"
            data-testid="meta-publishing-settings-error"
          >
            {copy.errors[state.error]}
          </p>
        ) : null}
        {state.saved ? (
          <p
            role="status"
            className="text-body text-success font-semibold"
            data-testid="meta-publishing-settings-saved"
          >
            {copy.saved}
          </p>
        ) : null}

        <div className="flex justify-end">
          <FormSubmitButton label={copy.submit} pendingLabel={copy.submit} />
        </div>
      </form>
    </Card>
  );
}
