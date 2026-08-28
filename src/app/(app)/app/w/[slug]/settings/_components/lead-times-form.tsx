"use client";
import * as React from "react";
import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { updateLeadTimesSettingsAction, type SettingsActionState } from "../actions";
import { LeadTimeTimeline } from "./lead-time-timeline";

/**
 * LeadTimesForm — per-section form for the Settings → Lead
 * Times page. Each lead time is the number of business days
 * between two adjacent workflow stages:
 *
 *   - contentApprovalLeadDays      Brief → Content review
 *   - designCompleteLeadDays       Design → Creative review
 *   - creativeApprovalLeadDays     Creative → Client review (when
 *                                  approvalMode = internal_then_client)
 *   - readyToPublishLeadDays        Client review → publish-ready
 *
 * The 4 numbers drive every "auto-suggest a planned date" the
 * planning surface shows. Wrong values compound across the
 * workflow; a 2-day buffer on every stage adds 8 business days
 * to the post's total cycle time.
 *
 * The LeadTimeTimeline component (sibling) renders the same
 * numbers as a visual bar so the planner can see the cumulative
 * effect of the 4 buffers at a glance.
 */
export interface LeadTimeValues {
  contentApprovalLeadDays: number;
  designCompleteLeadDays: number;
  creativeApprovalLeadDays: number;
  readyToPublishLeadDays: number;
}

export function LeadTimesForm({ slug, values }: { slug: string; values: LeadTimeValues }) {
  const action = updateLeadTimesSettingsAction.bind(null, slug);
  const [state, formAction] = useActionState<SettingsActionState, FormData>(action, {});
  const [draft, setDraft] = React.useState<LeadTimeValues>(values);

  const total = Object.values(draft).reduce((sum, n) => sum + n, 0);

  return (
    <Card padding="md" data-testid="lead-times-form-card">
      <form action={formAction} className="space-y-6">
        <p className="text-body text-fg-secondary max-w-3xl" data-testid="lead-times-total">
          Total cycle time: <span className="text-fg-primary font-bold">{total} business days</span>{" "}
          from brief to publish-ready. Each lead time is the buffer between an adjacent pair of
          workflow stages.
        </p>
        <LeadTimeTimeline values={draft} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <LeadTimeField
            id="settings-lead-content"
            name="contentApprovalLeadDays"
            label="Content approval"
            help="Brief → Content review. Time for the writer's first pass to be reviewed by the content lead."
            value={draft.contentApprovalLeadDays}
            onChange={(v) => setDraft({ ...draft, contentApprovalLeadDays: v })}
          />
          <LeadTimeField
            id="settings-lead-design"
            name="designCompleteLeadDays"
            label="Design complete"
            help="Design → Creative review. Time for the designer to produce first-pass art for the brief."
            value={draft.designCompleteLeadDays}
            onChange={(v) => setDraft({ ...draft, designCompleteLeadDays: v })}
          />
          <LeadTimeField
            id="settings-lead-creative"
            name="creativeApprovalLeadDays"
            label="Creative approval"
            help="Creative review &rarr; Client review. Time for the creative director to sign off."
            value={draft.creativeApprovalLeadDays}
            onChange={(v) => setDraft({ ...draft, creativeApprovalLeadDays: v })}
          />
          <LeadTimeField
            id="settings-lead-publish"
            name="readyToPublishLeadDays"
            label="Ready to publish"
            help="Client review → publish-ready. Last-pass polish + copy review."
            value={draft.readyToPublishLeadDays}
            onChange={(v) => setDraft({ ...draft, readyToPublishLeadDays: v })}
          />
        </div>
        {state.error ? (
          <p
            role="alert"
            data-testid="lead-times-form-error"
            className="text-body text-danger font-semibold"
          >
            {state.error}
          </p>
        ) : null}
        {state.saved ? (
          <p
            role="status"
            data-testid="lead-times-form-saved"
            className="text-body text-success font-semibold"
          >
            Lead times saved.
          </p>
        ) : null}
        <div className="flex justify-end">
          <FormSubmitButton label="Save lead times" pendingLabel="Saving…" />
        </div>
      </form>
    </Card>
  );
}

function LeadTimeField({
  id,
  name,
  label,
  help,
  value,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  help: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <FormField id={id} label={label} required hint={help}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          name={name}
          type="number"
          min={0}
          max={90}
          required
          aria-required="true"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
        />
        <span className="text-label text-fg-muted shrink-0">days</span>
      </div>
    </FormField>
  );
}
