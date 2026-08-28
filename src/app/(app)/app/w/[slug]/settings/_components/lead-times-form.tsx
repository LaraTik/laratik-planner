"use client";
import * as React from "react";
import { useActionState } from "react";
import { Sparkles, Loader2, Check, X, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateLeadTimesSettingsAction, type SettingsActionState } from "../actions";
import { suggestLeadTimesAction } from "../ai-suggestions";
import { LeadTimeTimeline } from "./lead-time-timeline";
import { LeadTimeDeadline } from "./lead-time-deadline";

/**
 * LeadTimesForm — per-section form for the Settings → Lead
 * times page. Phase D adds an AI-suggest preview flow so the
 * user can see the before/after diff before applying. The
 * "Suggest" button now returns to a preview state with two
 * actions — Apply (commits the suggestion) and Discard
 * (clears the preview). The form state only updates on Apply,
 * not on Suggest, so the user can always revert to the
 * original values with one click.
 */
export interface LeadTimeValues {
  contentApprovalLeadDays: number;
  designCompleteLeadDays: number;
  creativeApprovalLeadDays: number;
  readyToPublishLeadDays: number;
}

const STAGE_LABELS: Array<{ key: keyof LeadTimeValues; label: string }> = [
  { key: "contentApprovalLeadDays", label: "Content" },
  { key: "designCompleteLeadDays", label: "Design" },
  { key: "creativeApprovalLeadDays", label: "Creative" },
  { key: "readyToPublishLeadDays", label: "Publish" },
];

function totalOf(v: LeadTimeValues): number {
  return STAGE_LABELS.reduce((sum, s) => sum + v[s.key], 0);
}

type SuggestStatus = "idle" | "loading" | "preview" | "error" | "applied";

