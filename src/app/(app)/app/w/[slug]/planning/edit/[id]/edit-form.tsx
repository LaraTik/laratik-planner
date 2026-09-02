"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { FormSummary } from "@/components/forms/form-summary";
import { Checkbox } from "@/components/ui/checkbox";
import { focusFirstInvalid } from "@/lib/forms/focus-first-invalid";
import { useBeforeunloadDirtyGuard } from "@/lib/forms/use-beforeunload-dirty-guard";
import { updateContentItemAction } from "../../actions";

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  format: "Format",
  plannedPublishAt: "Planned publish",
  brief: "Brief",
  channelIds: "Channels",
};

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
  const boundAction = updateContentItemAction.bind(null, workspaceSlug, contentItemId);
  const [state, formAction] = useActionState(boundAction, initial);
  const formRef = React.useRef<HTMLFormElement | null>(null);

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
        fieldLabels={FIELD_LABELS}
      />

      <FormField
        id="title"
        label="Title"
        hint="Short, descriptive."
        required
        {...(state?.fieldErrors?.title ? { error: state.fieldErrors.title } : {})}
      >
        <Input
          type="text"
          name="title"
          required
          minLength={2}
          maxLength={200}
          autoComplete="off"
          defaultValue={initialValues.title}
        />
      </FormField>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          id="format"
          label="Format"
          required
          {...(state?.fieldErrors?.format ? { error: state.fieldErrors.format } : {})}
        >
          <select
            name="format"
            required
            defaultValue={initialValues.format}
            className="border-border bg-surface text-fg-primary text-body flex h-10 w-full rounded-[var(--radius-control)] border px-3 py-2"
          >
            <option value="static_post">Static post</option>
            <option value="carousel">Carousel</option>
            <option value="story">Story</option>
            <option value="short_form_video">Short-form video</option>
            <option value="long_form_video">Long-form video</option>
            <option value="live_content">Live</option>
            <option value="article">Article</option>
            <option value="other">Other</option>
          </select>
        </FormField>
        <FormField
          id="plannedPublishAt"
          label="Planned publish"
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
        label="Brief (optional)"
        hint="Goal, audience, key points."
        {...(state?.fieldErrors?.brief ? { error: state.fieldErrors.brief } : {})}
      >
        <textarea
          name="brief"
          rows={4}
          maxLength={2000}
          autoComplete="off"
          defaultValue={initialValues.brief}
          placeholder="What's the message? Who's it for?"
          className="border-border bg-surface text-fg-primary text-body placeholder:text-fg-muted w-full rounded-[var(--radius-control)] border px-3 py-2"
        />
      </FormField>

      {channels.length > 0 ? (
        <fieldset
          className="space-y-2"
          {...(state?.fieldErrors?.channelIds
            ? { "aria-invalid": true, "aria-describedby": "channelIds-error" }
            : {})}
        >
          <legend className="text-body text-fg-primary font-semibold">Channels</legend>
          <div className="border-border bg-surface grid grid-cols-1 gap-2 rounded-[var(--radius-control)] border p-3 md:grid-cols-2">
            {channels.map((c) => (
              <div key={c.id} className="text-body text-fg-primary flex items-center gap-2">
                <Checkbox
                  id={`edit-channel-${c.id}`}
                  name="channelIds"
                  value={c.id}
                  defaultChecked={initialValues.channelIds.includes(c.id)}
                />
                <label htmlFor={`edit-channel-${c.id}`} className="cursor-pointer">
                  {c.platform} · {c.accountName}
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
        <FormSubmitButton label="Save changes" pendingLabel="Saving…" size="lg" />
        <Button variant="ghost" asChild>
          <a href={`/app/w/${workspaceSlug}/planning/${contentItemId}`}>Cancel</a>
        </Button>
      </div>
    </form>
  );
}
