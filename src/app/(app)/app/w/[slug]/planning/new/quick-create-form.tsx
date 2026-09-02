"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DirAwareInput, DirAwareTextarea } from "@/components/forms/dir-aware-textarea";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { FormSummary } from "@/components/forms/form-summary";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocaleCode, useLocaleT } from "@/components/i18n/locale-provider";
import { focusFirstInvalid } from "@/lib/forms/focus-first-invalid";
import { useBeforeunloadDirtyGuard } from "@/lib/forms/use-beforeunload-dirty-guard";
import { quickCreateAction } from "../actions";

/**
 * Per-form human label map for the top-of-form summary card.
 * Keys are the form field names; values are the user-facing
 * labels that match the matching `<FormField label>` so the
 * summary's anchor-link text reads naturally.
 */
const initial: { error?: string; fieldErrors?: Record<string, string> } = {};

export function QuickCreateForm({
  workspaceSlug,
  channels,
}: {
  workspaceSlug: string;
  channels: { id: string; accountName: string; platform: string }[];
}) {
  const t = useLocaleT();
  const locale = useLocaleCode();
  const boundAction = quickCreateAction.bind(null, workspaceSlug);
  const [state, formAction] = useActionState(boundAction, initial);
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const [title, setTitle] = React.useState("");
  const [brief, setBrief] = React.useState("");

  // Default the planned date to tomorrow 9am
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const defaultPlanned = tomorrow.toISOString().slice(0, 16);

  // When the Server Action returns a `fieldErrors` map, the
  // first invalid control is focused on the next paint so
  // keyboard users land on the offender. Per WIG §Forms:
  // "focus first error on submit".
  React.useEffect(() => {
    if (state?.fieldErrors && Object.keys(state.fieldErrors).length > 0) {
      // Defer one frame so the FormField has rendered the
      // `aria-invalid="true"` attribute the helper looks for.
      const handle = window.setTimeout(() => {
        focusFirstInvalid(formRef.current);
      }, 0);
      return () => window.clearTimeout(handle);
    }
    return undefined;
  }, [state?.fieldErrors]);

  // WIG: "Warn before navigation with unsaved changes". The
  // create form is short, but the user may paste a long
  // brief and then click Back by accident.
  useBeforeunloadDirtyGuard(formRef);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4"
      noValidate
      data-testid="quick-create-form"
    >
      <FormSummary
        {...(state?.error ? { error: state.error } : {})}
        {...(state?.fieldErrors ? { fieldErrors: state.fieldErrors } : {})}
        fieldLabels={{
          title: t("quickCreate.form.title"),
          format: t("quickCreate.form.format"),
          plannedPublishAt: t("quickCreate.form.plannedPublish"),
          brief: t("quickCreate.form.briefSummary"),
          channelIds: t("quickCreate.form.channels"),
        }}
      />

      <FormField
        id="title"
        label={t("quickCreate.form.title")}
        hint={t("quickCreate.form.titleHint")}
        required
        {...(state?.fieldErrors?.title ? { error: state.fieldErrors.title } : {})}
      >
        <DirAwareInput
          type="text"
          name="title"
          required
          minLength={2}
          maxLength={200}
          autoComplete="off"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("quickCreate.form.titlePlaceholder")}
          locale={locale}
          className="min-h-11"
        />
      </FormField>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          id="format"
          label={t("quickCreate.form.format")}
          required
          {...(state?.fieldErrors?.format ? { error: state.fieldErrors.format } : {})}
        >
          <select
            name="format"
            required
            defaultValue="static_post"
            className="border-border bg-surface text-fg-primary text-body focus-visible:ring-focus-ring flex min-h-11 w-full rounded-[var(--radius-control)] border px-3 py-2 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
          >
            <option value="static_post">{t("planningFilters.formatLabels.static_post")}</option>
            <option value="carousel">{t("planningFilters.formatLabels.carousel")}</option>
            <option value="story">{t("planningFilters.formatLabels.story")}</option>
            <option value="short_form_video">
              {t("planningFilters.formatLabels.short_form_video")}
            </option>
            <option value="long_form_video">
              {t("planningFilters.formatLabels.long_form_video")}
            </option>
            <option value="live_content">{t("planningFilters.formatLabels.live_content")}</option>
            <option value="article">{t("planningFilters.formatLabels.article")}</option>
            <option value="other">{t("planningFilters.formatLabels.other")}</option>
          </select>
        </FormField>
        <FormField
          id="plannedPublishAt"
          label={t("quickCreate.form.plannedPublish")}
          required
          {...(state?.fieldErrors?.plannedPublishAt
            ? { error: state.fieldErrors.plannedPublishAt }
            : {})}
        >
          <Input
            type="datetime-local"
            name="plannedPublishAt"
            required
            defaultValue={defaultPlanned}
          />
        </FormField>
      </div>

      <FormField
        id="brief"
        label={t("quickCreate.form.briefOptional")}
        hint={t("quickCreate.form.briefHint")}
        {...(state?.fieldErrors?.brief ? { error: state.fieldErrors.brief } : {})}
      >
        <DirAwareTextarea
          name="brief"
          rows={4}
          maxLength={2000}
          autoComplete="off"
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          placeholder={t("quickCreate.form.briefPlaceholder")}
          locale={locale}
        />
      </FormField>

      {channels.length > 0 ? (
        <fieldset
          className="space-y-2"
          {...(state?.fieldErrors?.channelIds
            ? { "aria-invalid": true, "aria-describedby": "channelIds-error" }
            : {})}
        >
          <legend className="text-body text-fg-primary font-semibold">
            {t("quickCreate.form.channelsDefault")}
          </legend>
          <div className="border-border bg-surface grid grid-cols-1 gap-2 rounded-[var(--radius-control)] border p-3 md:grid-cols-2">
            {channels.map((c) => (
              <div
                key={c.id}
                className="text-body text-fg-primary flex min-h-11 items-center gap-2"
              >
                <Checkbox
                  id={`quick-create-channel-${c.id}`}
                  name="channelIds"
                  value={c.id}
                  defaultChecked
                />
                <label htmlFor={`quick-create-channel-${c.id}`} className="cursor-pointer">
                  {t(`platform.platformKey.${c.platform}`)} · <bdi>{c.accountName}</bdi>
                </label>
              </div>
            ))}
          </div>
          {state?.fieldErrors?.channelIds ? (
            <p id="channelIds-error" role="alert" className="text-label text-danger font-semibold">
              {state.fieldErrors.channelIds}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <div className="flex items-center gap-3 pt-2">
        <FormSubmitButton
          label={t("quickCreate.form.createDraft")}
          pendingLabel={t("quickCreate.form.creating")}
          size="lg"
        />
        <Button variant="ghost" asChild>
          <a href={`/app/w/${workspaceSlug}/planning`}>{t("quickCreate.form.cancel")}</a>
        </Button>
      </div>
    </form>
  );
}