export function LeadTimesForm({
  slug,
  values,
  approvalMode,
  timezone,
}: {
  slug: string;
  values: LeadTimeValues;
  approvalMode: "simple" | "internal_then_client";
  timezone: string;
}) {
  const action = updateLeadTimesSettingsAction.bind(null, slug);
  const [state, formAction] = useActionState<SettingsActionState, FormData>(action, {});
  const [draft, setDraft] = React.useState<LeadTimeValues>(values);
  const [original] = React.useState<LeadTimeValues>(values);
  const [suggestStatus, setSuggestStatus] = React.useState<SuggestStatus>("idle");
  const [suggestError, setSuggestError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<LeadTimeValues | null>(null);

  const total = totalOf(draft);
  const previewTotal = preview ? totalOf(preview) : 0;

  async function onSuggest() {
    setSuggestStatus("loading");
    setSuggestError(null);
    const res = await suggestLeadTimesAction(slug, { approvalMode });
    if (!res.ok) {
      setSuggestStatus("error");
      setSuggestError(res.error ?? "AI suggestion failed.");
      return;
    }
    if (res.suggestion) {
      setPreview(res.suggestion);
      setSuggestStatus("preview");
    } else {
      setSuggestStatus("error");
      setSuggestError("AI returned no suggestion.");
    }
  }

  function onApplyPreview() {
    if (!preview) return;
    setDraft(preview);
    setPreview(null);
    setSuggestStatus("applied");
  }

  function onDiscardPreview() {
    setPreview(null);
    setSuggestStatus("idle");
  }

  function onRevertToOriginal() {
    setDraft(original);
    setPreview(null);
    setSuggestStatus("idle");
  }

  return (
    <Card padding="md" data-testid="lead-times-form-card">
      <form action={formAction} className="space-y-6">
        <p className="text-body text-fg-secondary max-w-3xl" data-testid="lead-times-total">
          Total cycle time: <span className="text-fg-primary font-bold">{total} business days</span>{" "}
          from brief to publish-ready. Each lead time is the buffer between an adjacent pair of
          workflow stages.
        </p>
        <LeadTimeTimeline values={draft} />
        <LeadTimeDeadline totalDays={total} today={new Date()} timezone={timezone} live />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSuggest}
            disabled={suggestStatus === "loading" || suggestStatus === "preview"}
            data-testid="lead-times-ai-suggest"
            className="text-label text-primary border-border hover:bg-primary-subtle focus-visible:ring-focus-ring inline-flex items-center gap-1 rounded-[var(--radius-control)] border px-2.5 py-1 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {suggestStatus === "loading" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Suggest lead times
          </button>
          {suggestStatus === "applied" ? (
            <span
              className="text-label text-success inline-flex items-center gap-1 font-semibold"
              data-testid="lead-times-ai-applied"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Suggestion applied. Edit any number before saving.
            </span>
          ) : null}
          {suggestStatus === "error" && suggestError ? (
            <span role="alert" className="text-label text-danger">
              {suggestError}
            </span>
          ) : null}
          {draft !== original && suggestStatus !== "preview" ? (
            <button
              type="button"
              onClick={onRevertToOriginal}
              data-testid="lead-times-revert"
              className="text-label text-fg-secondary hover:text-fg-primary inline-flex items-center gap-1 font-semibold transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Revert
            </button>
          ) : null}
        </div>

        {suggestStatus === "preview" && preview ? (
          <div
            className="border-border bg-primary-subtle space-y-3 rounded-[var(--radius-control)] border p-4"
            data-testid="lead-times-ai-preview"
            role="region"
            aria-label="AI suggestion preview"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="text-primary h-4 w-4" aria-hidden="true" />
              <h3 className="text-section-title text-fg-primary font-semibold">
                AI suggestion — preview
              </h3>
              <span
                className={cn(
                  "text-label ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold",
                  previewTotal < total
                    ? "bg-success/15 text-success"
                    : previewTotal > total
                      ? "bg-warning/15 text-warning"
                      : "bg-surface text-fg-muted",
                )}
                data-testid="lead-times-ai-preview-delta"
              >
                {previewTotal} business days
                {previewTotal !== total
                  ? ` (was ${total} — ${previewTotal < total ? "faster" : "slower"})`
                  : ""}
              </span>
            </div>
            <p className="text-label text-fg-secondary">
              A sensible default for the{" "}
              {approvalMode === "internal_then_client" ? "internal + client" : "internal-only"}{" "}
              approval flow. Review the before/after per stage, then Apply to commit or Discard to
              ignore.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {STAGE_LABELS.map(({ key, label }) => {
                const before = draft[key];
                const after = preview[key];
                const changed = before !== after;
                return (
                  <li
                    key={key}
                    className={cn(
                      "border-border bg-surface flex items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2",
                    )}
                    data-testid={`lead-times-ai-preview-stage-${key}`}
                  >
                    <span className="text-label text-fg-muted min-w-16">{label}</span>
                    <span
                      className={cn(
                        "text-body tabular-nums",
                        !changed && "text-fg-muted line-through",
                      )}
                    >
                      {before}d
                    </span>
                    <span aria-hidden="true" className="text-fg-muted">
                      →
                    </span>
                    <span
                      className={cn(
                        "text-body font-bold tabular-nums",
                        changed ? "text-primary" : "text-fg-muted",
                      )}
                    >
                      {after}d
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDiscardPreview}
                data-testid="lead-times-ai-discard"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Discard
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={onApplyPreview}
                data-testid="lead-times-ai-apply"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Apply
              </Button>
            </div>
          </div>
        ) : null}

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
  // Render the field manually (without FormField) so the
  // <label htmlFor> targets the input directly. FormField's
  // React.cloneElement puts the id on its direct child, which
  // is fine when the child is a single input but breaks when
  // the child is a `<div>` wrapping the input + "days" label.
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label text-fg-primary font-semibold">
        {label}
        <span aria-hidden="true" className="text-danger ml-0.5">
          *
        </span>
      </label>
      <p className="text-label text-fg-muted">{help}</p>
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
    </div>
  );
}
