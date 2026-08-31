"use client";
import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import { Check, Users, MessageSquare, AlertCircle, Info } from "lucide-react";
import { DirAwareArrowRight } from "@/components/ui/dir-aware-icon";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { cn } from "@/lib/utils";
import { updateApprovalsSettingsAction, type SettingsActionState } from "../actions";

/**
 * ApprovalsForm — per-section form for the Settings → Approval
 * mode page (Phase A + D).
 *
 * Phase D adds a "what changes" cross-section impact panel.
 * Switching the mode is more than a single-field edit — the
 * `creative_approval_lead_days` and `ready_to_publish_lead_days`
 * now have real meaning, so the panel tells the user whether
 * their current lead times look right for the new mode.
 *
 * No "view all in-flight content items" preview here — that
 * requires a DB query against `content_items` and is a
 * follow-up if/when the section grows.
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

export function ApprovalsForm({
  slug,
  currentMode,
  leadTimes,
}: {
  slug: string;
  currentMode: ApprovalMode;
  leadTimes: {
    contentApprovalLeadDays: number;
    designCompleteLeadDays: number;
    creativeApprovalLeadDays: number;
    readyToPublishLeadDays: number;
  };
}) {
  const action = updateApprovalsSettingsAction.bind(null, slug);
  const [state, formAction] = useActionState<SettingsActionState, FormData>(action, {});
  const [mode, setMode] = React.useState<ApprovalMode>(currentMode);
  const impact = impactFor(mode, leadTimes);
  const dirty = mode !== currentMode;

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
                    m.value === currentMode && "ring-success/30 ring-2",
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
                      {m.value === currentMode ? (
                        <span
                          className="text-label text-success mt-1 inline-flex items-center gap-1 font-bold"
                          data-testid="approvals-current-mode-badge"
                        >
                          <Check className="h-3 w-3" aria-hidden="true" />
                          Currently selected
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <ul className="border-border ms-6 space-y-1 border-s ps-3 text-sm">
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
                  <p className="text-label text-fg-muted ms-6">{m.days}</p>
                </label>
              );
            })}
          </div>
        </FormField>

        {dirty ? (
          <div
            className="border-border bg-primary-subtle space-y-2 rounded-[var(--radius-control)] border p-4"
            data-testid="approvals-impact-panel"
            role="region"
            aria-label="Approval mode change impact"
          >
            <div className="flex items-center gap-2">
              <Info className="text-primary h-4 w-4" aria-hidden="true" />
              <h3 className="text-section-title text-fg-primary font-semibold">
                What changes when you save
              </h3>
            </div>
            <p className="text-body text-fg-secondary">
              Approval mode switches from{" "}
              <span className="text-fg-primary font-bold">{labelFor(currentMode)}</span> to{" "}
              <span className="text-fg-primary font-bold">{labelFor(mode)}</span>.
            </p>
            {impact.kind === "ok" ? (
              <p
                className="text-body text-success inline-flex items-center gap-1"
                data-testid="approvals-impact-ok"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Your current lead times look right for this mode.
              </p>
            ) : (
              <ul className="space-y-1" data-testid="approvals-impact-warnings">
                {impact.warnings.map((w, i) => (
                  <li
                    key={i}
                    className="text-body text-warning flex items-start gap-2"
                    data-testid={`approvals-impact-warning-${i}`}
                  >
                    <AlertCircle className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={`/app/w/${slug}/settings/lead-times`}
              className="text-label text-primary inline-flex items-center gap-1 font-semibold hover:underline"
              data-testid="approvals-impact-lead-times-link"
            >
              Open lead times
              <DirAwareArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <p className="text-label text-fg-muted" data-testid="approvals-impact-stable">
            <Info className="h-3 w-3" aria-hidden="true" />
            {currentMode === mode
              ? "Currently selected. No changes pending."
              : "Switch modes above to see what changes across the other settings."}
          </p>
        )}

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
          <FormSubmitButton label={dirty ? "Save approval mode" : "Saved"} pendingLabel="Saving…" />
        </div>
      </form>
    </Card>
  );
}

function labelFor(mode: ApprovalMode): string {
  return MODES.find((m) => m.value === mode)?.label ?? mode;
}

type Impact = { kind: "ok" } | { kind: "warn"; warnings: string[] };

function impactFor(
  mode: ApprovalMode,
  leadTimes: {
    contentApprovalLeadDays: number;
    designCompleteLeadDays: number;
    creativeApprovalLeadDays: number;
    readyToPublishLeadDays: number;
  },
): Impact {
  const warnings: string[] = [];
  if (mode === "internal_then_client") {
    if (leadTimes.creativeApprovalLeadDays < 1) {
      warnings.push(
        "Your creative_approval_lead_days is 0. The creative review step won't have a buffer; set it on the Lead times page (try 2-4 days).",
      );
    }
    if (leadTimes.readyToPublishLeadDays < 2) {
      warnings.push(
        "Your ready_to_publish_lead_days is " +
          leadTimes.readyToPublishLeadDays +
          " day(s). The client review cycle usually needs 3-6 days.",
      );
    }
  } else {
    if (leadTimes.creativeApprovalLeadDays > 0) {
      warnings.push(
        "Your creative_approval_lead_days is " +
          leadTimes.creativeApprovalLeadDays +
          " day(s). The simple mode has no creative review step, so this number has no effect.",
      );
    }
  }
  if (warnings.length === 0) return { kind: "ok" };
  return { kind: "warn", warnings };
}
