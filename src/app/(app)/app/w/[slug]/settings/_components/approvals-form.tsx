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
import { useLocaleT } from "@/components/i18n/locale-provider";

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

type ApprovalsFormProps = {
  slug: string;
  currentMode: ApprovalMode;
  leadTimes: {
    contentApprovalLeadDays: number;
    designCompleteLeadDays: number;
    creativeApprovalLeadDays: number;
    readyToPublishLeadDays: number;
  };
  t?: (key: string, params?: Record<string, string | number>) => string;
};

export function ApprovalsForm(props: ApprovalsFormProps) {
  const { slug, currentMode, leadTimes, t: tProp } = props;
  const localeT = useLocaleT();
  const t = tProp ?? localeT;
  const MODES: {
    value: ApprovalMode;
    label: string;
    blurb: string;
    steps: { label: string; hint: string; icon: typeof Check }[];
    days: string;
  }[] = [
    {
      value: "simple",
      label: t("settings.approvals.modeSimple.label"),
      blurb: t("settings.approvals.modeSimple.blurb"),
      steps: [
        {
          label: t("settings.approvals.stepInternalReviewLabel"),
          hint: t("settings.approvals.stepInternalReviewHint"),
          icon: Check,
        },
      ],
      days: t("settings.approvals.modeSimple.days"),
    },
    {
      value: "internal_then_client",
      label: t("settings.approvals.modeInternalThenClient.label"),
      blurb: t("settings.approvals.modeInternalThenClient.blurb"),
      steps: [
        {
          label: t("settings.approvals.stepInternalReviewLabel"),
          hint: t("settings.approvals.stepInternalReviewTwoHint"),
          icon: Users,
        },
        {
          label: t("settings.approvals.stepClientReviewLabel"),
          hint: t("settings.approvals.stepClientReviewHint"),
          icon: MessageSquare,
        },
      ],
      days: t("settings.approvals.modeInternalThenClient.days"),
    },
  ];
  const action = updateApprovalsSettingsAction.bind(null, slug);
  const [state, formAction] = useActionState<SettingsActionState, FormData>(action, {});
  const [mode, setMode] = React.useState<ApprovalMode>(currentMode);
  const impact = impactFor(mode, leadTimes, t);
  const dirty = mode !== currentMode;

  return (
    <Card padding="md" data-testid="approvals-form-card">
      <form action={formAction} className="space-y-6">
        <FormField
          id="settings-approval-mode"
          label={t("settings.approvals.fieldLabel")}
          hint={t("settings.approvals.fieldHint")}
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
                          className="text-label bg-success-subtle text-success mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-bold"
                          data-testid="approvals-current-mode-badge"
                        >
                          <Check className="h-3 w-3" aria-hidden="true" />
                          {t("settings.approvals.currentBadge")}
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
            aria-label={t("settings.approvals.impactTitle")}
          >
            <div className="flex items-center gap-2">
              <Info className="text-primary h-4 w-4" aria-hidden="true" />
              <h3 className="text-section-title text-fg-primary font-semibold">
                {t("settings.approvals.impactTitle")}
              </h3>
            </div>
            <p className="text-body text-fg-secondary">
              {t("settings.approvals.impactDescription", {
                from: labelFor(currentMode, t),
                to: labelFor(mode, t),
              })}
            </p>
            {impact.kind === "ok" ? (
              <p
                className="text-body text-success inline-flex items-center gap-1"
                data-testid="approvals-impact-ok"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                {t("settings.approvals.impactOk")}
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
              href={`/app/w/${slug}/settings#lead-times`}
              className="text-label text-primary inline-flex items-center gap-1 font-semibold hover:underline"
              data-testid="approvals-impact-lead-times-link"
            >
              {t("settings.approvals.openLeadTimes")}
              <DirAwareArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <p className="text-label text-fg-muted" data-testid="approvals-impact-stable">
            <Info className="h-3 w-3" aria-hidden="true" />
            {currentMode === mode
              ? t("settings.approvals.impactStable")
              : t("settings.approvals.impactIdle")}
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
            {t("settings.approvals.saved")}
          </p>
        ) : null}
        <div className="flex justify-end">
          <FormSubmitButton
            label={t("settings.approvals.submit")}
            pendingLabel={t("common.saving")}
          />
        </div>
      </form>
    </Card>
  );
}

function labelFor(mode: ApprovalMode, t: (key: string) => string): string {
  const labels: Record<ApprovalMode, string> = {
    simple: t("settings.approvals.modeSimple.label"),
    internal_then_client: t("settings.approvals.modeInternalThenClient.label"),
  };
  return labels[mode] ?? mode;
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
  t: (key: string, params?: Record<string, string | number>) => string,
): Impact {
  const warnings: string[] = [];
  if (mode === "internal_then_client") {
    if (leadTimes.creativeApprovalLeadDays < 1) {
      warnings.push(t("settings.approvals.impactWarnNoCreativeBuffer"));
    }
    if (leadTimes.readyToPublishLeadDays < 2) {
      warnings.push(
        leadTimes.readyToPublishLeadDays === 1
          ? t("settings.approvals.impactWarnPublishShortOne")
          : t("settings.approvals.impactWarnPublishShortMany", {
              count: leadTimes.readyToPublishLeadDays,
            }),
      );
    }
  } else {
    if (leadTimes.creativeApprovalLeadDays > 0) {
      warnings.push(
        t("settings.approvals.impactWarnCreativeUnused", {
          count: leadTimes.creativeApprovalLeadDays,
        }),
      );
    }
  }
  if (warnings.length === 0) return { kind: "ok" };
  return { kind: "warn", warnings };
}
