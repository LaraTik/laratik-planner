"use client";
import * as React from "react";
import { useActionState } from "react";
import { Sparkles, Loader2, Check, X, RotateCcw, CalendarCheck2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateLeadTimesSettingsAction, type SettingsActionState } from "../actions";
import { suggestLeadTimesAction } from "../ai-suggestions";
import { LeadTimeTimeline } from "./lead-time-timeline";
import { LeadTimeDeadline } from "./lead-time-deadline";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";

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

const STAGE_LABELS: Array<{ key: keyof LeadTimeValues; labelKey: string }> = [
  { key: "contentApprovalLeadDays", labelKey: "settings.leadTimes.stageContent" },
  { key: "designCompleteLeadDays", labelKey: "settings.leadTimes.stageDesign" },
  { key: "creativeApprovalLeadDays", labelKey: "settings.leadTimes.stageCreative" },
  { key: "readyToPublishLeadDays", labelKey: "settings.leadTimes.stagePublish" },
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
  t: tProp,
}: {
  slug: string;
  values: LeadTimeValues;
  approvalMode: "simple" | "internal_then_client";
  timezone: string;
  t?: (key: string, params?: Record<string, string | number>) => string;
}) {
  const localeT = useLocaleT();
  const t = tProp ?? localeT;
  const locale = useLocaleCode();
  // `today` is captured once at component mount so the AI
  // preview's deadline-impact line is stable while the user
  // is interacting (and matches the page-level "What this
  // drives" card). For long-running pages the date could
  // drift past midnight; the planning surface re-renders
  // with the live "today" at action time.
  const today = React.useMemo(() => new Date(), []);

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
      setSuggestError(res.error ?? t("settings.leadTimes.suggestError"));
      return;
    }
    if (res.suggestion) {
      setPreview(res.suggestion);
      setSuggestStatus("preview");
    } else {
      setSuggestStatus("error");
      setSuggestError(t("settings.leadTimes.noSuggestion"));
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
          {t("settings.leadTimes.total", { count: total })}
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
            {t("settings.leadTimes.suggest")}
          </button>
          {suggestStatus === "applied" ? (
            <span
              className="text-label text-success inline-flex items-center gap-1 font-semibold"
              data-testid="lead-times-ai-applied"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {t("settings.lifecycle.applied")}
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
              {t("common.cancel")}
            </button>
          ) : null}
        </div>

        {suggestStatus === "preview" && preview ? (
          <div
            className="border-border bg-primary-subtle space-y-3 rounded-[var(--radius-control)] border p-4"
            data-testid="lead-times-ai-preview"
            role="region"
            aria-label={t("settings.leadTimes.previewAria")}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="text-primary h-4 w-4" aria-hidden="true" />
              <h3 className="text-section-title text-fg-primary font-semibold">
                {t("settings.leadTimes.previewHeading")}
              </h3>
              <span
                className={cn(
                  "text-label ms-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold",
                  previewTotal < total
                    ? "bg-success/15 text-success"
                    : previewTotal > total
                      ? "bg-warning/15 text-warning"
                      : "bg-surface text-fg-muted",
                )}
                data-testid="lead-times-ai-preview-delta"
              >
                {t("settings.leadTimes.businessDays", { count: previewTotal })}
                {previewTotal !== total
                  ? ` (${t("settings.leadTimes.previewWas", { count: total })} — ${previewTotal < total ? t("settings.leadTimes.faster") : t("settings.leadTimes.slower")})`
                  : ""}
              </span>
            </div>
            <p className="text-label text-fg-secondary">
              {t("settings.leadTimes.previewDescription", {
                flow:
                  approvalMode === "internal_then_client"
                    ? t("settings.leadTimes.internalClientFlow")
                    : t("settings.leadTimes.internalOnlyFlow"),
              })}
            </p>
            {previewTotal !== total && previewTotal > 0 ? (
              <p
                className="text-label text-fg-secondary inline-flex items-center gap-1"
                data-testid="lead-times-ai-preview-deadline-impact"
              >
                <CalendarCheck2 className="text-fg-muted h-3.5 w-3.5" aria-hidden="true" />
                {t("settings.leadTimes.deadlineImpactBefore")}{" "}
                <span className="text-fg-primary line-through">
                  {formatDeadlineLabel(addBusinessDaysInline(today, total), timezone, locale)}
                </span>{" "}
                <span className="text-fg-primary font-bold">
                  {t("settings.leadTimes.deadlineTo")}{" "}
                  {formatDeadlineLabel(
                    addBusinessDaysInline(today, previewTotal),
                    timezone,
                    locale,
                  )}
                </span>
                {previewTotal < total
                  ? t("settings.leadTimes.earlier")
                  : t("settings.leadTimes.later")}
              </p>
            ) : null}
            <ul className="grid gap-2 sm:grid-cols-2">
              {STAGE_LABELS.map(({ key, labelKey }) => {
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
                    <span className="text-label text-fg-muted min-w-16">{t(labelKey)}</span>
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
                {t("settings.leadTimes.discard")}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={onApplyPreview}
                data-testid="lead-times-ai-apply"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                {t("settings.leadTimes.apply")}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <LeadTimeField
            id="settings-lead-content"
            name="contentApprovalLeadDays"
            label={t("settings.leadTimes.contentApprovalLabel")}
            help={t("settings.leadTimes.contentApprovalHint")}
            value={draft.contentApprovalLeadDays}
            onChange={(v) => setDraft({ ...draft, contentApprovalLeadDays: v })}
            t={t}
          />
          <LeadTimeField
            id="settings-lead-design"
            name="designCompleteLeadDays"
            label={t("settings.leadTimes.designCompleteLabel")}
            help={t("settings.leadTimes.designCompleteHint")}
            value={draft.designCompleteLeadDays}
            onChange={(v) => setDraft({ ...draft, designCompleteLeadDays: v })}
            t={t}
          />
          <LeadTimeField
            id="settings-lead-creative"
            name="creativeApprovalLeadDays"
            label={t("settings.leadTimes.creativeApprovalLabel")}
            help={t("settings.leadTimes.creativeApprovalHint")}
            value={draft.creativeApprovalLeadDays}
            onChange={(v) => setDraft({ ...draft, creativeApprovalLeadDays: v })}
            t={t}
          />
          <LeadTimeField
            id="settings-lead-publish"
            name="readyToPublishLeadDays"
            label={t("settings.leadTimes.readyToPublishLabel")}
            help={t("settings.leadTimes.readyToPublishHint")}
            value={draft.readyToPublishLeadDays}
            onChange={(v) => setDraft({ ...draft, readyToPublishLeadDays: v })}
            t={t}
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
            {t("settings.leadTimes.saved")}
          </p>
        ) : null}
        <div className="flex justify-end">
          <FormSubmitButton
            label={t("settings.leadTimes.submit")}
            pendingLabel={t("common.saving")}
          />
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
  t,
}: {
  id: string;
  name: string;
  label: string;
  help: string;
  value: number;
  onChange: (next: number) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
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
        <span aria-hidden="true" className="text-danger ms-0.5">
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
        <span className="text-label text-fg-muted shrink-0">{t("settings.leadTimes.days")}</span>
      </div>
    </div>
  );
}

/**
 * Add N business days (Mon-Fri) to a start Date. Mirrors the
 * helper in `lead-time-deadline.tsx` — duplicated here so the
 * AI preview can compute the before/after deadline impact
 * without re-implementing the math at the call site.
 */
function addBusinessDaysInline(start: Date, days: number): Date {
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

function formatDeadlineLabel(date: Date, timezone: string, locale: string): string {
  const dateLocale = locale === "ar" ? "ar-u-nu-latn" : "en-GB";
  try {
    return new Intl.DateTimeFormat(dateLocale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: timezone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(dateLocale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(date);
  }
}
