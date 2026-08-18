"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { quickCreateAction } from "../actions";

const initial: { error?: string } = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} size="lg">
      {pending ? "Creating…" : "Create draft"}
    </Button>
  );
}

export function QuickCreateForm({
  workspaceSlug,
  channels,
}: {
  workspaceSlug: string;
  channels: { id: string; accountName: string; platform: string }[];
}) {
  const boundAction = quickCreateAction.bind(null, workspaceSlug);
  const [state, formAction] = useFormState(boundAction, initial);

  // Default the planned date to tomorrow 9am
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  const defaultPlanned = tomorrow.toISOString().slice(0, 16);

  return (
    <form action={formAction} className="space-y-4">
      <FormField id="title" label="Title" hint="Short, descriptive." required>
        <Input
          type="text"
          name="title"
          required
          minLength={2}
          maxLength={200}
          placeholder="Spring drop teaser"
        />
      </FormField>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField id="format" label="Format" required>
          <select
            name="format"
            required
            defaultValue="static_post"
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
          placeholder="What's the message? Who's it for?"
          className="border-border bg-surface text-fg-primary text-body placeholder:text-fg-muted w-full rounded-[var(--radius-control)] border px-3 py-2"
        />
      </FormField>

      {channels.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-body text-fg-primary font-semibold">
            Channels (default: all active)
          </legend>
          <div className="border-border bg-surface grid grid-cols-1 gap-2 rounded-[var(--radius-control)] border p-3 md:grid-cols-2">
            {channels.map((c) => (
              <label key={c.id} className="text-body text-fg-primary flex items-center gap-2">
                <input
                  type="checkbox"
                  name="channelIds"
                  value={c.id}
                  defaultChecked
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
        <SubmitButton />
        <Button variant="ghost" asChild>
          <a href={`/app/w/${workspaceSlug}/planning`}>Cancel</a>
        </Button>
      </div>
    </form>
  );
}
