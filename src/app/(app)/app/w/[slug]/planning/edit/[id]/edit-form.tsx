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
import { updateContentItemAction } from "../../actions";

export interface EditIdeaFormInitial {
  title: string;
  format:
    | "static_post"
    | "carousel"
    | "story"
    | "short_form_video"
    | "long_form_video"
    | "live_content"
    | "article"
    | "other";
  brief: string;
  plannedPublishAtIso: string;
  channelIds: string[];
}

const initial: { error?: string; fieldErrors?: Record<string, string> } = {};

/**
 * Edit a draft / changes-requested idea. Pre-fills the values supplied
 * by the server and submits via `updateContentItemAction`. Field-level
 * errors render inline next to the offending input; a top-of-form
 * summary card lists the failed fields. Plan §4.
 */
export function EditIdeaForm({
  workspaceSlug,
  contentItemId,
  channels,
  initial: initialValues,
}: {
  workspaceSlug: string;
  contentItemId: string;
  channels: { id: string; accountName: string; platform: string }[];
  initial: EditIdeaFormInitial;
}) {
  const t = useLocaleT();
  const locale = useLocaleCode();
  const boundAction = updateContentItemAction.bind(null, workspaceSlug, contentItemId);
  const [state, formAction] = useActionState(boundAction, initial);
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const [title, setTitle] = React.useState(initialValues.title);
  const [brief, setBrief] = React.useState(initialValues.brief);

  // datetime-local needs YYYY-MM-DDTHH:mm, slice the ISO.
  const defaultPlanned = initialValues.plannedPublishAtIso.slice(0, 16);

  // Focus the first invalid field on submit failure.
  React.useEffect(() => {
    if (state?.fieldErrors && Object.keys(state.fieldErrors).length > 0) {
      const handle = window.setTimeout(() => {
        focusFirstInvalid(formRef.current);
      }, 0);
      return () => window.clearTimeout(handle);
    }
    return undefined;
  }, [state?.fieldErrors]);

  // WIG: warn before navigation with unsaved edits.
  useBeforeunloadDirtyGuard(formRef);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4"
      noValidate
      data-testid="edit-idea-form"
    >
      <FormSummary
        {...(state?.error ? { error: state.error } : {})}
        {...(state?.fieldErrors ? { fieldErrors: state.fieldErrors } : {})}
        fieldLabels={{
          title: t("planning.editForm.title"),
          format: t("planning.editForm.format"),
          plannedPublishAt: t("planning.editForm.plannedPublish"),
          brief: t("planning.editForm.briefSummary"),
          channelIds: t("planning.editForm.channels"),
        }}
      />

      <FormField
        id="title"
        label={t("planning.editForm.title")}
        hint={t("planning.editForm.titleHint")}
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
          locale={locale}
          className="min-h-11"
        />
      </FormField>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          id="format"
          label={t("planning.editForm.format")}
          required
          {...(state?.fieldErrors?.format ? { error: state.fieldErrors.format } : {})}
        >
          <select
            name="format"
            required
            defaultValue={initialValues.format}
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
          label={t("planning.editForm.plannedPublish")}
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
        label={t("planning.editForm.briefOptional")}
        hint={t("planning.editForm.briefHint")}
        {...(state?.fieldErrors?.brief ? { error: state.fieldErrors.brief } : {})}
      >
        <DirAwareTextarea
          name="brief"
          rows={4}
          maxLength={2000}
          autoComplete="off"
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          placeholder={t("planning.editForm.briefPlaceholder")}
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
            {t("planning.editForm.channels")}
          </legend>
          <div className="border-border bg-surface grid grid-cols-1 gap-2 rounded-[var(--radius-control)] border p-3 md:grid-cols-2">
            {channels.map((c) => (
              <div
                key={c.id}
                className="text-body text-fg-primary flex min-h-11 items-center gap-2"
              >
                <Checkbox
                  id={`edit-channel-${c.id}`}
                  name="channelIds"
                  value={c.id}
                  defaultChecked={initialValues.channelIds.includes(c.id)}
                />
                <label htmlFor={`edit-channel-${c.id}`} className="cursor-pointer">
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
          label={t("planning.editForm.saveChanges")}
          pendingLabel={t("planning.editForm.saving")}
          size="lg"
        />
        <Button variant="ghost" asChild>
          <a href={`/app/w/${workspaceSlug}/planning/${contentItemId}`}>
            {t("planning.editForm.cancel")}
          </a>
        </Button>
      </div>
    </form>
  );
}
