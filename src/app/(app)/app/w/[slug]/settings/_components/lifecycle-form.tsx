"use client";
import * as React from "react";
import { useActionState } from "react";
import { TimezoneCombobox } from "@/components/forms/timezone-combobox";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Card } from "@/components/ui/card";
import { updateLifecycleSettingsAction, type SettingsActionState } from "../actions";

/**
 * LifecycleForm — per-section form for the Settings → Lifecycle
 * page. The Lifecycle section is the workspace identity for
 * scheduling: the timezone the calendar and lead-time math use,
 * and the optional monthly content target the planning KPIs
 * surface. Both fields are independent of the lead times and
 * assignment defaults; the form saves only what this page
 * owns.
 *
 * Per the Settings refactor (Phase A): each section gets its own
 * form with its own server action so the page is focused and
 * the action's Zod payload only carries the fields this page
 * edits. The DB row is still the same `workspace_settings` row
 * (the master prompt's "data is one row" rule); the action does
 * an UPSERT on the partial field set.
 */
export function LifecycleForm({
  slug,
  timezone,
  monthlyTarget,
}: {
  slug: string;
  timezone: string;
  monthlyTarget: number | null;
}) {
  const action = updateLifecycleSettingsAction.bind(null, slug);
  const [state, formAction] = useActionState<SettingsActionState, FormData>(action, {});
  const [tz, setTz] = React.useState(timezone);

  return (
    <Card padding="md" data-testid="lifecycle-form-card">
      <form action={formAction} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            id="settings-timezone"
            label="Timezone"
            required
            hint="Used for the calendar, lead-time math, and any 'X days from now' view."
          >
            <TimezoneCombobox
              id="settings-timezone"
              name="timezone"
              value={tz}
              onChange={setTz}
              required
            />
          </FormField>
          <div className="space-y-1.5">
            <FormField
              id="settings-monthly-target"
              label="Monthly content target"
              hint="Optional. The planning KPI bar uses this to colour on-track / at risk / off-track."
            >
              <input
                id="settings-monthly-target"
                name="monthlyTarget"
                type="number"
                min={1}
                max={10000}
                defaultValue={monthlyTarget ?? ""}
                placeholder="e.g. 24"
                className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
              />
            </FormField>
            <p className="text-label text-fg-muted">
              Posts per month. Leave blank if you don&apos;t plan against a target.
            </p>
          </div>
        </div>
        {state.error ? (
          <p
            role="alert"
            data-testid="lifecycle-form-error"
            className="text-body text-danger font-semibold"
          >
            {state.error}
          </p>
        ) : null}
        {state.saved ? (
          <p
            role="status"
            data-testid="lifecycle-form-saved"
            className="text-body text-success font-semibold"
          >
            Lifecycle settings saved.
          </p>
        ) : null}
        <div className="flex justify-end">
          <FormSubmitButton label="Save lifecycle" pendingLabel="Saving…" />
        </div>
      </form>
    </Card>
  );
}
