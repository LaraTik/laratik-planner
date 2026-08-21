"use client";
import { useActionState } from "react";
import { batchCreateAction } from "../actions";
import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/forms/form-submit-button";

export function BatchForm({ slug }: { slug: string }) {
  const [state, action] = useActionState(
    batchCreateAction.bind(null, slug),
    {} as { error?: string },
  );
  return (
    <form action={action} className="space-y-4">
      <label className="text-body block font-semibold" htmlFor="rows">
        One idea per line
      </label>
      <textarea
        id="rows"
        name="rows"
        required
        rows={12}
        className="border-border bg-surface text-body w-full rounded-[var(--radius-control)] border p-3 font-mono"
        placeholder={
          "Launch teaser | short_form_video | 2026-09-01T09:00:00Z | Reveal the new collection\nBehind the scenes | story | 2026-09-03T12:00:00Z"
        }
      />
      {state?.error ? (
        <p role="alert" className="text-label text-danger font-semibold">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <FormSubmitButton label="Create drafts" pendingLabel="Creating…" />
        <Button variant="ghost" asChild>
          <a href={`/app/w/${slug}/planning`}>Cancel</a>
        </Button>
      </div>
    </form>
  );
}
