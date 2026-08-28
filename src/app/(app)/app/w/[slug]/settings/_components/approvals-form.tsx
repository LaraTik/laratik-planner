"use client";
import * as React from "react";
import { useActionState } from "react";
import { Check, Users, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { cn } from "@/lib/utils";
import { updateApprovalsSettingsAction, type SettingsActionState } from "../actions";

/**
 * ApprovalsForm — per-section form for the Settings → Approval
 * mode page. The mode picker decides how many approval steps a
 * piece of content goes through before publish:
 *
 *   - "simple"                Internal review only. One approver.
 *   - "internal_then_client"  Internal review, then client review.
 *                            Two approvers. Adds 2-5 business days
 *                            to the cycle (the readyToPublish
 *                            lead time usually absorbs most of
 *                            it).
 *
 * The card layout makes the trade-off visible so a manager
 * can pick the right mode without reading the schema.
 */
type ApprovalMode = "simple" | "internal_then_client";

const MODES: {
  value: ApprovalMode;
  label: string;
  blurb: string;
  steps: { label: string; hint: string; icon: typeof Check }[];
  days: string;
}[] = [
  {
    value: "simple",
    label: "Internal approval only",
    blurb: "One approver. Faster cycle. Best for in-house or single-stakeholder content.",
    steps: [
      {
        label: "Internal review",
        hint: "Content lead signs off.",
        icon: Check,
      },
    ],
    days: "Single-step. ~ 1-3 business days from brief to publish.",
  },
  {
    value: "internal_then_client",
    label: "Internal, then client",
    blurb:
      "Two approvers. Adds a client-review stage. Use when the brand has an external stakeholder.",
    steps: [
      {
        label: "Internal review",
        hint: "Content lead + creative director sign off.",
        icon: Users,
      },
      {
        label: "Client review",
        hint: "Client approver signs off before publish-ready.",
        icon: MessageSquare,
      },
    ],
    days: "Two-step. ~ 5-10 business days from brief to publish.",
  },
];

export function ApprovalsForm({ slug, currentMode }: { slug: string; currentMode: ApprovalMode }) {
  const action = updateApprovalsSettingsAction.bind(null, slug);
  const [state, formAction] = useActionState<SettingsActionState, FormData>(action, {});
  const [mode, setMode] = React.useState<ApprovalMode>(currentMode);

  return (
    <Card padding="md" data-testid="approvals-form-card">
      <form action={formAction} className="space-y-6">
        <FormField
          id="settings-approval-mode"
          label="Approval mode"
          hint="How many approval steps a piece of content needs before publish."
        >
          <div className="grid gap-3 md:grid-cols-2">
            {MODES.map((m) => {
              const active = m.value === mode;
              return (
                <label
                  key={m.value}
                  htmlFor={`mode-${m.value}`}
                  className={cn(
                    "border-border bg-surface hover:border-primary flex cursor-pointer flex-col gap-3 rounded-[var(--radius-card)] border p-4 transition-colors",
                    active && "border-primary bg-primary-subtle",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <input
                      id={`mode-${m.value}`}
                      type="radio"
                      name="approvalMode"
                      value={m.value}
                      checked={active}
                      onChange={() => setMode(m.value)}
                      className="border-border text-primary focus-visible:ring-focus-ring mt-0.5 h-4 w-4 border focus-visible:ring-2 focus-visible:outline-none"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-section-title text-fg-primary font-semibold">{m.label}</p>
                      <p className="text-body text-fg-secondary">{m.blurb}</p>
                    </div>
                  </div>
                  <ul className="border-border ml-6 space-y-1 border-l pl-3 text-sm">
                    {m.steps.map((step, i) => (
                      <li key={i} className="text-fg-secondary flex items-center gap-2">
                        <step.icon
                          className="text-primary h-3.5 w-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="text-fg-primary font-semibold">{step.label}</span>
                        <span className="text-label text-fg-muted">{step.hint}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-label text-fg-muted ml-6">{m.days}</p>
                </label>
              );
            })}
          </div>
        </FormField>
        {state.error ? (
          <p
            role="alert"
            data-testid="approvals-form-error"
            className="text-body text-danger font-semibold"
          >
            {state.error}
          </p>
        ) : null}
        {state.saved ? (
          <p
            role="status"
            data-testid="approvals-form-saved"
            className="text-body text-success font-semibold"
          >
            Approval mode saved.
          </p>
        ) : null}
        <div className="flex justify-end">
          <FormSubmitButton label="Save approval mode" pendingLabel="Saving…" />
        </div>
      </form>
    </Card>
  );
}
