"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { updateContentItemAction } from "../../actions";

const initial: { error?: string } = {};

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

/**
 * Edit a draft / changes-requested idea. Pre-fills the values supplied
 * by the server and submits via `updateContentItemAction`. Server-side
 * errors render in the same danger-subtle card used elsewhere in the
 * app.
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

  // datetime-local needs YYYY-MM-DDTHH:mm, slice the ISO.
  const defaultPlanned = initialValues.plannedPublishAtIso.slice(0, 16);

  return (
    <form action={formAction} className="space-y-4">
      <FormField id="title" label="Title" hint="Short, descriptive." required>
        <Input
          type="text"
          name="title"
          required
          minLength={2}
          maxLength={200}
          defaultValue={initialValues.title}
        />
      </FormField>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField id="format" label="Format" required>
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
        <FormField id="plannedPublishAt" label="Planned publish" required>
          <Input
            type="datetime-local"
            name="plannedPublishAt"
            required
            defaultValue={defaultPlanned}
          />
        </FormField>
      </div>

      <FormField id="brief" label="Brief (optional)" hint="Goal, audience, key points.">
        <textarea
          name="brief"
          rows={4}
          maxLength={2000}
          defaultValue={initialValues.brief}
          placeholder="What's the message? Who's it for?"
          className="border-border bg-surface text-fg-primary text-body placeholder:text-fg-muted w-full rounded-[var(--radius-control)] border px-3 py-2"
        />
      </FormField>

      {channels.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-body text-fg-primary font-semibold">Channels</legend>
          <div className="border-border bg-surface grid grid-cols-1 gap-2 rounded-[var(--radius-control)] border p-3 md:grid-cols-2">
            {channels.map((c) => (
              <label key={c.id} className="text-body text-fg-primary flex items-center gap-2">
                <input
                  type="checkbox"
                  name="channelIds"
                  value={c.id}
                  defaultChecked={initialValues.channelIds.includes(c.id)}
                  className="h-4 w-4"
                />
                {c.platform} · {c.accountName}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {state?.error ? (
        <p role="alert" className="text-label text-danger font-semibold">
          {state.error}
        </p>
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
