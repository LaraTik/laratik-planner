"use client";
import * as React from "react";
import { useActionState } from "react";
import { Sparkles, Loader2, Check } from "lucide-react";
import { TimezoneCombobox } from "@/components/forms/timezone-combobox";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { updateLifecycleSettingsAction, type SettingsActionState } from "../actions";
import { suggestMonthlyTargetAction } from "../ai-suggestions";

/**
 * LifecycleForm — per-section form for the Settings → Lifecycle
 * page. Phase D adds an AI 'Suggest a target' affordance next
 * to the monthly target field. The suggestion is a single
 * integer, so the preview collapses to a single-line diff
 * ('Was 24 → Suggested 16 / month') with Apply / Discard.
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
  const [target, setTarget] = React.useState<number | "">(monthlyTarget ?? "");
  const [targetOriginal] = React.useState<number | "">(monthlyTarget ?? "");
  const [targetStatus, setTargetStatus] = React.useState<
    "idle" | "loading" | "preview" | "error" | "applied"
  >("idle");
  const [targetError, setTargetError] = React.useState<string | null>(null);
  const [targetPreview, setTargetPreview] = React.useState<number | null>(null);

  async function onSuggestTarget() {
    setTargetStatus("loading");
    setTargetError(null);
    const res = await suggestMonthlyTargetAction(slug);
    if (!res.ok || res.suggestion === undefined) {
      setTargetStatus("error");
      setTargetError(res.error ?? "AI suggestion failed.");
      return;
    }
    setTargetPreview(res.suggestion);
    setTargetStatus("preview");
  }

  function onApplyPreview() {
    if (targetPreview === null) return;
    setTarget(targetPreview);
    setTargetPreview(null);
    setTargetStatus("applied");
  }

  function onDiscardPreview() {
    setTargetPreview(null);
    setTargetStatus("idle");
  }

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
          <div className="space-y-2">
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
                value={target}
                onChange={(e) => setTarget(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="e.g. 24"
                className="border-border bg-surface text-body text-fg-primary focus-visible:ring-focus-ring h-10 w-full rounded-[var(--radius-control)] border px-3 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
              />
            </FormField>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onSuggestTarget}
                disabled={targetStatus === "loading" || targetStatus === "preview"}
                data-testid="lifecycle-ai-suggest"
                className="text-label text-primary border-border hover:bg-primary-subtle focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] border px-2.5 py-1 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {targetStatus === "loading" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Suggest a target
              </button>
              {targetStatus === "applied" ? (
                <span
                  className="text-label text-success inline-flex items-center gap-1 font-semibold"
                  data-testid="lifecycle-ai-applied"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Suggestion applied. Edit any number before saving.
                </span>
              ) : null}
              {targetStatus === "error" && targetError ? (
                <span role="alert" className="text-label text-danger">
                  {targetError}
                </span>
              ) : null}
            </div>
            {targetStatus === "preview" && targetPreview !== null ? (
              <div
                className="border-border bg-primary-subtle space-y-2 rounded-[var(--radius-control)] border p-3"
                data-testid="lifecycle-ai-preview"
                role="region"
                aria-label="AI monthly-target preview"
              >
                <p className="text-body text-fg-primary font-semibold">
                  AI suggests{" "}
                  <span className="text-primary" data-testid="lifecycle-ai-preview-value">
                    {targetPreview} / month
                  </span>
                  {targetOriginal !== "" ? (
                    <span className="text-fg-muted ml-2 font-normal">(was {targetOriginal})</span>
                  ) : null}
                </p>
                <p className="text-label text-fg-secondary">
                  Anchored to your lead-time cycle so the team can sustain the cadence.
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onDiscardPreview}
                    data-testid="lifecycle-ai-discard"
                  >
                    Discard
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={onApplyPreview}
                    data-testid="lifecycle-ai-apply"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Apply
                  </Button>
                </div>
              </div>
            ) : null}
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
